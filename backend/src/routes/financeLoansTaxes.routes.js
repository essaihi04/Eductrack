/**
 * Comptabilité de gestion — Phase 3 : Prêts/leasing + Impôts.
 *  - Prêts : contrat + échéancier amorti auto ; payer une échéance écrit
 *    dans finance_ledger_entry (source_type='loan') sur le compte du prêt.
 *  - Impôts : obligations (IS acomptes, taxe pro, timbre, TVA...) ; payer
 *    écrit dans finance_ledger_entry (source_type='tax').
 * Les écritures alimentent le réel des dépenses de la matrice annuelle.
 *
 * Monté sur /api/finance (chemins /loans/*, /taxes/*).
 */
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireFinanceAccess } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);
router.use(requireFinanceAccess);

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.query.school_id || req.body.school_id || null;
  return req.user.school_id || null;
};
const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const ymFromDate = (dateStr) => {
  const d = new Date(dateStr);
  const year = d.getFullYear(); const month = d.getMonth() + 1;
  const academic_year = month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return { year, month, academic_year };
};

// Écrit (ou réécrit) une écriture de grand livre liée à une source.
async function postLedger(schoolId, accountId, dateStr, amount, sourceType, sourceId, label) {
  await supabaseAdmin.from('finance_ledger_entry').delete().eq('source_type', sourceType).eq('source_id', sourceId);
  if (!accountId || num(amount) === 0 || !dateStr) return;
  const { year, month, academic_year } = ymFromDate(dateStr);
  await supabaseAdmin.from('finance_ledger_entry').insert({
    school_id: schoolId, account_id: accountId, academic_year, year, month,
    amount: num(amount), source_type: sourceType, source_id: sourceId, label, entry_date: dateStr,
  });
}
async function clearLedger(sourceType, sourceId) {
  await supabaseAdmin.from('finance_ledger_entry').delete().eq('source_type', sourceType).eq('source_id', sourceId);
}

// Échéancier amorti (annuité fixe si taux > 0, sinon linéaire).
function buildSchedule(loan) {
  const n = Math.max(1, parseInt(loan.term_months, 10) || 1);
  const P = num(loan.principal);
  const r = (num(loan.annual_rate) / 100) / 12;
  const start = new Date(loan.start_date || new Date());
  const monthly = r > 0 ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
  const rows = []; let balance = P;
  for (let i = 0; i < n; i++) {
    const interest = r > 0 ? balance * r : 0;
    let principalPart = monthly - interest;
    if (i === n - 1) principalPart = balance; // la dernière absorbe l'arrondi
    const total = principalPart + interest;
    balance = round2(balance - principalPart);
    const due = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
    rows.push({
      seq: i + 1, due_date: due.toISOString().split('T')[0],
      principal_part: round2(principalPart), interest_part: round2(interest), total: round2(total), status: 'scheduled',
    });
  }
  return rows;
}

