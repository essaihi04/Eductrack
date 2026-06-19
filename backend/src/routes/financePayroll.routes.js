/**
 * Comptabilité de gestion — Phase 2 : Paie
 *  - Employés (permanents / vacataires)
 *  - Bulletins de paie mensuels (run + lignes par employé)
 *  - Comptabilisation : un run « posté » écrit dans finance_ledger_entry
 *    sur les comptes Masse salariale (salaries_permanent, cnss_amo, ir),
 *    ce que la matrice annuelle agrège dans le réel des dépenses.
 *
 * Monté sur /api/finance (chemins /payroll/*).
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
const academicYearForDate = (year, month) => (month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`);
const num = (v) => Number(v) || 0;

// Comptes Masse salariale de l'école (par default_key)
async function masseSalarialeAccounts(schoolId) {
  const { data } = await supabaseAdmin
    .from('finance_account')
    .select('id, default_key')
    .eq('school_id', schoolId)
    .in('default_key', ['salaries_permanent', 'cnss_amo', 'ir']);
  const map = {};
  (data || []).forEach((a) => { map[a.default_key] = a.id; });
  return map;
}

// ============================================================
// EMPLOYÉS
// ============================================================
router.get('/payroll/employees', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data, error } = await supabaseAdmin
      .from('finance_employee').select('*').eq('school_id', schoolId)
      .order('is_active', { ascending: false }).order('full_name');
    if (error) throw error;
    res.json({ employees: data || [] });
  } catch (e) { console.error('GET employees:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/payroll/employees', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { full_name, role_label, employment_type = 'permanent', base_salary = 0, cnss_number } = req.body;
    if (!full_name) return res.status(400).json({ error: 'Nom requis' });
    const { data, error } = await supabaseAdmin.from('finance_employee')
      .insert({ school_id: schoolId, full_name, role_label, employment_type, base_salary: num(base_salary), cnss_number })
      .select().single();
    if (error) throw error;
    res.status(201).json({ employee: data });
  } catch (e) { console.error('POST employee:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.put('/payroll/employees/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const patch = {};
    for (const f of ['full_name', 'role_label', 'employment_type', 'base_salary', 'cnss_number', 'is_active']) {
      if (req.body[f] !== undefined) patch[f] = f === 'base_salary' ? num(req.body[f]) : req.body[f];
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('finance_employee')
      .update(patch).eq('id', req.params.id).eq('school_id', schoolId).select().single();
    if (error) throw error;
    res.json({ employee: data });
  } catch (e) { console.error('PUT employee:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.delete('/payroll/employees/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { error } = await supabaseAdmin.from('finance_employee').delete().eq('id', req.params.id).eq('school_id', schoolId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error('DELETE employee:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// ============================================================
// BULLETINS DE PAIE (runs)
// ============================================================
router.get('/payroll/runs', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin.from('finance_payroll_run').select('*').eq('school_id', schoolId)
      .order('year', { ascending: false }).order('month', { ascending: false });
    if (req.query.academic_year) q = q.eq('academic_year', req.query.academic_year);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ runs: data || [] });
  } catch (e) { console.error('GET runs:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.get('/payroll/runs/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run')
      .select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    const { data: lines } = await supabaseAdmin.from('finance_payroll_line')
      .select('*').eq('run_id', run.id).order('employee_name');
    res.json({ run, lines: lines || [] });
  } catch (e) { console.error('GET run:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// Crée (ou récupère) le bulletin d'un mois et génère les lignes depuis les employés actifs
router.post('/payroll/runs', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const year = parseInt(req.body.year, 10);
    const month = parseInt(req.body.month, 10);
    if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'year, month requis' });

    const { data: existing } = await supabaseAdmin.from('finance_payroll_run')
      .select('*').eq('school_id', schoolId).eq('year', year).eq('month', month).maybeSingle();
    if (existing) {
      const { data: lines } = await supabaseAdmin.from('finance_payroll_line').select('*').eq('run_id', existing.id).order('employee_name');
      return res.json({ run: existing, lines: lines || [], existed: true });
    }

    const academic_year = academicYearForDate(year, month);
    const { data: run, error } = await supabaseAdmin.from('finance_payroll_run')
      .insert({ school_id: schoolId, academic_year, year, month, status: 'draft', created_by: req.user.id })
      .select().single();
    if (error) throw error;

    const { data: employees } = await supabaseAdmin.from('finance_employee')
      .select('id, full_name, base_salary').eq('school_id', schoolId).eq('is_active', true);
    let lines = [];
    if (employees && employees.length) {
      const rows = employees.map((e) => ({ run_id: run.id, employee_id: e.id, employee_name: e.full_name, salary: num(e.base_salary), cnss_amo: 0, ir: 0 }));
      const { data: ins } = await supabaseAdmin.from('finance_payroll_line').insert(rows).select();
      lines = ins || [];
      await recomputeTotals(run.id, schoolId);
    }
    const { data: fresh } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', run.id).single();
    res.status(201).json({ run: fresh, lines });
  } catch (e) { console.error('POST run:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

async function recomputeTotals(runId, schoolId) {
  const { data: lines } = await supabaseAdmin.from('finance_payroll_line').select('salary, cnss_amo, ir').eq('run_id', runId);
  const t = (lines || []).reduce((a, l) => ({ s: a.s + num(l.salary), c: a.c + num(l.cnss_amo), i: a.i + num(l.ir) }), { s: 0, c: 0, i: 0 });
  await supabaseAdmin.from('finance_payroll_run').update({
    total_salary: t.s, total_cnss_amo: t.c, total_ir: t.i, total: t.s + t.c + t.i, updated_at: new Date().toISOString(),
  }).eq('id', runId).eq('school_id', schoolId);
  return t;
}

// Enregistre les lignes éditées (brouillon uniquement)
router.put('/payroll/runs/:id/lines', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    if (run.status === 'posted') return res.status(409).json({ error: 'Bulletin comptabilisé : dé-comptabilisez avant de modifier.' });
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    for (const l of lines) {
      if (!l.id) continue;
      await supabaseAdmin.from('finance_payroll_line')
        .update({ salary: num(l.salary), cnss_amo: num(l.cnss_amo), ir: num(l.ir) })
        .eq('id', l.id).eq('run_id', run.id);
    }
    await recomputeTotals(run.id, schoolId);
    const { data: fresh } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', run.id).single();
    res.json({ success: true, run: fresh });
  } catch (e) { console.error('PUT run lines:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// Ajoute une ligne libre (employé hors liste) à un brouillon
router.post('/payroll/runs/:id/lines', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    if (run.status === 'posted') return res.status(409).json({ error: 'Bulletin comptabilisé.' });
    const { employee_id = null, employee_name = 'Employé', salary = 0, cnss_amo = 0, ir = 0 } = req.body;
    const { data, error } = await supabaseAdmin.from('finance_payroll_line')
      .insert({ run_id: run.id, employee_id, employee_name, salary: num(salary), cnss_amo: num(cnss_amo), ir: num(ir) }).select().single();
    if (error) throw error;
    await recomputeTotals(run.id, schoolId);
    res.status(201).json({ line: data });
  } catch (e) { console.error('POST run line:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.delete('/payroll/runs/:id/lines/:lineId', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    if (run.status === 'posted') return res.status(409).json({ error: 'Bulletin comptabilisé.' });
    await supabaseAdmin.from('finance_payroll_line').delete().eq('id', req.params.lineId).eq('run_id', run.id);
    await recomputeTotals(run.id, schoolId);
    res.json({ success: true });
  } catch (e) { console.error('DELETE run line:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// Comptabilise : écrit 3 écritures (salaires, cnss+amo, ir) dans le grand livre
router.post('/payroll/runs/:id/post', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    const t = await recomputeTotals(run.id, schoolId);
    const accounts = await masseSalarialeAccounts(schoolId);

    // Repart à zéro pour ce run
    await supabaseAdmin.from('finance_ledger_entry').delete().eq('source_type', 'payroll').eq('source_id', run.id);
    const entryDate = `${run.year}-${String(run.month).padStart(2, '0')}-01`;
    const entries = [
      { key: 'salaries_permanent', amount: t.s, label: 'Salaires' },
      { key: 'cnss_amo', amount: t.c, label: 'CNSS et AMO' },
      { key: 'ir', amount: t.i, label: 'IR' },
    ].filter((x) => accounts[x.key] && x.amount !== 0)
      .map((x) => ({
        school_id: schoolId, account_id: accounts[x.key], academic_year: run.academic_year,
        year: run.year, month: run.month, amount: x.amount, source_type: 'payroll', source_id: run.id,
        label: `Paie ${run.month}/${run.year} — ${x.label}`, entry_date: entryDate,
      }));
    if (entries.length) await supabaseAdmin.from('finance_ledger_entry').insert(entries);

    const { data: fresh } = await supabaseAdmin.from('finance_payroll_run')
      .update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', run.id).select().single();
    res.json({ success: true, run: fresh, posted: entries.length });
  } catch (e) { console.error('POST run/post:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// Annule la comptabilisation (revient en brouillon)
router.post('/payroll/runs/:id/unpost', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('id').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    await supabaseAdmin.from('finance_ledger_entry').delete().eq('source_type', 'payroll').eq('source_id', run.id);
    const { data: fresh } = await supabaseAdmin.from('finance_payroll_run')
      .update({ status: 'draft', posted_at: null }).eq('id', run.id).select().single();
    res.json({ success: true, run: fresh });
  } catch (e) { console.error('POST run/unpost:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.delete('/payroll/runs/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('id').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    await supabaseAdmin.from('finance_ledger_entry').delete().eq('source_type', 'payroll').eq('source_id', run.id);
    await supabaseAdmin.from('finance_payroll_run').delete().eq('id', run.id).eq('school_id', schoolId);
    res.json({ success: true });
  } catch (e) { console.error('DELETE run:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

export default router;
