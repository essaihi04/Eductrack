/**
 * Comptabilité de gestion — Phase 1
 *  - Plan comptable configurable par école (finance_account)
 *  - Budget prévisionnel mensuel (finance_budget)
 *  - Rapport « Matrice annuelle » Prévisionnel / Réel (parité Excel)
 *
 * Monté sur /api/finance (en plus de finance.routes.js). Les chemins sont
 * distincts (/chart, /budget, /reports/annual-matrix) donc pas de collision.
 */
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireFinanceAccess } from '../middleware/auth.js';
import { seedDefaultChartOfAccounts, ensureChartSeeded } from '../services/financeChart.js';
import { planMonthlyForecast } from './finance.routes.js';

const router = express.Router();
router.use(authenticate);
router.use(requireFinanceAccess);

// ── Helpers (alignés sur finance.routes.js) ───────────────────────────────
const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.query.school_id || req.body.school_id || null;
  return req.user.school_id || null;
};
const isAdminRole = (req) => ['admin', 'school_admin', 'super_admin'].includes(req.user.role);
const requireAdmin = (req, res) => {
  if (!isAdminRole(req)) { res.status(403).json({ error: 'Réservé à l\'administration' }); return false; }
  return true;
};

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const getMonthName = (m) => MONTH_NAMES[m - 1] || '';
const ACADEMIC_MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const calendarYearFor = (academicYear, month) => {
  const parts = String(academicYear || '').split('-');
  const y1 = parseInt(parts[0], 10) || new Date().getFullYear();
  const y2 = parts[1] ? parseInt(parts[1], 10) : y1 + 1;
  return month >= 9 ? y1 : y2;
};
const monthOf = (isoDate) => new Date(isoDate).getMonth() + 1;
// Mois (1-12) déduit d'un libellé de période « Septembre 2025 » → 9.
const MONTH_INDEX = {}; MONTH_NAMES.forEach((n, i) => { MONTH_INDEX[n.toLowerCase()] = i + 1; });
const periodMonthOf = (label) => {
  if (!label) return null;
  return MONTH_INDEX[String(label).trim().split(/\s+/)[0].toLowerCase()] || null;
};
const arrFor = (mapByMonth) => ACADEMIC_MONTH_ORDER.map((m) => Number((mapByMonth && mapByMonth[m]) || 0));
const sumArr = (a, b) => a.map((v, i) => v + (b[i] || 0));
const zero12 = () => ACADEMIC_MONTH_ORDER.map(() => 0);

// Mapping catégorie facture -> flux de recette
const STREAM_OF_CATEGORY = { tuition: 'tuition', transport: 'transport', registration: 'fi', supplies: 'fr' };
const streamOfCategory = (c) => STREAM_OF_CATEGORY[c] || 'other';
// Mapping ancien enum dépense -> default_key (fallback si account_id absent)
const EXP_DEFAULT_OF_CATEGORY = {
  salaries: 'salaries_permanent', rent: 'rent', utilities: 'water_electricity',
  maintenance: 'premises_maintenance', equipment: 'equipment_it', taxes: 'is_acomptes',
  insurance: 'insurance_rc', transport: 'fuel_gasoil',
};

