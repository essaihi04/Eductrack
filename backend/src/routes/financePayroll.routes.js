/**
 * Comptabilité de gestion — Paie / RH
 *  - Employés (permanent/vacataire ; enseignant, assistant, chauffeur…),
 *    salaire fixe ou horaire (heures × taux), mode de paiement (espèce/banque).
 *  - Bulletins mensuels : salaire calculé, CNSS+AMO et IR auto (config école).
 *  - Modèle « PAR PAIEMENT » : un salaire payé en ESPÈCE crée une dépense
 *    (school_expenses, reference 'PAYROLL:<line_id>'). Payé en BANQUE, la
 *    charge entre via le relevé bancaire. La paie n'écrit PLUS dans
 *    finance_ledger_entry (zéro doublon).
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
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

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

// ── Config paie (taux CNSS/AMO + barème IR) ───────────────────────────────
const DEFAULT_IR_BRACKETS = [
  { limit: 2500, rate: 0, deduction: 0 },
  { limit: 4166.67, rate: 10, deduction: 250 },
  { limit: 5000, rate: 20, deduction: 666.67 },
  { limit: 6666.67, rate: 30, deduction: 1166.67 },
  { limit: 15000, rate: 34, deduction: 1433.33 },
  { limit: null, rate: 38, deduction: 2033.33 },
];

async function getOrCreatePayrollConfig(schoolId) {
  const { data } = await supabaseAdmin.from('finance_payroll_config').select('*').eq('school_id', schoolId).maybeSingle();
  if (data) return data;
  const { data: created } = await supabaseAdmin.from('finance_payroll_config')
    .insert({ school_id: schoolId }).select().single();
  return created || { school_id: schoolId, cnss_rate: 4.48, amo_rate: 2.26, cnss_ceiling: 6000, ir_brackets: DEFAULT_IR_BRACKETS, default_monthly_hours: 0 };
}

// Calcule CNSS+AMO et IR sur un salaire brut. Renvoie {cnss_amo, ir, net}.
function computeCnssIr(brut, config, cnssSubject = true) {
  const b = num(brut);
  const cnssRate = num(config?.cnss_rate);
  const amoRate = num(config?.amo_rate);
  const ceiling = num(config?.cnss_ceiling) || Infinity;
  const cnss = cnssSubject ? Math.min(b, ceiling) * (cnssRate / 100) : 0;
  const amo = cnssSubject ? b * (amoRate / 100) : 0;
  const cnss_amo = round2(cnss + amo);
  // IR sur net imposable approché = brut − cotisations sociales
  const taxable = Math.max(0, b - cnss_amo);
  const brackets = Array.isArray(config?.ir_brackets) && config.ir_brackets.length ? config.ir_brackets : DEFAULT_IR_BRACKETS;
  let ir = 0;
  for (const br of brackets) {
    if (br.limit == null || taxable <= num(br.limit)) {
      ir = Math.max(0, taxable * (num(br.rate) / 100) - num(br.deduction));
      break;
    }
  }
  ir = round2(ir);
  return { cnss_amo, ir, net: round2(b - cnss_amo - ir) };
}

const grossOf = (emp, hours) => (emp.pay_mode === 'hourly' ? num(emp.hourly_rate) * num(hours != null ? hours : emp.default_monthly_hours) : num(emp.base_salary));

// ── Heures réalisées (séances) par enseignant pour un mois ────────────────
const HHMMtoMin = (t) => { if (!t) return null; const [h, m] = String(t).split(':'); return Number(h) * 60 + Number(m || 0); };
async function realizedHoursByTeacher(schoolId, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-31`;
  const { data: sessions } = await supabaseAdmin
    .from('sessions').select('teacher_id, start_time, end_time, date')
    .eq('school_id', schoolId).gte('date', start).lte('date', end);
  const map = {};
  for (const s of (sessions || [])) {
    if (!s.teacher_id) continue;
    const a = HHMMtoMin(s.start_time); const b = HHMMtoMin(s.end_time);
    const mins = a != null && b != null && b > a ? b - a : 0;
    if (!mins) continue;
    map[s.teacher_id] = (map[s.teacher_id] || 0) + mins;
  }
  Object.keys(map).forEach((k) => { map[k] = round2(map[k] / 60); });
  return map; // { profile_id: heures }
}

// Liste des profils enseignants (pour lier un employé à un compte prof)
router.get('/payroll/teachers', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data } = await supabaseAdmin.from('profiles')
      .select('id, first_name, last_name, role').eq('school_id', schoolId).eq('role', 'teacher').order('last_name');
    res.json({ teachers: (data || []).map((p) => ({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Enseignant' })) });
  } catch (e) { console.error('GET teachers:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// Heures réalisées d'un mois (par profil enseignant)
router.get('/payroll/realized-hours', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const year = parseInt(req.query.year, 10); const month = parseInt(req.query.month, 10);
    if (!year || !month) return res.status(400).json({ error: 'year, month requis' });
    res.json({ hours: await realizedHoursByTeacher(schoolId, year, month) });
  } catch (e) { console.error('GET realized-hours:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.get('/payroll/config', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    res.json({ config: await getOrCreatePayrollConfig(schoolId) });
  } catch (e) { console.error('GET payroll config:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.put('/payroll/config', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    await getOrCreatePayrollConfig(schoolId);
    const patch = { updated_at: new Date().toISOString() };
    for (const f of ['cnss_rate', 'amo_rate', 'cnss_ceiling', 'default_monthly_hours']) if (req.body[f] !== undefined) patch[f] = num(req.body[f]);
    if (req.body.ir_brackets !== undefined) patch.ir_brackets = req.body.ir_brackets;
    const { data, error } = await supabaseAdmin.from('finance_payroll_config').update(patch).eq('school_id', schoolId).select().single();
    if (error) throw error;
    res.json({ config: data });
  } catch (e) { console.error('PUT payroll config:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// ============================================================
// EMPLOYÉS
// ============================================================
const EMP_FIELDS = ['full_name', 'role_label', 'category', 'employment_type', 'pay_mode', 'base_salary', 'hourly_rate', 'default_monthly_hours', 'payment_method', 'cnss_subject', 'cnss_number', 'is_active', 'profile_id', 'hire_date', 'end_date', 'paid_months'];
const NUM_EMP_FIELDS = new Set(['base_salary', 'hourly_rate', 'default_monthly_hours']);
const DATE_EMP_FIELDS = new Set(['hire_date', 'end_date']);

// Un employé est-il à payer pour ce mois (date d'entrée/sortie + mois cochés) ?
function employeePaidForMonth(emp, year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = `${year}-${String(month).padStart(2, '0')}-31`;
  if (emp.hire_date && String(emp.hire_date) > last) return false;
  if (emp.end_date && String(emp.end_date) < first) return false;
  if (Array.isArray(emp.paid_months) && emp.paid_months.length > 0 && !emp.paid_months.map(Number).includes(month)) return false;
  return true;
}

// Normalise une valeur de champ employé (nombres, dates vides -> null, mois -> array)
function coerceEmp(f, v) {
  if (NUM_EMP_FIELDS.has(f)) return num(v);
  if (DATE_EMP_FIELDS.has(f)) return v || null;
  if (f === 'profile_id') return v || null;
  if (f === 'paid_months') return Array.isArray(v) ? v.map(Number) : null;
  return v;
}

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
    if (!req.body.full_name) return res.status(400).json({ error: 'Nom requis' });
    const row = { school_id: schoolId };
    for (const f of EMP_FIELDS) if (req.body[f] !== undefined) row[f] = coerceEmp(f, req.body[f]);
    const { data, error } = await supabaseAdmin.from('finance_employee').insert(row).select().single();
    if (error) throw error;
    res.status(201).json({ employee: data });
  } catch (e) { console.error('POST employee:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.put('/payroll/employees/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const patch = { updated_at: new Date().toISOString() };
    for (const f of EMP_FIELDS) if (req.body[f] !== undefined) patch[f] = coerceEmp(f, req.body[f]);
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

// Crée (ou récupère) le bulletin d'un mois et génère les lignes calculées
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

    const config = await getOrCreatePayrollConfig(schoolId);
    const realized = await realizedHoursByTeacher(schoolId, year, month);
    const { data: allEmployees } = await supabaseAdmin.from('finance_employee')
      .select('*').eq('school_id', schoolId).eq('is_active', true);
    // N'inclure que les employés à payer ce mois (date d'entrée/sortie + mois cochés)
    const employees = (allEmployees || []).filter((e) => employeePaidForMonth(e, year, month));
    let lines = [];
    if (employees && employees.length) {
      const rows = employees.map((e) => {
        // Heures réalisées du prof lié (sinon heures/mois par défaut)
        const realizedH = e.profile_id != null ? realized[e.profile_id] : undefined;
        const hours = e.pay_mode === 'hourly' ? num(realizedH != null ? realizedH : e.default_monthly_hours) : 0;
        const hourly_rate = num(e.hourly_rate);
        const salary = round2(grossOf(e, e.pay_mode === 'hourly' ? hours : undefined));
        const { cnss_amo, ir, net } = computeCnssIr(salary, config, e.cnss_subject !== false);
        return {
          run_id: run.id, employee_id: e.id, employee_name: e.full_name,
          hours, hourly_rate, salary, cnss_amo, ir, net_salary: net,
          payment_method: e.payment_method || 'bank', paid: false,
        };
      });
      const { data: ins } = await supabaseAdmin.from('finance_payroll_line').insert(rows).select();
      lines = ins || [];
      await recomputeTotals(run.id, schoolId);
    }
    const { data: fresh } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', run.id).single();
    res.status(201).json({ run: fresh, lines });
  } catch (e) { console.error('POST run:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

async function recomputeTotals(runId, schoolId) {
  const { data: lines } = await supabaseAdmin.from('finance_payroll_line').select('salary, cnss_amo, ir, net_salary, paid').eq('run_id', runId);
  const t = (lines || []).reduce((a, l) => ({ s: a.s + num(l.salary), c: a.c + num(l.cnss_amo), i: a.i + num(l.ir) }), { s: 0, c: 0, i: 0 });
  const allPaid = (lines || []).length > 0 && (lines || []).every((l) => l.paid);
  await supabaseAdmin.from('finance_payroll_run').update({
    total_salary: round2(t.s), total_cnss_amo: round2(t.c), total_ir: round2(t.i), total: round2(t.s + t.c + t.i),
    status: allPaid ? 'posted' : 'draft', posted_at: allPaid ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', runId).eq('school_id', schoolId);
  return t;
}

// Enregistre les lignes éditées (heures/montants) — ignore les lignes payées
router.put('/payroll/runs/:id/lines', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    const config = await getOrCreatePayrollConfig(schoolId);
    const { data: current } = await supabaseAdmin.from('finance_payroll_line').select('*').eq('run_id', run.id);
    const byId = new Map((current || []).map((l) => [l.id, l]));
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    for (const l of lines) {
      const orig = l.id && byId.get(l.id);
      if (!orig || orig.paid) continue; // ligne payée = verrouillée
      const hours = l.hours !== undefined ? num(l.hours) : num(orig.hours);
      const hourly_rate = l.hourly_rate !== undefined ? num(l.hourly_rate) : num(orig.hourly_rate);
      // Salaire : horaire (taux > 0) = heures × taux ; fixe = valeur éditée directe
      let salary = l.salary !== undefined ? num(l.salary) : num(orig.salary);
      if (hourly_rate > 0) salary = round2(hours * hourly_rate);
      const auto = computeCnssIr(salary, config, true);
      const cnss_amo = l.cnss_amo !== undefined ? num(l.cnss_amo) : auto.cnss_amo;
      const ir = l.ir !== undefined ? num(l.ir) : auto.ir;
      const net_salary = round2(salary - cnss_amo - ir);
      await supabaseAdmin.from('finance_payroll_line')
        .update({ hours, hourly_rate, salary: round2(salary), cnss_amo, ir, net_salary })
        .eq('id', l.id).eq('run_id', run.id);
    }
    await recomputeTotals(run.id, schoolId);
    const { data: fresh } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', run.id).single();
    res.json({ success: true, run: fresh });
  } catch (e) { console.error('PUT run lines:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// Recalcule les heures réalisées (séances) des lignes horaires liées à un prof
router.post('/payroll/runs/:id/recompute-hours', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    const config = await getOrCreatePayrollConfig(schoolId);
    const realized = await realizedHoursByTeacher(schoolId, run.year, run.month);
    const { data: lines } = await supabaseAdmin.from('finance_payroll_line').select('*').eq('run_id', run.id);
    const empIds = [...new Set((lines || []).map((l) => l.employee_id).filter(Boolean))];
    const empMap = new Map();
    if (empIds.length) {
      const { data: emps } = await supabaseAdmin.from('finance_employee').select('id, profile_id, hourly_rate, pay_mode').in('id', empIds);
      (emps || []).forEach((e) => empMap.set(e.id, e));
    }
    let updated = 0;
    for (const l of (lines || [])) {
      if (l.paid) continue;
      const emp = l.employee_id && empMap.get(l.employee_id);
      if (!emp || emp.pay_mode !== 'hourly' || emp.profile_id == null) continue;
      const h = realized[emp.profile_id];
      if (h == null) continue;
      const rate = num(l.hourly_rate) || num(emp.hourly_rate);
      const salary = round2(h * rate);
      const auto = computeCnssIr(salary, config, true);
      await supabaseAdmin.from('finance_payroll_line')
        .update({ hours: h, hourly_rate: rate, salary, cnss_amo: auto.cnss_amo, ir: auto.ir, net_salary: auto.net })
        .eq('id', l.id).eq('run_id', run.id);
      updated += 1;
    }
    await recomputeTotals(run.id, schoolId);
    res.json({ success: true, updated });
  } catch (e) { console.error('recompute-hours:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// Ajoute une ligne libre (employé hors liste)
router.post('/payroll/runs/:id/lines', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    const config = await getOrCreatePayrollConfig(schoolId);
    const salary = round2(num(req.body.salary));
    const auto = computeCnssIr(salary, config, true);
    const cnss_amo = req.body.cnss_amo !== undefined ? num(req.body.cnss_amo) : auto.cnss_amo;
    const ir = req.body.ir !== undefined ? num(req.body.ir) : auto.ir;
    const { data, error } = await supabaseAdmin.from('finance_payroll_line')
      .insert({
        run_id: run.id, employee_id: req.body.employee_id || null, employee_name: req.body.employee_name || 'Employé',
        hours: num(req.body.hours), hourly_rate: num(req.body.hourly_rate), salary, cnss_amo, ir,
        net_salary: round2(salary - cnss_amo - ir), payment_method: req.body.payment_method || 'bank', paid: false,
      }).select().single();
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
    const { data: line } = await supabaseAdmin.from('finance_payroll_line').select('*').eq('id', req.params.lineId).eq('run_id', run.id).maybeSingle();
    if (line?.expense_id) await supabaseAdmin.from('school_expenses').delete().eq('id', line.expense_id).eq('school_id', schoolId);
    await supabaseAdmin.from('finance_payroll_line').delete().eq('id', req.params.lineId).eq('run_id', run.id);
    await recomputeTotals(run.id, schoolId);
    res.json({ success: true });
  } catch (e) { console.error('DELETE run line:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// ============================================================
// PAIEMENT DES SALAIRES (espèce -> dépense ; banque -> via relevé)
// ============================================================
const MONTH_NAMES = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

async function payLine(schoolId, run, line, method, date, userId) {
  if (line.paid) return;
  const m = method === 'cash' ? 'cash' : 'bank';
  const paid_date = date || `${run.year}-${String(run.month).padStart(2, '0')}-28`;
  let expense_id = null;
  if (m === 'cash') {
    const accounts = await masseSalarialeAccounts(schoolId);
    const { data: exp } = await supabaseAdmin.from('school_expenses').insert({
      school_id: schoolId, account_id: accounts.salaries_permanent || null, category: 'salaries',
      description: `Salaire ${line.employee_name} — ${MONTH_NAMES[run.month]} ${run.year}`,
      amount: num(line.net_salary), expense_date: paid_date, payment_method: 'cash',
      reference: `PAYROLL:${line.id}`, notes: 'Salaire payé en espèce', recorded_by: userId || null,
    }).select('id').single();
    expense_id = exp?.id || null;
  }
  await supabaseAdmin.from('finance_payroll_line')
    .update({ paid: true, paid_date, payment_method: m, expense_id })
    .eq('id', line.id).eq('run_id', run.id);
}

router.post('/payroll/runs/:id/lines/:lineId/pay', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    const { data: line } = await supabaseAdmin.from('finance_payroll_line').select('*').eq('id', req.params.lineId).eq('run_id', run.id).maybeSingle();
    if (!line) return res.status(404).json({ error: 'Ligne introuvable' });
    await payLine(schoolId, run, line, req.body.method || line.payment_method, req.body.date, req.user.id);
    await recomputeTotals(run.id, schoolId);
    res.json({ success: true });
  } catch (e) { console.error('pay line:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/payroll/runs/:id/lines/:lineId/unpay', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    const { data: line } = await supabaseAdmin.from('finance_payroll_line').select('*').eq('id', req.params.lineId).eq('run_id', run.id).maybeSingle();
    if (!line) return res.status(404).json({ error: 'Ligne introuvable' });
    if (line.expense_id) await supabaseAdmin.from('school_expenses').delete().eq('id', line.expense_id).eq('school_id', schoolId);
    await supabaseAdmin.from('finance_payroll_line')
      .update({ paid: false, paid_date: null, payment_method: line.payment_method, expense_id: null })
      .eq('id', line.id).eq('run_id', run.id);
    await recomputeTotals(run.id, schoolId);
    res.json({ success: true });
  } catch (e) { console.error('unpay line:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.post('/payroll/runs/:id/pay-all', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('*').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    const { data: lines } = await supabaseAdmin.from('finance_payroll_line').select('*').eq('run_id', run.id).eq('paid', false);
    let count = 0;
    for (const line of (lines || [])) {
      await payLine(schoolId, run, line, req.body.method || line.payment_method, req.body.date, req.user.id);
      count += 1;
    }
    await recomputeTotals(run.id, schoolId);
    res.json({ success: true, paid: count });
  } catch (e) { console.error('pay-all:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

router.delete('/payroll/runs/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: run } = await supabaseAdmin.from('finance_payroll_run').select('id').eq('id', req.params.id).eq('school_id', schoolId).maybeSingle();
    if (!run) return res.status(404).json({ error: 'Bulletin introuvable' });
    // Supprime les dépenses espèce liées aux lignes de ce bulletin
    const { data: lines } = await supabaseAdmin.from('finance_payroll_line').select('expense_id').eq('run_id', run.id);
    for (const l of (lines || [])) if (l.expense_id) await supabaseAdmin.from('school_expenses').delete().eq('id', l.expense_id).eq('school_id', schoolId);
    await supabaseAdmin.from('finance_payroll_run').delete().eq('id', run.id).eq('school_id', schoolId);
    res.json({ success: true });
  } catch (e) { console.error('DELETE run:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

// ============================================================
// SUIVI DES PAIEMENTS (historique de l'année)
// ============================================================
router.get('/payroll/payments', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let rq = supabaseAdmin.from('finance_payroll_run').select('id, year, month, academic_year').eq('school_id', schoolId);
    if (req.query.academic_year) rq = rq.eq('academic_year', req.query.academic_year);
    const { data: runs } = await rq;
    const runMap = new Map((runs || []).map((r) => [r.id, r]));
    const ids = (runs || []).map((r) => r.id);
    if (!ids.length) return res.json({ payments: [] });
    const { data: lines } = await supabaseAdmin.from('finance_payroll_line')
      .select('employee_id, employee_name, salary, net_salary, paid, paid_date, payment_method, run_id').in('run_id', ids);
    const payments = (lines || []).map((l) => {
      const r = runMap.get(l.run_id) || {};
      return {
        employee_id: l.employee_id, employee_name: l.employee_name, year: r.year, month: r.month,
        salary: l.salary, net_salary: l.net_salary, paid: l.paid, paid_date: l.paid_date, payment_method: l.payment_method,
      };
    }).sort((a, b) => (b.year - a.year) || (b.month - a.month) || a.employee_name.localeCompare(b.employee_name));
    res.json({ payments });
  } catch (e) { console.error('GET payments:', e); res.status(500).json({ error: 'Erreur serveur', details: e.message }); }
});

export default router;