// ============================================================
// PRÊTS / LEASING
// ============================================================
router.get('/loans', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data, error } = await supabaseAdmin.from('finance_loan').select('*').eq('school_id', schoolId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ loans: data || [] });
  } catch (e) { console.error('GET loans:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.get('/loans/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: loan } = await supabaseAdmin.from('finance_loan').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!loan) return res.status(404).json({ error: 'Prêt introuvable' });
    const { data: schedule } = await supabaseAdmin.from('finance_loan_schedule').select('*').eq('loan_id', loan.id).order('seq');
    res.json({ loan, schedule: schedule || [] });
  } catch (e) { console.error('GET loan:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/loans', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { name, loan_type = 'loan', account_id = null, principal = 0, annual_rate = 0, start_date, term_months = 12 } = req.body;
    if (!name || !start_date) return res.status(400).json({ error: 'name, start_date requis' });
    const { data: loan, error } = await supabaseAdmin.from('finance_loan')
      .insert({ school_id: schoolId, name, loan_type, account_id, principal: num(principal), annual_rate: num(annual_rate), start_date, term_months: parseInt(term_months, 10) || 12 })
      .select().single();
    if (error) throw error;
    const rows = buildSchedule(loan).map((r) => ({ ...r, loan_id: loan.id, school_id: schoolId }));
    if (rows.length) await supabaseAdmin.from('finance_loan_schedule').insert(rows);
    const { data: schedule } = await supabaseAdmin.from('finance_loan_schedule').select('*').eq('loan_id', loan.id).order('seq');
    res.status(201).json({ loan, schedule: schedule || [] });
  } catch (e) { console.error('POST loan:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.delete('/loans/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: sched } = await supabaseAdmin.from('finance_loan_schedule').select('id').eq('loan_id', req.params.id).eq('school_id', schoolId);
    for (const s of (sched || [])) await clearLedger('loan', s.id);
    await supabaseAdmin.from('finance_loan').delete().eq('id', req.params.id).eq('school_id', schoolId);
    res.json({ success: true });
  } catch (e) { console.error('DELETE loan:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/loans/:id/schedule/:sid/pay', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: loan } = await supabaseAdmin.from('finance_loan').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!loan) return res.status(404).json({ error: 'Prêt introuvable' });
    const { data: sc } = await supabaseAdmin.from('finance_loan_schedule').select('*').eq('id', req.params.sid).eq('loan_id', loan.id).maybeSingle();
    if (!sc) return res.status(404).json({ error: 'Échéance introuvable' });
    await postLedger(schoolId, loan.account_id, sc.due_date, sc.total, 'loan', sc.id, `${loan.name} — échéance ${sc.seq}`);
    await supabaseAdmin.from('finance_loan_schedule').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', sc.id);
    res.json({ success: true });
  } catch (e) { console.error('pay schedule:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/loans/:id/schedule/:sid/unpay', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: sc } = await supabaseAdmin.from('finance_loan_schedule').select('id, loan_id').eq('id', req.params.sid).eq('school_id', schoolId).maybeSingle();
    if (!sc) return res.status(404).json({ error: 'Échéance introuvable' });
    await clearLedger('loan', sc.id);
    await supabaseAdmin.from('finance_loan_schedule').update({ status: 'scheduled', paid_at: null }).eq('id', sc.id);
    res.json({ success: true });
  } catch (e) { console.error('unpay schedule:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// ============================================================
// IMPÔTS & TAXES
// ============================================================
router.get('/taxes', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data, error } = await supabaseAdmin.from('finance_tax_obligation').select('*').eq('school_id', schoolId).order('due_date', { ascending: false });
    if (error) throw error;
    res.json({ taxes: data || [] });
  } catch (e) { console.error('GET taxes:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/taxes', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { account_id = null, tax_type = 'other', label, period_label, due_date, amount = 0 } = req.body;
    if (!label || !due_date) return res.status(400).json({ error: 'label, due_date requis' });
    const { data, error } = await supabaseAdmin.from('finance_tax_obligation')
      .insert({ school_id: schoolId, account_id, tax_type, label, period_label, due_date, amount: num(amount) })
      .select().single();
    if (error) throw error;
    res.status(201).json({ tax: data });
  } catch (e) { console.error('POST tax:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.delete('/taxes/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    await clearLedger('tax', req.params.id);
    await supabaseAdmin.from('finance_tax_obligation').delete().eq('id', req.params.id).eq('school_id', schoolId);
    res.json({ success: true });
  } catch (e) { console.error('DELETE tax:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/taxes/:id/pay', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: tax } = await supabaseAdmin.from('finance_tax_obligation').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!tax) return res.status(404).json({ error: 'Obligation introuvable' });
    await postLedger(schoolId, tax.account_id, tax.due_date, tax.amount, 'tax', tax.id, tax.label);
    await supabaseAdmin.from('finance_tax_obligation').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', tax.id);
    res.json({ success: true });
  } catch (e) { console.error('pay tax:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/taxes/:id/unpay', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: tax } = await supabaseAdmin.from('finance_tax_obligation').select('id').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!tax) return res.status(404).json({ error: 'Obligation introuvable' });
    await clearLedger('tax', tax.id);
    await supabaseAdmin.from('finance_tax_obligation').update({ status: 'pending', paid_at: null }).eq('id', tax.id);
    res.json({ success: true });
  } catch (e) { console.error('unpay tax:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

export default router;