// ============================================================
// PLAN COMPTABLE (chart of accounts)
// ============================================================
router.get('/chart', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'school_id requis' });
    await ensureChartSeeded(schoolId);
    const { data, error } = await supabaseAdmin
      .from('finance_account')
      .select('*')
      .eq('school_id', schoolId)
      .order('sort_order');
    if (error) throw error;
    res.json({ accounts: data || [] });
  } catch (e) {
    console.error('GET /finance/chart:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

router.post('/chart', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const schoolId = getSchoolId(req);
    const { kind, node_type = 'line', name, parent_id = null, revenue_stream = null, cash_or_bank = 'mixed', sort_order = 500, code = null } = req.body;
    if (!schoolId || !kind || !name) return res.status(400).json({ error: 'kind, name requis' });
    if (!['revenue', 'expense'].includes(kind)) return res.status(400).json({ error: 'kind invalide' });
    const { data, error } = await supabaseAdmin
      .from('finance_account')
      .insert({ school_id: schoolId, kind, node_type, name, parent_id, revenue_stream, cash_or_bank, sort_order, code, is_system: false })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ account: data });
  } catch (e) {
    console.error('POST /finance/chart:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

router.put('/chart/:id', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const schoolId = getSchoolId(req);
    const { id } = req.params;
    const { data: acc } = await supabaseAdmin
      .from('finance_account').select('*').eq('id', id).eq('school_id', schoolId).maybeSingle();
    if (!acc) return res.status(404).json({ error: 'Compte introuvable' });
    // Champs modifiables (le « kind » est figé ; les postes système restent renommables/désactivables)
    const patch = {};
    for (const f of ['name', 'sort_order', 'is_active', 'cash_or_bank', 'revenue_stream', 'parent_id', 'code']) {
      if (req.body[f] !== undefined) patch[f] = req.body[f];
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('finance_account').update(patch).eq('id', id).eq('school_id', schoolId).select().single();
    if (error) throw error;
    res.json({ account: data });
  } catch (e) {
    console.error('PUT /finance/chart/:id:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

router.delete('/chart/:id', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const schoolId = getSchoolId(req);
    const { id } = req.params;
    const { data: acc } = await supabaseAdmin
      .from('finance_account').select('id, is_system').eq('id', id).eq('school_id', schoolId).maybeSingle();
    if (!acc) return res.status(404).json({ error: 'Compte introuvable' });
    if (acc.is_system) return res.status(409).json({ error: 'Poste par défaut : désactivez-le au lieu de le supprimer.' });
    // Refus si utilisé (budget, dépenses, ou comptes enfants)
    const [{ count: budgetCount }, { count: expenseCount }, { count: childCount }] = await Promise.all([
      supabaseAdmin.from('finance_budget').select('id', { count: 'exact', head: true }).eq('account_id', id),
      supabaseAdmin.from('school_expenses').select('id', { count: 'exact', head: true }).eq('account_id', id),
      supabaseAdmin.from('finance_account').select('id', { count: 'exact', head: true }).eq('parent_id', id),
    ]);
    if ((budgetCount || 0) + (expenseCount || 0) + (childCount || 0) > 0) {
      return res.status(409).json({ error: 'Poste utilisé (budget / dépenses / sous-postes) : désactivez-le.' });
    }
    const { error } = await supabaseAdmin.from('finance_account').delete().eq('id', id).eq('school_id', schoolId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /finance/chart/:id:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// Ajoute les postes du catalogue qui manquent (sans écraser les perso)
router.post('/chart/sync-defaults', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const schoolId = getSchoolId(req);
    const added = await seedDefaultChartOfAccounts(schoolId);
    res.json({ success: true, added });
  } catch (e) {
    console.error('POST /finance/chart/sync-defaults:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// ============================================================
// BUDGET (Prévisionnel)
// ============================================================
router.get('/budget', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const academicYear = req.query.academic_year;
    if (!schoolId || !academicYear) return res.status(400).json({ error: 'academic_year requis' });
    await ensureChartSeeded(schoolId);
    const [{ data: accounts }, { data: budget }] = await Promise.all([
      supabaseAdmin.from('finance_account').select('*').eq('school_id', schoolId).order('sort_order'),
      supabaseAdmin.from('finance_budget').select('account_id, month, amount').eq('school_id', schoolId).eq('academic_year', academicYear),
    ]);
    res.json({ accounts: accounts || [], budget: budget || [], academic_year: academicYear, month_order: ACADEMIC_MONTH_ORDER });
  } catch (e) {
    console.error('GET /finance/budget:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

router.put('/budget', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { academic_year, rows } = req.body;
    if (!schoolId || !academic_year || !Array.isArray(rows)) return res.status(400).json({ error: 'academic_year, rows requis' });
    const payload = rows
      .filter((r) => r.account_id && r.month >= 1 && r.month <= 12)
      .map((r) => ({ school_id: schoolId, academic_year, account_id: r.account_id, month: r.month, amount: Number(r.amount) || 0, updated_at: new Date().toISOString() }));
    if (payload.length === 0) return res.json({ success: true, saved: 0 });
    const { error } = await supabaseAdmin
      .from('finance_budget')
      .upsert(payload, { onConflict: 'school_id,academic_year,account_id,month' });
    if (error) throw error;
    res.json({ success: true, saved: payload.length });
  } catch (e) {
    console.error('PUT /finance/budget:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

router.post('/budget/copy-previous-year', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { academic_year } = req.body;
    if (!schoolId || !academic_year) return res.status(400).json({ error: 'academic_year requis' });
    const [y1] = String(academic_year).split('-').map((x) => parseInt(x, 10));
    const prevYear = `${y1 - 1}-${y1}`;
    const { data: prev } = await supabaseAdmin
      .from('finance_budget').select('account_id, month, amount')
      .eq('school_id', schoolId).eq('academic_year', prevYear);
    if (!prev || prev.length === 0) return res.json({ success: true, copied: 0 });
    const payload = prev.map((r) => ({ school_id: schoolId, academic_year, account_id: r.account_id, month: r.month, amount: r.amount, updated_at: new Date().toISOString() }));
    const { error } = await supabaseAdmin.from('finance_budget').upsert(payload, { onConflict: 'school_id,academic_year,account_id,month' });
    if (error) throw error;
    res.json({ success: true, copied: payload.length });
  } catch (e) {
    console.error('POST /finance/budget/copy-previous-year:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// ============================================================
// RAPPORT — MATRICE ANNUELLE (Prévisionnel / Réel)
// ============================================================
router.get('/reports/annual-matrix', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const academicYear = req.query.academic_year;
    if (!schoolId || !academicYear) return res.status(400).json({ error: 'academic_year requis' });
    await ensureChartSeeded(schoolId);

    const parts = String(academicYear).split('-');
    const y1 = parseInt(parts[0], 10);
    const y2 = parts[1] ? parseInt(parts[1], 10) : y1 + 1;
    const startDate = `${y1}-09-01`;
    const endDate = `${y2}-08-31`;

    const now = new Date(); const curY = now.getFullYear(); const curM = now.getMonth() + 1;
    const months = ACADEMIC_MONTH_ORDER.map((m) => {
      const y = calendarYearFor(academicYear, m);
      return { month: m, year: y, label: `${getMonthName(m)} ${y}`, is_real: (y < curY) || (y === curY && m <= curM) };
    });

    // --- Comptes + budget ---
    const [{ data: accounts }, { data: budgetRows }] = await Promise.all([
      supabaseAdmin.from('finance_account').select('*').eq('school_id', schoolId).order('sort_order'),
      supabaseAdmin.from('finance_budget').select('account_id, month, amount').eq('school_id', schoolId).eq('academic_year', academicYear),
    ]);
    const budget = {};
    (budgetRows || []).forEach((b) => { (budget[b.account_id] = budget[b.account_id] || {})[b.month] = Number(b.amount) || 0; });
    const defaultKeyToId = {};
    (accounts || []).forEach((a) => { if (a.default_key) defaultKeyToId[a.default_key] = a.id; });

    // --- Recettes : facturé (CA) + encaissé ---
    // Réel ventilé par MOIS DE LA MENSUALITÉ (period_label), pas par date
    // d'émission/paiement : la scolarité de septembre reste en septembre même si
    // la facture a été générée en bloc plus tard. Repli sur la date si pas de période.
    const { data: invs } = await supabaseAdmin
      .from('invoices').select('id, issue_date, period_label, status')
      .eq('school_id', schoolId).neq('status', 'cancelled')
      .gte('issue_date', startDate).lte('issue_date', endDate);
    const invMonth = {}; (invs || []).forEach((i) => { invMonth[i.id] = periodMonthOf(i.period_label) || monthOf(i.issue_date); });
    const invIds = (invs || []).map((i) => i.id);

    let lines = [];
    if (invIds.length) {
      const { data: ld } = await supabaseAdmin.from('invoice_lines').select('invoice_id, category, amount').in('invoice_id', invIds);
      lines = ld || [];
    }
    const billed = {}; const linesByInvoice = {};
    lines.forEach((l) => {
      (linesByInvoice[l.invoice_id] = linesByInvoice[l.invoice_id] || []).push(l);
      const m = invMonth[l.invoice_id]; if (!m) return;
      const s = streamOfCategory(l.category);
      (billed[s] = billed[s] || {})[m] = (billed[s][m] || 0) + Number(l.amount || 0);
    });

    const { data: pays } = await supabaseAdmin
      .from('payments').select('invoice_id, amount, payment_date')
      .eq('school_id', schoolId).eq('status', 'confirmed')
      .gte('payment_date', startDate).lte('payment_date', endDate);
    const collected = {};
    const addCollected = (s, m, v) => { (collected[s] = collected[s] || {})[m] = (collected[s][m] || 0) + v; };
    (pays || []).forEach((p) => {
      const m = (p.invoice_id && invMonth[p.invoice_id]) || monthOf(p.payment_date); const amt = Number(p.amount || 0);
      const il = p.invoice_id ? linesByInvoice[p.invoice_id] : null;
      if (il && il.length) {
        const tot = il.reduce((s, x) => s + Number(x.amount || 0), 0);
        if (tot > 0) il.forEach((x) => addCollected(streamOfCategory(x.category), m, amt * (Number(x.amount || 0) / tot)));
        else addCollected('other', m, amt);
      } else {
        addCollected('other', m, amt);
      }
    });

    // --- Dépenses réelles ---
    const { data: exps } = await supabaseAdmin
      .from('school_expenses').select('account_id, category, amount, expense_date')
      .eq('school_id', schoolId).gte('expense_date', startDate).lte('expense_date', endDate);
    const actualExp = {};
    (exps || []).forEach((e) => {
      let accId = e.account_id;
      if (!accId) accId = defaultKeyToId[EXP_DEFAULT_OF_CATEGORY[e.category] || 'misc'];
      if (!accId) return;
      const m = monthOf(e.expense_date);
      (actualExp[accId] = actualExp[accId] || {})[m] = (actualExp[accId][m] || 0) + Number(e.amount || 0);
    });

    // Union avec le grand livre (paie comptabilisée, et plus tard prêts/impôts)
    const { data: ledger } = await supabaseAdmin
      .from('finance_ledger_entry')
      .select('account_id, month, amount')
      .eq('school_id', schoolId)
      .eq('academic_year', academicYear);
    (ledger || []).forEach((l) => {
      if (!l.account_id || !l.month) return;
      (actualExp[l.account_id] = actualExp[l.account_id] || {})[l.month] = (actualExp[l.account_id][l.month] || 0) + Number(l.amount || 0);
    });

    // --- Prévisionnel des recettes : projeté depuis les PLANS DE FRAIS ---
    // (mêmes montants attendus que le dashboard) — remplace le budget manuel
    // pour les recettes, et alimente les mois à venir + la colonne « Budget ».
    const forecastByCat = await planMonthlyForecast(schoolId, academicYear);
    const forecastByStream = {};
    Object.entries(forecastByCat).forEach(([cat, byMonth]) => {
      const s = streamOfCategory(cat);
      const dst = (forecastByStream[s] = forecastByStream[s] || {});
      Object.entries(byMonth).forEach(([m, amt]) => { dst[m] = (dst[m] || 0) + Number(amt || 0); });
    });

    // --- Assemblage ---
    const revenueLineAccounts = (accounts || []).filter((a) => a.kind === 'revenue' && a.node_type === 'line' && a.is_active);
    const expenseSections = (accounts || []).filter((a) => a.kind === 'expense' && a.node_type === 'section');
    const expenseLines = (accounts || []).filter((a) => a.kind === 'expense' && a.node_type === 'line' && a.is_active);

    // Recettes (encaissements) + impayés par flux
    const encaissements = revenueLineAccounts.map((a) => {
      const s = a.revenue_stream;
      return {
        id: a.id, name: a.name, revenue_stream: s,
        actual: arrFor(collected[s]),
        budget: arrFor(forecastByStream[s]),
        billed: arrFor(billed[s]),
        impayes: ACADEMIC_MONTH_ORDER.map((m) => Number((billed[s] && billed[s][m]) || 0) - Number((collected[s] && collected[s][m]) || 0)),
      };
    });
    const encaissementsTotal = encaissements.reduce((acc, l) => sumArr(acc, l.actual), zero12());
    const billedTotal = encaissements.reduce((acc, l) => sumArr(acc, l.billed), zero12());
    const impayesTotal = encaissements.reduce((acc, l) => sumArr(acc, l.impayes), zero12());
    const revenueBudgetTotal = encaissements.reduce((acc, l) => sumArr(acc, l.budget), zero12());

    // Dépenses par section -> lignes
    const sections = expenseSections.map((sec) => {
      const secLines = expenseLines.filter((l) => l.parent_id === sec.id).map((a) => ({
        id: a.id, name: a.name,
        actual: arrFor(actualExp[a.id]),
        budget: arrFor(budget[a.id]),
      }));
      const subtotalActual = secLines.reduce((acc, l) => sumArr(acc, l.actual), zero12());
      const subtotalBudget = secLines.reduce((acc, l) => sumArr(acc, l.budget), zero12());
      return { id: sec.id, name: sec.name, lines: secLines, subtotal: { actual: subtotalActual, budget: subtotalBudget } };
    });
    // Lignes de dépense orphelines (sans section) -> Divers
    const orphanLines = expenseLines.filter((l) => !expenseSections.some((s) => s.id === l.parent_id));
    if (orphanLines.length) {
      const ol = orphanLines.map((a) => ({ id: a.id, name: a.name, actual: arrFor(actualExp[a.id]), budget: arrFor(budget[a.id]) }));
      sections.push({
        id: 'orphans', name: 'Autres dépenses', lines: ol,
        subtotal: { actual: ol.reduce((acc, l) => sumArr(acc, l.actual), zero12()), budget: ol.reduce((acc, l) => sumArr(acc, l.budget), zero12()) },
      });
    }
    const expenseTotalActual = sections.reduce((acc, s) => sumArr(acc, s.subtotal.actual), zero12());
    const expenseTotalBudget = sections.reduce((acc, s) => sumArr(acc, s.subtotal.budget), zero12());

    // Résultat (CA - Dépenses)
    const resultActual = billedTotal.map((ca, i) => ca - expenseTotalActual[i]);
    const resultBudget = revenueBudgetTotal.map((ca, i) => ca - expenseTotalBudget[i]);

    res.json({
      academic_year: academicYear,
      months,
      revenue: {
        encaissements,
        totals: { encaissements: encaissementsTotal, impayes: impayesTotal, ca: billedTotal, ca_budget: revenueBudgetTotal },
      },
      expenses: {
        sections,
        total: { actual: expenseTotalActual, budget: expenseTotalBudget },
      },
      result: { actual: resultActual, budget: resultBudget },
    });
  } catch (e) {
    console.error('GET /finance/reports/annual-matrix:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

export default router;
