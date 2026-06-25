/**
 * Comptabilité de gestion — Phase 4 : Import relevé bancaire + rapprochement.
 *  - Upload d'un relevé PDF -> extraction du texte (pdf-parse v2) -> lignes
 *    candidates (date, libellé, montant) que l'admin revoit.
 *  - Règles de catégorisation (mot-clé -> compte) appliquées automatiquement.
 *  - Une transaction « débit » postée écrit dans finance_ledger_entry
 *    (source_type='expense') -> alimente le réel des dépenses de la matrice.
 *  - Clôture mensuelle (finance_month_close).
 *
 * Monté sur /api/finance (chemins /bank/*, /month-close).
 */
import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireFinanceAccess } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);
router.use(requireFinanceAccess);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.query.school_id || req.body.school_id || null;
  return req.user.school_id || null;
};
const num = (v) => Number(v) || 0;
const ymFromDate = (dateStr) => {
  const d = new Date(dateStr); const year = d.getFullYear(); const month = d.getMonth() + 1;
  return { year, month, academic_year: month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}` };
};

const deepseekChat = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
});

// ── 1) OCR DeepSeek : PDF/image -> texte propre ───────────────────────────
async function ocrTextFromBuffer(buffer, filename) {
  const key = process.env.DEEPSEEK_OCR_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!key) return '';
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename || 'releve.pdf');
    form.append('prompt', "Extract the full bank statement as plain text. Keep every transaction line on one line with its date, label and amount. Preserve tables and columns.");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    const res = await fetch('https://api.deepsee-ocr.ai/v1/ocr', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      body: form,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) { console.warn('[bank] OCR HTTP', res.status); return ''; }
    const data = await res.json();
    return (data?.text || '').trim();
  } catch (e) {
    console.warn('[bank] OCR DeepSeek échoué:', e.message);
    return '';
  }
}

// Repli : extraction texte locale via pdf-parse
async function pdfTextFromBuffer(buffer) {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result?.text || '';
  } catch (e) {
    console.warn('[bank] extraction pdf-parse échouée:', e.message);
    return '';
  }
}

// ── 2a) Structuration LLM : texte du relevé -> lignes normalisées ─────────
async function structureTransactionsWithLLM(text) {
  if (!process.env.DEEPSEEK_API_KEY || !text) return null;
  const sample = text.slice(0, 18_000);
  try {
    const completion = await deepseekChat.chat.completions.create({
      model: 'deepseek-chat',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: "Tu extrais les opérations d'un relevé bancaire (souvent marocain). Réponds UNIQUEMENT en JSON {\"transactions\":[{\"txn_date\":\"YYYY-MM-DD\",\"label\":\"...\",\"amount\":<nombre positif>,\"direction\":\"debit|credit\"}]}. 'debit' = sortie d'argent (dépense), 'credit' = entrée. Ignore les lignes de solde, totaux et en-têtes. Montant toujours positif. N'invente rien." },
        { role: 'user', content: sample },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed.transactions || []);
    return arr
      .map((t) => ({
        txn_date: /^\d{4}-\d{2}-\d{2}$/.test(t.txn_date) ? t.txn_date : null,
        label: String(t.label || 'Opération').slice(0, 180),
        amount: Math.abs(num(t.amount)),
        direction: t.direction === 'credit' ? 'credit' : 'debit',
      }))
      .filter((t) => t.txn_date && t.amount > 0);
  } catch (e) {
    console.warn('[bank] structuration LLM échouée:', e.message);
    return null;
  }
}

// ── 2b) Repli : parsing par regex sur le texte ────────────────────────────
function parseTransactionsFromText(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const dateRe = /(\d{2})[\/\-.](\d{2})[\/\-.](\d{2,4})/;
  // montant : 1 234,56 / 1.234,56 / 1234.56
  const amountRe = /(\d{1,3}(?:[ .]\d{3})*[.,]\d{2})(?!\d)/g;
  const out = [];
  for (const line of lines) {
    const dm = line.match(dateRe);
    if (!dm) continue;
    const amounts = [...line.matchAll(amountRe)].map((m) => m[1]);
    if (amounts.length === 0) continue;
    const raw = amounts[amounts.length - 1];
    const amount = Number(raw.replace(/[ .]/g, (c) => (c === ' ' ? '' : '')).replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || Number(raw.replace(/\s/g, '').replace(/\.(\d{3})/g, '$1').replace(',', '.')) || 0;
    let [, dd, mm, yy] = dm; if (yy.length === 2) yy = '20' + yy;
    const label = line.replace(dateRe, '').replace(amountRe, '').replace(/\s{2,}/g, ' ').trim().slice(0, 180);
    out.push({ txn_date: `${yy}-${mm}-${dd}`, label: label || 'Opération', amount: Math.abs(amount), direction: 'debit' });
  }
  return out;
}

/**
 * Extraction des transactions d'un relevé. La plupart des relevés sont des
 * PDF « texte » : on lit le texte localement (pdf-parse) puis on le structure
 * en lignes de dépenses via DeepSeek (DEEPSEEK_API_KEY). Si le PDF n'a pas de
 * couche texte (scanné/image), on bascule sur l'OCR. Repli regex en dernier
 * recours. Renvoie { transactions, method }.
 */
async function extractTransactions(buffer, filename) {
  // 1) PDF texte (cas le plus fréquent) -> extraction locale gratuite
  let text = await pdfTextFromBuffer(buffer);
  let source = text.trim().length > 40 ? 'pdf' : '';

  // 2) PDF scanné / sans texte exploitable -> OCR (service dédié)
  if (!source) { text = await ocrTextFromBuffer(buffer, filename); source = text ? 'ocr' : ''; }
  if (!text) return { transactions: [], method: 'none' };

  // 3) Structuration en lignes de dépenses via DeepSeek
  const structured = await structureTransactionsWithLLM(text);
  if (structured && structured.length) return { transactions: structured, method: `${source}+ia` };

  // 4) Repli : parsing par regex
  return { transactions: parseTransactionsFromText(text), method: source || 'pdf' };
}

// ── Catégorisation IA : affecte chaque débit au poste le plus probable ────
// du plan comptable de l'école, sans aucune règle à saisir. N'écrase jamais
// une ligne déjà affectée (par une règle manuelle) ou comptabilisée/ignorée.
async function aiCategorizeTransactions(schoolId, transactions) {
  if (!process.env.DEEPSEEK_API_KEY) return transactions;
  const todo = transactions.filter((t) => t.direction === 'debit' && !t.account_id && t.status !== 'posted' && t.status !== 'ignored');
  if (!todo.length) return transactions;

  const { data: accounts } = await supabaseAdmin.from('finance_account')
    .select('id, name, kind, node_type, is_active, parent_id').eq('school_id', schoolId);
  const sections = (accounts || []).filter((a) => a.kind === 'expense' && a.node_type === 'section');
  const lines = (accounts || []).filter((a) => a.kind === 'expense' && a.node_type === 'line' && a.is_active);
  if (!lines.length) return transactions;
  const sectionName = (pid) => sections.find((s) => s.id === pid)?.name || '';
  const valid = new Set(lines.map((l) => l.id));
  const catalogue = lines.map((l) => `${l.id} = ${sectionName(l.parent_id)} > ${l.name}`).join('\n');
  const items = todo.map((t, i) => `${i}. ${t.label} (${t.amount})`).join('\n');

  try {
    const completion = await deepseekChat.chat.completions.create({
      model: 'deepseek-chat',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: "Tu affectes des opérations bancaires de débit (dépenses d'une école marocaine) au poste comptable le plus pertinent. Réponds UNIQUEMENT en JSON {\"assignments\":[{\"i\":<index>,\"account_id\":\"<id exact de la liste ou null>\"}]}. Utilise UNIQUEMENT des id présents dans la liste fournie. Si aucun poste ne correspond clairement, mets null. Exemples : gasoil/carburant -> transport/carburant, CNSS/AMO -> charges sociales, loyer -> loyer, salaire -> masse salariale, ONEE/électricité/eau -> utilities, internet/télécom -> télécommunications." },
        { role: 'user', content: `POSTES DISPONIBLES (id = section > nom) :\n${catalogue}\n\nOPÉRATIONS À CLASSER :\n${items}` },
      ],
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    const map = new Map();
    (parsed.assignments || []).forEach((a) => { if (valid.has(a.account_id)) map.set(Number(a.i), a.account_id); });
    let idx = 0;
    return transactions.map((t) => {
      if (t.direction === 'debit' && !t.account_id && t.status !== 'posted' && t.status !== 'ignored') {
        const accId = map.get(idx); idx += 1;
        if (accId) return { ...t, account_id: accId, status: 'categorized' };
      }
      return t;
    });
  } catch (e) {
    console.warn('[bank] catégorisation IA échouée:', e.message);
    return transactions;
  }
}

async function applyRulesTo(schoolId, transactions) {
  const { data: rules } = await supabaseAdmin.from('bank_categorization_rule')
    .select('*').eq('school_id', schoolId).eq('is_active', true).order('priority');
  if (!rules || rules.length === 0) return transactions;
  return transactions.map((t) => {
    if (t.account_id || t.status === 'posted' || t.status === 'ignored') return t;
    const lbl = (t.label || '').toLowerCase();
    for (const r of rules) {
      if (r.direction && r.direction !== t.direction) continue;
      let hit = false;
      try {
        hit = r.match_type === 'regex' ? new RegExp(r.pattern, 'i').test(t.label || '') : lbl.includes((r.pattern || '').toLowerCase());
      } catch { hit = false; }
      if (hit && r.account_id) return { ...t, account_id: r.account_id, status: 'categorized' };
    }
    return t;
  });
}

// ============================================================
// RELEVÉS
// ============================================================
router.get('/bank/statements', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data, error } = await supabaseAdmin.from('bank_statement').select('*').eq('school_id', schoolId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ statements: data || [] });
  } catch (e) { console.error('GET statements:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.get('/bank/statements/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: statement } = await supabaseAdmin.from('bank_statement').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!statement) return res.status(404).json({ error: 'Relevé introuvable' });
    const { data: transactions } = await supabaseAdmin.from('bank_transaction').select('*').eq('statement_id', statement.id).order('txn_date');
    res.json({ statement, transactions: transactions || [] });
  } catch (e) { console.error('GET statement:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/bank/statements', upload.single('file'), async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { account_label, period_start, period_end, opening_balance, closing_balance } = req.body;
    const { data: statement, error } = await supabaseAdmin.from('bank_statement').insert({
      school_id: schoolId, account_label: account_label || 'Banque',
      period_start: period_start || null, period_end: period_end || null,
      opening_balance: opening_balance != null ? num(opening_balance) : null,
      closing_balance: closing_balance != null ? num(closing_balance) : null,
      source_filename: req.file?.originalname || null, imported_by: req.user.id,
    }).select().single();
    if (error) throw error;

    let candidates = [];
    let method = 'none';
    if (req.file?.buffer) {
      const r = await extractTransactions(req.file.buffer, req.file.originalname);
      candidates = r.transactions; method = r.method;
    }
    candidates = await applyRulesTo(schoolId, candidates);
    candidates = await aiCategorizeTransactions(schoolId, candidates);
    let inserted = [];
    if (candidates.length) {
      const rows = candidates.map((t) => ({ ...t, school_id: schoolId, statement_id: statement.id }));
      const { data } = await supabaseAdmin.from('bank_transaction').insert(rows).select();
      inserted = data || [];
    }
    res.status(201).json({ statement, transactions: inserted, parsed: candidates.length, method });
  } catch (e) { console.error('POST statement:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.delete('/bank/statements/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: txns } = await supabaseAdmin.from('bank_transaction').select('id').eq('statement_id', req.params.id).eq('school_id', schoolId);
    for (const t of (txns || [])) await supabaseAdmin.from('school_expenses').delete().eq('school_id', schoolId).eq('reference', bankRef(t.id));
    await supabaseAdmin.from('bank_statement').delete().eq('id', req.params.id).eq('school_id', schoolId);
    res.json({ success: true });
  } catch (e) { console.error('DELETE statement:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/bank/statements/:id/apply-rules', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: txns } = await supabaseAdmin.from('bank_transaction').select('*').eq('statement_id', req.params.id).eq('school_id', schoolId);
    let updated = await applyRulesTo(schoolId, txns || []);
    updated = await aiCategorizeTransactions(schoolId, updated);
    let count = 0;
    for (const t of updated) {
      const orig = (txns || []).find((x) => x.id === t.id);
      if (orig && (orig.account_id !== t.account_id || orig.status !== t.status)) {
        await supabaseAdmin.from('bank_transaction').update({ account_id: t.account_id, status: t.status }).eq('id', t.id);
        count += 1;
      }
    }
    res.json({ success: true, updated: count });
  } catch (e) { console.error('apply-rules:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// ============================================================
// TRANSACTIONS
// ============================================================
router.put('/bank/transactions/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const patch = {};
    for (const f of ['account_id', 'direction', 'status', 'label', 'amount', 'txn_date', 'matched_payment_id']) {
      if (req.body[f] !== undefined) patch[f] = f === 'amount' ? num(req.body[f]) : req.body[f];
    }
    const { data, error } = await supabaseAdmin.from('bank_transaction').update(patch).eq('id', req.params.id).eq('school_id', schoolId).select().single();
    if (error) throw error;
    res.json({ transaction: data });
  } catch (e) { console.error('PUT transaction:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// Un débit bancaire comptabilisé devient une dépense réelle dans
// school_expenses (table lue par la page « Dépenses et charges » ET par la
// matrice Prévisionnel/Réel). On lie la dépense à la ligne bancaire via
// reference = 'BANK:<txn_id>' pour pouvoir la retrouver (dé-comptabiliser /
// supprimer).
const bankRef = (txnId) => `BANK:${txnId}`;

async function postTxn(schoolId, t, userId = null) {
  await supabaseAdmin.from('school_expenses').delete().eq('school_id', schoolId).eq('reference', bankRef(t.id));
  if (t.direction !== 'debit' || !t.account_id || num(t.amount) === 0 || !t.txn_date) return false;
  await supabaseAdmin.from('school_expenses').insert({
    school_id: schoolId, account_id: t.account_id, category: 'other',
    description: (t.label || 'Relevé bancaire').slice(0, 200), amount: num(t.amount),
    expense_date: t.txn_date, payment_method: 'transfer', reference: bankRef(t.id),
    notes: 'Importé du relevé bancaire', recorded_by: userId,
  });
  return true;
}

router.post('/bank/transactions/:id/post', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: t } = await supabaseAdmin.from('bank_transaction').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
    if (t.direction !== 'debit') return res.status(400).json({ error: 'Seuls les débits se comptabilisent en dépense.' });
    if (!t.account_id) return res.status(400).json({ error: 'Affectez un poste avant de comptabiliser.' });
    await postTxn(schoolId, t, req.user.id);
    await supabaseAdmin.from('bank_transaction').update({ status: 'posted' }).eq('id', t.id);
    res.json({ success: true });
  } catch (e) { console.error('post txn:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/bank/transactions/:id/unpost', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    await supabaseAdmin.from('school_expenses').delete().eq('school_id', schoolId).eq('reference', bankRef(req.params.id));
    await supabaseAdmin.from('bank_transaction').update({ status: 'categorized' }).eq('id', req.params.id).eq('school_id', schoolId);
    res.json({ success: true });
  } catch (e) { console.error('unpost txn:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/bank/statements/:id/post-all', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: txns } = await supabaseAdmin.from('bank_transaction').select('*')
      .eq('statement_id', req.params.id).eq('school_id', schoolId).eq('direction', 'debit').not('account_id', 'is', null).neq('status', 'ignored');
    let count = 0;
    for (const t of (txns || [])) {
      if (await postTxn(schoolId, t, req.user.id)) { await supabaseAdmin.from('bank_transaction').update({ status: 'posted' }).eq('id', t.id); count += 1; }
    }
    res.json({ success: true, posted: count });
  } catch (e) { console.error('post-all:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// ============================================================
// RÈGLES DE CATÉGORISATION
// ============================================================
router.get('/bank/rules', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data, error } = await supabaseAdmin.from('bank_categorization_rule').select('*').eq('school_id', schoolId).order('priority');
    if (error) throw error;
    res.json({ rules: data || [] });
  } catch (e) { console.error('GET rules:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/bank/rules', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { pattern, match_type = 'contains', direction = 'debit', account_id, priority = 100 } = req.body;
    if (!pattern || !account_id) return res.status(400).json({ error: 'pattern, account_id requis' });
    const { data, error } = await supabaseAdmin.from('bank_categorization_rule')
      .insert({ school_id: schoolId, pattern, match_type, direction, account_id, priority }).select().single();
    if (error) throw error;
    res.status(201).json({ rule: data });
  } catch (e) { console.error('POST rule:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.put('/bank/rules/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const patch = {};
    for (const f of ['pattern', 'match_type', 'direction', 'account_id', 'priority', 'is_active']) if (req.body[f] !== undefined) patch[f] = req.body[f];
    const { data, error } = await supabaseAdmin.from('bank_categorization_rule').update(patch).eq('id', req.params.id).eq('school_id', schoolId).select().single();
    if (error) throw error;
    res.json({ rule: data });
  } catch (e) { console.error('PUT rule:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.delete('/bank/rules/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    await supabaseAdmin.from('bank_categorization_rule').delete().eq('id', req.params.id).eq('school_id', schoolId);
    res.json({ success: true });
  } catch (e) { console.error('DELETE rule:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// ============================================================
// CLÔTURE MENSUELLE
// ============================================================
router.get('/month-close', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin.from('finance_month_close').select('*').eq('school_id', schoolId);
    if (req.query.academic_year) q = q.eq('academic_year', req.query.academic_year);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ closes: data || [] });
  } catch (e) { console.error('GET month-close:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/month-close', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { academic_year, month, status = 'closed' } = req.body;
    if (!academic_year || !month) return res.status(400).json({ error: 'academic_year, month requis' });
    if (status === 'open') {
      await supabaseAdmin.from('finance_month_close').delete().eq('school_id', schoolId).eq('academic_year', academic_year).eq('month', month);
      return res.json({ success: true, status: 'open' });
    }
    const { error } = await supabaseAdmin.from('finance_month_close')
      .upsert({ school_id: schoolId, academic_year, month, status: 'closed', closed_at: new Date().toISOString(), closed_by: req.user.id }, { onConflict: 'school_id,academic_year,month' });
    if (error) throw error;
    res.json({ success: true, status: 'closed' });
  } catch (e) { console.error('POST month-close:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

export default router;
