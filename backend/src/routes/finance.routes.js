import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireFinanceAccess } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireFinanceAccess);

// Helpers
const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.query.school_id || req.body.school_id || null;
  return req.user.school_id || null;
};

const isAdminRole = (req) => ['admin', 'school_admin', 'super_admin'].includes(req.user.role);

// Plage de dates d'une année scolaire (slash "YYYY/YYYY" ou tiret "YYYY-YYYY") :
// du 1er septembre Y1 au 31 août Y2. Renvoie null si format invalide.
const academicYearRange = (year) => {
  const y1 = parseInt(String(year || '').split(/[/\-]/)[0], 10);
  if (Number.isNaN(y1)) return null;
  return { start: `${y1}-09-01`, end: `${y1 + 1}-08-31` };
};

// Mapping catégorie facture -> flux de recette (aligné sur financeAccounting.routes.js)
const STREAM_OF_CATEGORY = { tuition: 'tuition', transport: 'transport', registration: 'fi', supplies: 'fr' };
const streamOfCategory = (c) => STREAM_OF_CATEGORY[c] || 'other';
const STREAM_LABEL_FALLBACK = { tuition: 'Scolarité', transport: 'Transport', fi: "Frais d'inscription", fr: 'Fournitures & divers', other: 'Autres recettes' };
// Mapping ancien enum dépense -> default_key (fallback si account_id absent)
const EXP_DEFAULT_OF_CATEGORY = {
  salaries: 'salaries_permanent', rent: 'rent', utilities: 'water_electricity',
  maintenance: 'premises_maintenance', equipment: 'equipment_it', taxes: 'is_acomptes',
  insurance: 'insurance_rc', transport: 'fuel_gasoil',
};

// Numérotation atomique des factures/reçus
async function getNextCounter(schoolId, counterType) {
  const year = new Date().getFullYear();
  // Upsert + increment atomique via RPC-like approach
  const { data: existing } = await supabaseAdmin
    .from('finance_counters')
    .select('id, last_value')
    .eq('school_id', schoolId)
    .eq('counter_type', counterType)
    .eq('year', year)
    .maybeSingle();

  let nextVal;
  if (existing) {
    nextVal = existing.last_value + 1;
    await supabaseAdmin
      .from('finance_counters')
      .update({ last_value: nextVal, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    nextVal = 1;
    await supabaseAdmin
      .from('finance_counters')
      .insert({ school_id: schoolId, counter_type: counterType, year, last_value: nextVal });
  }

  const prefix = counterType === 'invoice' ? 'F' : 'R';
  return `${prefix}-${year}-${String(nextVal).padStart(4, '0')}`;
}

// ============================================================
// CLASSES (lecture seule pour le module finance)
// ============================================================
router.get('/classes', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let query = supabaseAdmin
      .from('classes')
      .select('id, name, level, school_type, filiere, academic_year');
    if (schoolId) query = query.eq('school_id', schoolId);
    if (req.query.academic_year) query = query.eq('academic_year', req.query.academic_year);
    const { data, error } = await query.order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur GET /finance/classes:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ============================================================
// MODÈLES DE FRAIS
// ============================================================
router.get('/fee-templates', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let query = supabaseAdmin
      .from('fee_templates')
      .select('*, fee_template_items(*)')
      .order('created_at', { ascending: false });
    if (schoolId) query = query.eq('school_id', schoolId);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ templates: data || [] });
  } catch (error) {
    console.error('Erreur fetch fee-templates:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/fee-templates', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { name, description, academic_year, level, school_type, currency, items } = req.body;
    if (!name || !academic_year) return res.status(400).json({ error: 'Nom et année requis' });

    const { data: template, error } = await supabaseAdmin
      .from('fee_templates')
      .insert({
        school_id: schoolId,
        name, description, academic_year, level, school_type,
        currency: currency || 'MAD',
        created_by: req.user.id
      })
      .select()
      .single();
    if (error) throw error;

    if (Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((it, idx) => ({
        template_id: template.id,
        category: it.category,
        name: it.name,
        amount: Number(it.amount) || 0,
        recurrence: it.recurrence || 'one_time',
        due_month: it.due_month || null,
        start_month: it.start_month || 9,
        end_month: it.end_month || 6,
        is_optional: !!it.is_optional,
        sort_order: idx
      }));
      const { error: itemsErr } = await supabaseAdmin.from('fee_template_items').insert(itemsToInsert);
      if (itemsErr) throw itemsErr;
    }

    const { data: full } = await supabaseAdmin
      .from('fee_templates')
      .select('*, fee_template_items(*)')
      .eq('id', template.id)
      .single();
    res.json({ success: true, template: full });
  } catch (error) {
    console.error('Erreur create fee-template:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

router.put('/fee-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, academic_year, level, school_type, is_active, items } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (academic_year !== undefined) updates.academic_year = academic_year;
    if (level !== undefined) updates.level = level;
    if (school_type !== undefined) updates.school_type = school_type;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin.from('fee_templates').update(updates).eq('id', id);
    if (error) throw error;

    // Remplacer les items si fournis
    if (Array.isArray(items)) {
      await supabaseAdmin.from('fee_template_items').delete().eq('template_id', id);
      if (items.length > 0) {
        const itemsToInsert = items.map((it, idx) => ({
          template_id: id,
          category: it.category,
          name: it.name,
          amount: Number(it.amount) || 0,
          recurrence: it.recurrence || 'one_time',
          due_month: it.due_month || null,
          start_month: it.start_month || 9,
          end_month: it.end_month || 6,
          is_optional: !!it.is_optional,
          sort_order: idx
        }));
        await supabaseAdmin.from('fee_template_items').insert(itemsToInsert);
      }
    }

    const { data: full } = await supabaseAdmin
      .from('fee_templates')
      .select('*, fee_template_items(*)')
      .eq('id', id)
      .single();
    res.json({ success: true, template: full });
  } catch (error) {
    console.error('Erreur update fee-template:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/fee-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('fee_templates').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur delete fee-template:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Appliquer un modèle à toute une classe
router.post('/fee-templates/:id/apply-to-class', async (req, res) => {
  try {
    const { id: templateId } = req.params;
    const { class_id, academic_year } = req.body;
    const schoolId = getSchoolId(req);
    if (!class_id || !academic_year) return res.status(400).json({ error: 'class_id et academic_year requis' });

    // Récupérer les élèves de la classe
    let studentsQuery = supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .eq('class_id', class_id);
    if (schoolId) studentsQuery = studentsQuery.eq('school_id', schoolId);
    const { data: students, error: sErr } = await studentsQuery;
    if (sErr) throw sErr;

    const created = [];
    const skipped = [];
    for (const st of students || []) {
      const { data: existing } = await supabaseAdmin
        .from('student_fee_plans')
        .select('id')
        .eq('student_id', st.id)
        .eq('academic_year', academic_year)
        .maybeSingle();
      if (existing) { skipped.push(st.id); continue; }

      const { data: plan, error: pErr } = await supabaseAdmin
        .from('student_fee_plans')
        .insert({
          school_id: schoolId,
          student_id: st.id,
          template_id: templateId,
          academic_year,
          created_by: req.user.id
        })
        .select()
        .single();
      if (pErr) continue;
      created.push(plan.id);
    }

    res.json({ success: true, created_count: created.length, skipped_count: skipped.length });
  } catch (error) {
    console.error('Erreur apply-to-class:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Appliquer un modèle à plusieurs classes en une fois
router.post('/fee-templates/:id/apply-to-classes', async (req, res) => {
  try {
    const { id: templateId } = req.params;
    const { class_ids, academic_year } = req.body;
    const schoolId = getSchoolId(req);
    if (!Array.isArray(class_ids) || class_ids.length === 0 || !academic_year) {
      return res.status(400).json({ error: 'class_ids[] et academic_year requis' });
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    const perClass = [];

    for (const classId of class_ids) {
      let studentsQuery = supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'student')
        .eq('class_id', classId);
      if (schoolId) studentsQuery = studentsQuery.eq('school_id', schoolId);
      const { data: students, error: sErr } = await studentsQuery;
      if (sErr) continue;

      let created = 0;
      let skipped = 0;
      for (const st of students || []) {
        const { data: existing } = await supabaseAdmin
          .from('student_fee_plans')
          .select('id')
          .eq('student_id', st.id)
          .eq('academic_year', academic_year)
          .maybeSingle();
        if (existing) { skipped++; continue; }

        const { error: pErr } = await supabaseAdmin
          .from('student_fee_plans')
          .insert({
            school_id: schoolId,
            student_id: st.id,
            template_id: templateId,
            academic_year,
            created_by: req.user.id
          });
        if (!pErr) created++;
      }
      totalCreated += created;
      totalSkipped += skipped;
      perClass.push({ class_id: classId, created, skipped });
    }

    res.json({ success: true, created_count: totalCreated, skipped_count: totalSkipped, per_class: perClass });
  } catch (error) {
    console.error('Erreur apply-to-classes:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ============================================================
// PLANS DE FRAIS PAR ÉLÈVE
// ============================================================
router.get('/students/:studentId/fee-plan', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academic_year } = req.query;

    let query = supabaseAdmin
      .from('student_fee_plans')
      .select(`*,
        template:fee_templates(*, fee_template_items(*)),
        custom_items:student_fee_plan_items(*)
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (academic_year) query = query.eq('academic_year', academic_year);

    const { data: plans, error } = await query;
    if (error) throw error;
    res.json({ plans: plans || [] });
  } catch (error) {
    console.error('Erreur fetch student plan:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/students/:studentId/fee-plan', async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = getSchoolId(req);
    const { template_id, academic_year, sibling_discount_percent, sibling_discount_type, sibling_discount_amount, scholarship_amount, custom_notes, custom_items, start_month, end_month, custom_discount_amount, custom_discount_reason } = req.body;
    if (!academic_year) return res.status(400).json({ error: 'academic_year requis' });
    const discountType = sibling_discount_type === 'amount' ? 'amount' : 'percent';
    // Mois d'entrée/sortie : null si non précisé (= année complète)
    const startMonthVal = start_month ? Number(start_month) : null;
    const endMonthVal = end_month ? Number(end_month) : null;
    // Colonne UUID : une chaîne vide doit devenir NULL (sinon erreur / non détaché)
    const templateIdValue = template_id ? template_id : null;

    // Upsert
    const { data: existing } = await supabaseAdmin
      .from('student_fee_plans')
      .select('id')
      .eq('student_id', studentId)
      .eq('academic_year', academic_year)
      .maybeSingle();

    let planId;
    if (existing) {
      planId = existing.id;
      await supabaseAdmin
        .from('student_fee_plans')
        .update({
          template_id: templateIdValue, sibling_discount_percent: sibling_discount_percent || 0,
          sibling_discount_type: discountType,
          sibling_discount_amount: sibling_discount_amount || 0,
          scholarship_amount: scholarship_amount || 0,
          start_month: startMonthVal, end_month: endMonthVal,
          custom_discount_amount: custom_discount_amount || 0,
          custom_discount_reason: custom_discount_reason || null,
          custom_notes, updated_at: new Date().toISOString()
        })
        .eq('id', planId);
    } else {
      const { data: newPlan, error } = await supabaseAdmin
        .from('student_fee_plans')
        .insert({
          school_id: schoolId,
          student_id: studentId,
          template_id: templateIdValue,
          academic_year,
          sibling_discount_percent: sibling_discount_percent || 0,
          sibling_discount_type: discountType,
          sibling_discount_amount: sibling_discount_amount || 0,
          scholarship_amount: scholarship_amount || 0,
          start_month: startMonthVal, end_month: endMonthVal,
          custom_discount_amount: custom_discount_amount || 0,
          custom_discount_reason: custom_discount_reason || null,
          custom_notes,
          created_by: req.user.id
        })
        .select()
        .single();
      if (error) throw error;
      planId = newPlan.id;
    }

    // Items personnalisés
    if (Array.isArray(custom_items)) {
      await supabaseAdmin.from('student_fee_plan_items').delete().eq('plan_id', planId);
      if (custom_items.length > 0) {
        const toInsert = custom_items.map((it, idx) => ({
          plan_id: planId,
          category: it.category,
          name: it.name,
          amount: Number(it.amount) || 0,
          recurrence: it.recurrence || 'one_time',
          due_month: it.due_month || null,
          start_month: it.start_month || 9,
          end_month: it.end_month || 6,
          is_optional: !!it.is_optional,
          enabled: it.enabled !== false,
          sort_order: idx
        }));
        await supabaseAdmin.from('student_fee_plan_items').insert(toInsert);
      }
    }

    const { data: full } = await supabaseAdmin
      .from('student_fee_plans')
      .select(`*, template:fee_templates(*, fee_template_items(*)), custom_items:student_fee_plan_items(*)`)
      .eq('id', planId)
      .single();
    res.json({ success: true, plan: full });
  } catch (error) {
    console.error('Erreur save student plan:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ============================================================
// ÉCHÉANCIER MENSUEL PAR ÉLÈVE (statut payé / reste par mois)
// ============================================================
router.get('/students/:studentId/monthly-status', async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = getSchoolId(req);
    const academicYear = req.query.academic_year;
    if (!academicYear) return res.status(400).json({ error: 'academic_year requis' });

    const plan = await fetchStudentPlan(studentId, academicYear, schoolId);
    if (!plan) {
      return res.json({ academic_year: academicYear, plan_exists: false, months: [], summary: null });
    }

    const scheduleMonths = getScheduleMonths(plan);
    const periodLabels = scheduleMonths.map(m => periodLabelFor(academicYear, m));

    // Factures existantes (non annulées) de l'élève sur ces périodes
    let invQ = supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, period_label, total, amount_paid, status, due_date')
      .eq('student_id', studentId)
      .neq('status', 'cancelled');
    if (schoolId) invQ = invQ.eq('school_id', schoolId);
    if (periodLabels.length > 0) invQ = invQ.in('period_label', periodLabels);
    const { data: invoices } = await invQ;

    const invByLabel = {};
    (invoices || []).forEach(i => { invByLabel[i.period_label] = i; });

    const today = new Date().toISOString().split('T')[0];
    const months = scheduleMonths.map(m => {
      const label = periodLabelFor(academicYear, m);
      const computed = computeMonthForPlan(plan, m);
      const inv = invByLabel[label];
      if (inv) {
        const paid = Number(inv.amount_paid || 0);
        const total = Number(inv.total || 0);
        const remaining = Math.max(0, total - paid);
        let status = 'unpaid';
        if (paid >= total && total > 0) status = 'paid';
        else if (paid > 0) status = 'partial';
        else if (inv.due_date && inv.due_date < today) status = 'overdue';
        return {
          month: m, label, invoiced: true, invoice_id: inv.id, invoice_number: inv.invoice_number,
          expected: computed.total, total, paid, remaining, status, due_date: inv.due_date
        };
      }
      return {
        month: m, label, invoiced: false, invoice_id: null, invoice_number: null,
        expected: computed.total, total: computed.total, paid: 0, remaining: computed.total,
        status: 'pending', due_date: null
      };
    });

    const expectedTotal = months.reduce((s, mo) => s + Number(mo.total), 0);
    const paidTotal = months.reduce((s, mo) => s + Number(mo.paid), 0);
    const remainingTotal = months.reduce((s, mo) => s + Number(mo.remaining), 0);

    res.json({
      academic_year: academicYear,
      plan_exists: true,
      currency: plan.template?.currency || 'MAD',
      months,
      summary: {
        expected_total: expectedTotal,
        paid_total: paidTotal,
        remaining_total: remainingTotal,
        all_paid: remainingTotal <= 0 && expectedTotal > 0,
        paid_months: months.filter(mo => mo.status === 'paid').length,
        total_months: months.length
      }
    });
  } catch (error) {
    console.error('Erreur monthly-status:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Encaisser plusieurs mois d'un coup : la facture de chaque mois est générée automatiquement si absente
router.post('/students/:studentId/pay-months', async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = getSchoolId(req);
    const { academic_year, months, payment_date, method, reference, notes, due_day } = req.body;

    if (!academic_year) return res.status(400).json({ error: 'academic_year requis' });
    if (!Array.isArray(months) || months.length === 0) return res.status(400).json({ error: 'months[] requis' });
    if (!method) return res.status(400).json({ error: 'Méthode de paiement requise' });

    const plan = await fetchStudentPlan(studentId, academic_year, schoolId);
    if (!plan) return res.status(400).json({ error: 'Aucun plan de frais actif pour cet élève sur cette année' });

    const payDate = payment_date || new Date().toISOString().split('T')[0];
    const dueDay = String(due_day || 5).padStart(2, '0');

    const receipts = [];
    const skipped = [];
    const errors = [];

    for (const rawMonth of months) {
      const month = Number(rawMonth);
      try {
        const computed = computeMonthForPlan(plan, month);
        if (computed.total <= 0) { skipped.push({ month, reason: 'aucun frais' }); continue; }

        const periodLabel = periodLabelFor(academic_year, month);
        const calYear = calendarYearFor(academic_year, month);
        const dueDate = `${calYear}-${String(month).padStart(2, '0')}-${dueDay}`;

        // Trouver la facture du mois ou la créer automatiquement
        let invQ = supabaseAdmin
          .from('invoices')
          .select('id, total, amount_paid')
          .eq('student_id', studentId)
          .eq('period_label', periodLabel)
          .neq('status', 'cancelled');
        if (schoolId) invQ = invQ.eq('school_id', schoolId);
        const { data: existingInv } = await invQ.maybeSingle();

        let invoice = existingInv;
        if (!invoice) {
          const invoiceNumber = await getNextCounter(schoolId, 'invoice');
          const { data: newInv, error: invErr } = await supabaseAdmin
            .from('invoices')
            .insert({
              school_id: schoolId,
              invoice_number: invoiceNumber,
              student_id: studentId,
              plan_id: plan.id,
              due_date: dueDate,
              period_label: periodLabel,
              subtotal: computed.subtotal,
              discount: computed.discount,
              total: computed.total,
              status: 'issued',
              created_by: req.user.id
            })
            .select('id, total, amount_paid')
            .single();
          if (invErr) { errors.push({ month, error: invErr.message }); continue; }
          const linesToInsert = computed.lines.map((l, idx) => ({ invoice_id: newInv.id, ...l, sort_order: idx }));
          await supabaseAdmin.from('invoice_lines').insert(linesToInsert);
          invoice = newInv;
        }

        const remaining = Number(invoice.total) - Number(invoice.amount_paid || 0);
        if (remaining <= 0) { skipped.push({ month, reason: 'déjà payé' }); continue; }

        const receiptNumber = await getNextCounter(schoolId, 'receipt');
        const { data: payment, error: payErr } = await supabaseAdmin
          .from('payments')
          .insert({
            school_id: schoolId,
            receipt_number: receiptNumber,
            invoice_id: invoice.id,
            student_id: studentId,
            amount: remaining,
            payment_date: payDate,
            method,
            reference: reference || null,
            notes: notes ? `${notes} (${periodLabel})` : periodLabel,
            recorded_by: req.user.id
          })
          .select('id, receipt_number, amount')
          .single();
        if (payErr) { errors.push({ month, error: payErr.message }); continue; }

        receipts.push({ month, period_label: periodLabel, receipt_number: payment.receipt_number, amount: payment.amount });
      } catch (e) {
        errors.push({ month, error: e.message });
      }
    }

    res.json({
      success: true,
      paid_count: receipts.length,
      skipped_count: skipped.length,
      receipts,
      skipped,
      total_paid: receipts.reduce((s, r) => s + Number(r.amount), 0),
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('Erreur pay-months:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ── Statut d'un mois ventilé par SERVICE (paiement à la maille mois × service) ──
// Pour chaque mois du plan, renvoie la liste des services avec payé / reste /
// statut, plus un statut agrégé du mois (paid / partial / overdue / unpaid).
router.get('/students/:studentId/monthly-services-status', async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = getSchoolId(req);
    const academicYear = req.query.academic_year;
    if (!academicYear) return res.status(400).json({ error: 'academic_year requis' });

    const plan = await fetchStudentPlan(studentId, academicYear, schoolId);
    if (!plan) return res.json({ academic_year: academicYear, plan_exists: false, months: [], summary: null });

    const scheduleMonths = getScheduleMonths(plan);
    const periodLabels = scheduleMonths.map(m => periodLabelFor(academicYear, m));

    let invQ = supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, period_label, service_category, total, amount_paid, status, due_date')
      .eq('student_id', studentId)
      .neq('status', 'cancelled');
    if (schoolId) invQ = invQ.eq('school_id', schoolId);
    if (periodLabels.length > 0) invQ = invQ.in('period_label', periodLabels);
    const { data: invoices } = await invQ;

    const today = new Date().toISOString().split('T')[0];
    const statusOf = (paid, total, dueDate) => {
      if (paid >= total && total > 0) return 'paid';
      if (paid > 0) return 'partial';
      if (dueDate && dueDate < today) return 'overdue';
      return 'unpaid';
    };

    const months = scheduleMonths.map(m => {
      const label = periodLabelFor(academicYear, m);
      const monthInvs = (invoices || []).filter(i => i.period_label === label);
      const bundle = monthInvs.find(i => !i.service_category); // facture héritée « mois groupé »

      let services;
      if (bundle) {
        const paid = Number(bundle.amount_paid || 0);
        const total = Number(bundle.total || 0);
        services = [{
          category: null, label: 'Mensualité', expected: total, total, paid,
          remaining: Math.max(0, total - paid), invoice_id: bundle.id,
          invoice_number: bundle.invoice_number, status: statusOf(paid, total, bundle.due_date),
        }];
      } else {
        const byCat = {};
        monthInvs.forEach(i => { if (i.service_category) byCat[i.service_category] = i; });
        services = computeMonthServices(plan, m).map(s => {
          const inv = byCat[s.category];
          const total = inv ? Number(inv.total) : s.total;
          const paid = inv ? Number(inv.amount_paid || 0) : 0;
          return {
            category: s.category, label: s.name, expected: s.total, total, paid,
            remaining: Math.max(0, total - paid), invoice_id: inv?.id || null,
            invoice_number: inv?.invoice_number || null,
            status: inv ? statusOf(paid, total, inv.due_date) : 'pending',
          };
        });
      }

      const expected = services.reduce((a, s) => a + Number(s.total), 0);
      const paid = services.reduce((a, s) => a + Number(s.paid), 0);
      const remaining = services.reduce((a, s) => a + Number(s.remaining), 0);
      let status = 'unpaid';
      if (remaining <= 0 && expected > 0) status = 'paid';
      else if (paid > 0) status = 'partial';
      else if (services.some(s => s.status === 'overdue')) status = 'overdue';

      return { month: m, label, services, expected, paid, remaining, status };
    });

    const expectedTotal = months.reduce((s, mo) => s + Number(mo.expected), 0);
    const paidTotal = months.reduce((s, mo) => s + Number(mo.paid), 0);
    const remainingTotal = months.reduce((s, mo) => s + Number(mo.remaining), 0);

    res.json({
      academic_year: academicYear,
      plan_exists: true,
      currency: plan.template?.currency || 'MAD',
      months,
      summary: {
        expected_total: expectedTotal,
        paid_total: paidTotal,
        remaining_total: remainingTotal,
        all_paid: remainingTotal <= 0 && expectedTotal > 0,
        paid_months: months.filter(mo => mo.status === 'paid').length,
        total_months: months.length,
      },
    });
  } catch (error) {
    console.error('Erreur monthly-services-status:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Encaisser des SERVICES précis (couples mois × service). 1 reçu = 1 service/mois.
// La facture (period_label, service_category) est créée automatiquement si absente.
router.post('/students/:studentId/pay-services', async (req, res) => {
  try {
    const { studentId } = req.params;
    const schoolId = getSchoolId(req);
    const { academic_year, items, payment_date, method, reference, notes, due_day } = req.body;

    if (!academic_year) return res.status(400).json({ error: 'academic_year requis' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items[] requis' });
    if (!method) return res.status(400).json({ error: 'Méthode de paiement requise' });

    const plan = await fetchStudentPlan(studentId, academic_year, schoolId);
    if (!plan) return res.status(400).json({ error: 'Aucun plan de frais actif pour cet élève sur cette année' });

    const payDate = payment_date || new Date().toISOString().split('T')[0];
    const dueDay = String(due_day || 5).padStart(2, '0');

    const receipts = [];
    const skipped = [];
    const errors = [];

    for (const raw of items) {
      const month = Number(raw.month);
      const category = raw.category || null; // null = mois entier (compat)
      try {
        let lines, total;
        if (category) {
          const svc = computeMonthServices(plan, month).find(s => s.category === category);
          if (!svc || svc.total <= 0) { skipped.push({ month, category, reason: 'aucun frais' }); continue; }
          total = svc.total;
          lines = [{ description: svc.name, category, quantity: 1, unit_price: svc.total, amount: svc.total }];
        } else {
          const computed = computeMonthForPlan(plan, month);
          if (computed.total <= 0) { skipped.push({ month, reason: 'aucun frais' }); continue; }
          total = computed.total;
          lines = computed.lines;
        }

        const periodLabel = periodLabelFor(academic_year, month);
        const calYear = calendarYearFor(academic_year, month);
        const dueDate = `${calYear}-${String(month).padStart(2, '0')}-${dueDay}`;

        // Facture du couple (période, service) ou création automatique
        let invQ = supabaseAdmin
          .from('invoices')
          .select('id, total, amount_paid')
          .eq('student_id', studentId)
          .eq('period_label', periodLabel)
          .neq('status', 'cancelled');
        if (schoolId) invQ = invQ.eq('school_id', schoolId);
        invQ = category ? invQ.eq('service_category', category) : invQ.is('service_category', null);
        const { data: existingInv } = await invQ.maybeSingle();

        let invoice = existingInv;
        if (!invoice) {
          const invoiceNumber = await getNextCounter(schoolId, 'invoice');
          const subtotal = lines.reduce((s, l) => s + Number(l.amount), 0);
          const { data: newInv, error: invErr } = await supabaseAdmin
            .from('invoices')
            .insert({
              school_id: schoolId,
              invoice_number: invoiceNumber,
              student_id: studentId,
              plan_id: plan.id,
              due_date: dueDate,
              period_label: periodLabel,
              service_category: category,
              subtotal,
              discount: Math.max(0, subtotal - total),
              total,
              status: 'issued',
              created_by: req.user.id,
            })
            .select('id, total, amount_paid')
            .single();
          if (invErr) { errors.push({ month, category, error: invErr.message }); continue; }
          const linesToInsert = lines.map((l, idx) => ({ invoice_id: newInv.id, ...l, sort_order: idx }));
          await supabaseAdmin.from('invoice_lines').insert(linesToInsert);
          invoice = newInv;
        }

        const remaining = Number(invoice.total) - Number(invoice.amount_paid || 0);
        if (remaining <= 0) { skipped.push({ month, category, reason: 'déjà payé' }); continue; }

        const receiptNumber = await getNextCounter(schoolId, 'receipt');
        const tag = category ? `${periodLabel} — ${category}` : periodLabel;
        const { data: payment, error: payErr } = await supabaseAdmin
          .from('payments')
          .insert({
            school_id: schoolId,
            receipt_number: receiptNumber,
            invoice_id: invoice.id,
            student_id: studentId,
            amount: remaining,
            payment_date: payDate,
            method,
            reference: reference || null,
            notes: notes ? `${notes} (${tag})` : tag,
            recorded_by: req.user.id,
          })
          .select('id, receipt_number, amount')
          .single();
        if (payErr) { errors.push({ month, category, error: payErr.message }); continue; }

        receipts.push({ month, category, period_label: periodLabel, receipt_number: payment.receipt_number, amount: payment.amount });
      } catch (e) {
        errors.push({ month, category: raw.category, error: e.message });
      }
    }

    res.json({
      success: true,
      paid_count: receipts.length,
      skipped_count: skipped.length,
      receipts,
      skipped,
      total_paid: receipts.reduce((s, r) => s + Number(r.amount), 0),
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error('Erreur pay-services:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Encaisse UN service pour UN élève (crée la facture mois×service si absente).
// Helper interne réutilisé par pay-services groupés. Renvoie un objet résultat.
async function collectOneService({ plan, studentId, schoolId, academicYear, month, category, payDate, method, reference, notes, dueDay, userId }) {
  let lines, total;
  if (category) {
    const svc = computeMonthServices(plan, month).find(s => s.category === category);
    if (!svc || svc.total <= 0) return { skipped: 'aucun frais' };
    total = svc.total;
    lines = [{ description: svc.name, category, quantity: 1, unit_price: svc.total, amount: svc.total }];
  } else {
    const computed = computeMonthForPlan(plan, month);
    if (computed.total <= 0) return { skipped: 'aucun frais' };
    total = computed.total;
    lines = computed.lines;
  }

  const periodLabel = periodLabelFor(academicYear, month);
  const calYear = calendarYearFor(academicYear, month);
  const dueDate = `${calYear}-${String(month).padStart(2, '0')}-${dueDay}`;

  let invQ = supabaseAdmin
    .from('invoices')
    .select('id, total, amount_paid')
    .eq('student_id', studentId)
    .eq('period_label', periodLabel)
    .neq('status', 'cancelled');
  if (schoolId) invQ = invQ.eq('school_id', schoolId);
  invQ = category ? invQ.eq('service_category', category) : invQ.is('service_category', null);
  const { data: existingInv } = await invQ.maybeSingle();

  let invoice = existingInv;
  if (!invoice) {
    const invoiceNumber = await getNextCounter(schoolId, 'invoice');
    const subtotal = lines.reduce((s, l) => s + Number(l.amount), 0);
    const { data: newInv, error: invErr } = await supabaseAdmin
      .from('invoices')
      .insert({
        school_id: schoolId, invoice_number: invoiceNumber, student_id: studentId, plan_id: plan.id,
        due_date: dueDate, period_label: periodLabel, service_category: category,
        subtotal, discount: Math.max(0, subtotal - total), total, status: 'issued', created_by: userId,
      })
      .select('id, total, amount_paid')
      .single();
    if (invErr) return { error: invErr.message };
    await supabaseAdmin.from('invoice_lines').insert(lines.map((l, idx) => ({ invoice_id: newInv.id, ...l, sort_order: idx })));
    invoice = newInv;
  }

  const remaining = Number(invoice.total) - Number(invoice.amount_paid || 0);
  if (remaining <= 0) return { skipped: 'déjà payé' };

  const receiptNumber = await getNextCounter(schoolId, 'receipt');
  const tag = category ? `${periodLabel} — ${category}` : periodLabel;
  const { data: payment, error: payErr } = await supabaseAdmin
    .from('payments')
    .insert({
      school_id: schoolId, receipt_number: receiptNumber, invoice_id: invoice.id, student_id: studentId,
      amount: remaining, payment_date: payDate, method, reference: reference || null,
      notes: notes ? `${notes} (${tag})` : tag, recorded_by: userId,
    })
    .select('id, receipt_number, amount')
    .single();
  if (payErr) return { error: payErr.message };
  return { receipt: { receipt_number: payment.receipt_number, amount: payment.amount } };
}

// Paiements GROUPÉS : encaisse des couples mois×service pour plusieurs élèves
// (une classe entière ou une liste d'élèves) en une seule opération.
router.post('/pay-group', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { academic_year, class_id, student_ids, months, categories, method, payment_date, reference, due_day } = req.body;
    if (!academic_year) return res.status(400).json({ error: 'academic_year requis' });
    if (!Array.isArray(months) || months.length === 0) return res.status(400).json({ error: 'months[] requis' });
    if (!method) return res.status(400).json({ error: 'Méthode de paiement requise' });

    // Résolution des élèves cibles
    let studentIds = Array.isArray(student_ids) ? student_ids : [];
    if (studentIds.length === 0) {
      if (!class_id) return res.status(400).json({ error: 'class_id ou student_ids requis' });
      let sQ = supabaseAdmin.from('profiles').select('id').eq('role', 'student').eq('class_id', class_id);
      if (schoolId) sQ = sQ.eq('school_id', schoolId);
      const { data: studs } = await sQ;
      studentIds = (studs || []).map(s => s.id);
    }
    if (studentIds.length === 0) return res.json({ success: true, students_paid: 0, receipts_count: 0, total_paid: 0, details: [] });

    const payDate = payment_date || new Date().toISOString().split('T')[0];
    const dueDay = String(due_day || 5).padStart(2, '0');
    // 'all'/vide → tous les services dus du mois ; sinon liste de catégories.
    const wantCats = Array.isArray(categories) && categories.length > 0 && categories[0] !== 'all'
      ? categories : null;

    const details = [];
    let receiptsCount = 0;
    let totalPaid = 0;
    let studentsPaid = 0;

    for (const studentId of studentIds) {
      const plan = await fetchStudentPlan(studentId, academic_year, schoolId);
      if (!plan) { details.push({ student_id: studentId, skipped: 'pas de plan' }); continue; }
      let studReceipts = 0;
      let studAmount = 0;
      for (const rawMonth of months) {
        const month = Number(rawMonth);
        const svcCats = (computeMonthServices(plan, month) || [])
          .map(s => s.category)
          .filter(c => !wantCats || wantCats.includes(c));
        for (const category of svcCats) {
          const r = await collectOneService({ plan, studentId, schoolId, academicYear: academic_year, month, category, payDate, method, reference, dueDay, userId: req.user.id });
          if (r.receipt) { studReceipts += 1; studAmount += Number(r.receipt.amount); }
        }
      }
      if (studReceipts > 0) { studentsPaid += 1; receiptsCount += studReceipts; totalPaid += studAmount; }
      details.push({ student_id: studentId, receipts: studReceipts, amount: studAmount });
    }

    res.json({ success: true, students_paid: studentsPaid, receipts_count: receiptsCount, total_paid: totalPaid, details });
  } catch (error) {
    console.error('Erreur pay-group:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Aperçu (read-only) des paiements groupés : pour chaque élève cible, montant
// encore dû sur les mois × services sélectionnés. N'écrit rien.
router.post('/pay-group/preview', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { academic_year, class_id, student_ids, months, categories } = req.body;
    if (!academic_year || !Array.isArray(months) || months.length === 0) {
      return res.status(400).json({ error: 'academic_year et months[] requis' });
    }

    let studentIds = Array.isArray(student_ids) ? student_ids : [];
    if (studentIds.length === 0) {
      if (!class_id) return res.status(400).json({ error: 'class_id ou student_ids requis' });
      let sQ = supabaseAdmin.from('profiles').select('id, first_name, last_name').eq('role', 'student').eq('class_id', class_id);
      if (schoolId) sQ = sQ.eq('school_id', schoolId);
      const { data: studs } = await sQ;
      studentIds = (studs || []).map(s => s.id);
    }

    const wantCats = Array.isArray(categories) && categories.length > 0 && categories[0] !== 'all' ? categories : null;
    const rows = [];
    let totalDue = 0;

    for (const studentId of studentIds) {
      const plan = await fetchStudentPlan(studentId, academic_year, schoolId);
      if (!plan) continue;
      const periodLabels = months.map(m => periodLabelFor(academic_year, Number(m)));
      let invQ = supabaseAdmin.from('invoices')
        .select('period_label, service_category, total, amount_paid, status')
        .eq('student_id', studentId).neq('status', 'cancelled').in('period_label', periodLabels);
      if (schoolId) invQ = invQ.eq('school_id', schoolId);
      const { data: invs } = await invQ;

      let due = 0;
      for (const rawMonth of months) {
        const month = Number(rawMonth);
        const label = periodLabelFor(academic_year, month);
        for (const s of computeMonthServices(plan, month)) {
          if (wantCats && !wantCats.includes(s.category)) continue;
          const inv = (invs || []).find(i => i.period_label === label && i.service_category === s.category);
          const total = inv ? Number(inv.total) : s.total;
          const paid = inv ? Number(inv.amount_paid || 0) : 0;
          due += Math.max(0, total - paid);
        }
      }
      if (due > 0) { rows.push({ student_id: studentId, due }); totalDue += due; }
    }

    res.json({ students_with_due: rows.length, total_due: totalDue, rows });
  } catch (error) {
    console.error('Erreur pay-group/preview:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ============================================================
// FACTURES
// ============================================================
router.get('/invoices', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { status, student_id, class_id, from, to, academic_year, search } = req.query;

    let query = supabaseAdmin
      .from('invoices')
      .select(`*,
        student:profiles!invoices_student_id_fkey(id, first_name, last_name, class_id, classes!fk_profiles_class(id, name))
      `)
      .order('issue_date', { ascending: false })
      .limit(500);

    if (schoolId) query = query.eq('school_id', schoolId);
    if (status) query = query.eq('status', status);
    if (student_id) query = query.eq('student_id', student_id);
    if (from) query = query.gte('issue_date', from);
    if (to) query = query.lte('issue_date', to);
    // Scope par année scolaire (plage de dates) si fournie et sans from/to explicites.
    const invRange = academicYearRange(academic_year);
    if (invRange && !from && !to) query = query.gte('issue_date', invRange.start).lte('issue_date', invRange.end);

    const { data, error } = await query;
    if (error) throw error;

    let filtered = data || [];
    if (class_id) filtered = filtered.filter(i => i.student?.class_id === class_id);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(i =>
        i.invoice_number?.toLowerCase().includes(q) ||
        i.student?.first_name?.toLowerCase().includes(q) ||
        i.student?.last_name?.toLowerCase().includes(q)
      );
    }

    res.json({ invoices: filtered, total: filtered.length });
  } catch (error) {
    console.error('Erreur fetch invoices:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select(`*,
        student:profiles!invoices_student_id_fkey(id, first_name, last_name, email, class_id, classes!fk_profiles_class(id, name)),
        school:schools(id, name, logo_url, address, phone),
        lines:invoice_lines(*),
        payments:payments(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    res.json({ invoice: data });
  } catch (error) {
    console.error('Erreur fetch invoice:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une facture manuelle
router.post('/invoices', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { student_id, due_date, period_label, lines, notes, discount } = req.body;
    if (!student_id || !due_date || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'student_id, due_date et lignes requis' });
    }

    const subtotal = lines.reduce((sum, l) => sum + (Number(l.amount) || (Number(l.unit_price) * Number(l.quantity || 1))), 0);
    const total = Math.max(0, subtotal - Number(discount || 0));

    const invoiceNumber = await getNextCounter(schoolId, 'invoice');

    const { data: inv, error } = await supabaseAdmin
      .from('invoices')
      .insert({
        school_id: schoolId,
        invoice_number: invoiceNumber,
        student_id,
        due_date,
        period_label: period_label || null,
        subtotal, discount: Number(discount || 0), total,
        notes: notes || null,
        status: 'issued',
        created_by: req.user.id
      })
      .select()
      .single();
    if (error) throw error;

    const linesToInsert = lines.map((l, idx) => ({
      invoice_id: inv.id,
      description: l.description,
      category: l.category || null,
      quantity: Number(l.quantity || 1),
      unit_price: Number(l.unit_price || l.amount || 0),
      amount: Number(l.amount) || (Number(l.unit_price || 0) * Number(l.quantity || 1)),
      sort_order: idx
    }));
    await supabaseAdmin.from('invoice_lines').insert(linesToInsert);

    res.json({ success: true, invoice: inv });
  } catch (error) {
    console.error('Erreur create invoice:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Génération mensuelle en lot
router.post('/invoices/generate-monthly', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { academic_year, month, year, due_day, class_id } = req.body;
    if (!academic_year || !month || !year) {
      return res.status(400).json({ error: 'academic_year, month, year requis' });
    }

    // Récupérer les plans actifs
    let plansQuery = supabaseAdmin
      .from('student_fee_plans')
      .select(`*,
        student:profiles!student_fee_plans_student_id_fkey(id, first_name, last_name, class_id, school_id),
        template:fee_templates(*, fee_template_items(*)),
        custom_items:student_fee_plan_items(*)
      `)
      .eq('academic_year', academic_year)
      .eq('status', 'active');
    if (schoolId) plansQuery = plansQuery.eq('school_id', schoolId);

    const { data: plans, error } = await plansQuery;
    if (error) throw error;

    let filteredPlans = plans || [];
    if (class_id) filteredPlans = filteredPlans.filter(p => p.student?.class_id === class_id);

    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(due_day || 5).padStart(2, '0')}`;
    const periodLabel = `${getMonthName(month)} ${year}`;

    let createdCount = 0;
    let skippedCount = 0;
    let errors = [];

    for (const plan of filteredPlans) {
      try {
        // Calcul des lignes + totaux pour ce mois (helper partagé)
        const { lines: applicableLines, subtotal, discount, total } = computeMonthForPlan(plan, month);

        if (applicableLines.length === 0) { skippedCount++; continue; }

        // Vérifier doublon (même élève, même période)
        const { data: existing } = await supabaseAdmin
          .from('invoices')
          .select('id')
          .eq('student_id', plan.student_id)
          .eq('period_label', periodLabel)
          .neq('status', 'cancelled')
          .maybeSingle();
        if (existing) { skippedCount++; continue; }

        const invoiceNumber = await getNextCounter(schoolId, 'invoice');

        const { data: inv, error: invErr } = await supabaseAdmin
          .from('invoices')
          .insert({
            school_id: schoolId,
            invoice_number: invoiceNumber,
            student_id: plan.student_id,
            plan_id: plan.id,
            due_date: dueDate,
            period_label: periodLabel,
            subtotal, discount, total,
            status: 'issued',
            created_by: req.user.id
          })
          .select()
          .single();
        if (invErr) { errors.push(invErr.message); continue; }

        const linesToInsert = applicableLines.map((l, idx) => ({
          invoice_id: inv.id, ...l, sort_order: idx
        }));
        await supabaseAdmin.from('invoice_lines').insert(linesToInsert);
        createdCount++;
      } catch (e) {
        errors.push(e.message);
      }
    }

    res.json({
      success: true,
      created_count: createdCount,
      skipped_count: skippedCount,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('Erreur generate-monthly:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

router.put('/invoices/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!isAdminRole(req)) return res.status(403).json({ error: 'Seul un admin peut annuler' });

    // Bloquer l'annulation d'une facture ayant des paiements confirmés
    // (sinon l'argent encaissé resterait sans facture → écart de caisse).
    const { data: pays } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('invoice_id', id)
      .eq('status', 'confirmed')
      .limit(1);
    if (pays && pays.length > 0) {
      return res.status(400).json({ error: 'Facture déjà payée : annulez d\'abord le(s) paiement(s) associé(s).' });
    }

    const { error } = await supabaseAdmin
      .from('invoices')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: req.user.id,
        cancellation_reason: reason || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur cancel invoice:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Marquer les factures échues comme overdue (endpoint utilitaire)
router.post('/invoices/mark-overdue', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const today = new Date().toISOString().split('T')[0];
    let query = supabaseAdmin
      .from('invoices')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .in('status', ['issued', 'partial'])
      .lt('due_date', today);
    if (schoolId) query = query.eq('school_id', schoolId);
    await query;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur mark-overdue:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// PAIEMENTS
// ============================================================
router.get('/payments', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { from, to, method, student_id, invoice_id, academic_year } = req.query;

    let query = supabaseAdmin
      .from('payments')
      .select(`*,
        student:profiles!payments_student_id_fkey(id, first_name, last_name, class_id, classes!fk_profiles_class(id, name)),
        school:schools(id, name, logo_url, address, phone),
        invoice:invoices(id, invoice_number, total, period_label),
        cashier:profiles!payments_recorded_by_fkey(id, first_name, last_name)
      `)
      .eq('status', 'confirmed')
      .order('payment_date', { ascending: false })
      .limit(500);
    if (schoolId) query = query.eq('school_id', schoolId);
    if (from) query = query.gte('payment_date', from);
    if (to) query = query.lte('payment_date', to);
    // Scope par année scolaire (plage de dates) si fournie et sans from/to explicites.
    const payRange = academicYearRange(academic_year);
    if (payRange && !from && !to) query = query.gte('payment_date', payRange.start).lte('payment_date', payRange.end);
    if (method) query = query.eq('method', method);
    if (student_id) query = query.eq('student_id', student_id);
    if (invoice_id) query = query.eq('invoice_id', invoice_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ payments: data || [] });
  } catch (error) {
    console.error('Erreur fetch payments:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { invoice_id, student_id, amount, payment_date, method, reference, notes } = req.body;
    if (!student_id || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'student_id et amount > 0 requis' });
    }
    if (!method) return res.status(400).json({ error: 'Méthode de paiement requise' });

    const receiptNumber = await getNextCounter(schoolId, 'receipt');

    const { data: payment, error } = await supabaseAdmin
      .from('payments')
      .insert({
        school_id: schoolId,
        receipt_number: receiptNumber,
        invoice_id: invoice_id || null,
        student_id,
        amount: Number(amount),
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        method,
        reference: reference || null,
        notes: notes || null,
        recorded_by: req.user.id
      })
      .select()
      .single();
    if (error) throw error;

    res.json({ success: true, payment });
  } catch (error) {
    console.error('Erreur create payment:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ============================================================
// CAISSE — récap des encaissements (et dépenses) par période et mode
// ============================================================
router.get('/cash-register', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from et to requis' });

    const METHODS = ['cash', 'check', 'transfer', 'card_pos', 'other'];
    const emptyByMethod = () => METHODS.reduce((a, m) => ({ ...a, [m]: { total: 0, count: 0 } }), {});

    // Encaissements (paiements confirmés)
    let payQ = supabaseAdmin
      .from('payments')
      .select(`id, receipt_number, amount, payment_date, method, reference, status,
        student:profiles!payments_student_id_fkey(first_name, last_name, classes!fk_profiles_class(name)),
        cashier:profiles!payments_recorded_by_fkey(first_name, last_name)`)
      .eq('status', 'confirmed')
      .gte('payment_date', from)
      .lte('payment_date', to)
      .order('payment_date', { ascending: false });
    if (schoolId) payQ = payQ.eq('school_id', schoolId);
    const { data: payments, error: payErr } = await payQ;
    if (payErr) throw payErr;

    const incomeByMethod = emptyByMethod();
    let incomeTotal = 0;
    const byDay = {};
    for (const p of payments || []) {
      const m = METHODS.includes(p.method) ? p.method : 'other';
      const amt = Number(p.amount || 0);
      incomeByMethod[m].total += amt;
      incomeByMethod[m].count += 1;
      incomeTotal += amt;
      const d = String(p.payment_date).slice(0, 10);
      if (!byDay[d]) byDay[d] = { date: d, income: 0, expense: 0 };
      byDay[d].income += amt;
    }

    // Dépenses (caisse sortante) — uniquement pour les admins
    const expenseByMethod = emptyByMethod();
    let expenseTotal = 0;
    if (isAdminRole(req)) {
      let expQ = supabaseAdmin
        .from('school_expenses')
        .select('amount, expense_date, payment_method')
        .gte('expense_date', from)
        .lte('expense_date', to);
      if (schoolId) expQ = expQ.eq('school_id', schoolId);
      const { data: expenses } = await expQ;
      for (const e of expenses || []) {
        const m = METHODS.includes(e.payment_method) ? e.payment_method : 'other';
        const amt = Number(e.amount || 0);
        expenseByMethod[m].total += amt;
        expenseByMethod[m].count += 1;
        expenseTotal += amt;
        const d = String(e.expense_date).slice(0, 10);
        if (!byDay[d]) byDay[d] = { date: d, income: 0, expense: 0 };
        byDay[d].expense += amt;
      }
    }

    res.json({
      period: { from, to },
      income: { total: incomeTotal, count: (payments || []).length, by_method: incomeByMethod },
      expense: { total: expenseTotal, by_method: expenseByMethod },
      net: incomeTotal - expenseTotal,
      by_day: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      payments: (payments || []).slice(0, 200),
    });
  } catch (error) {
    console.error('Erreur cash-register:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

router.get('/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select(`*,
        student:profiles!payments_student_id_fkey(id, first_name, last_name, class_id, classes!fk_profiles_class(id, name), school_id, schools(name, logo_url, address, phone)),
        invoice:invoices(id, invoice_number, total, period_label, due_date)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    res.json({ payment: data });
  } catch (error) {
    console.error('Erreur fetch payment:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/payments/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!isAdminRole(req)) return res.status(403).json({ error: 'Seul un admin peut annuler' });

    const { error } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: req.user.id,
        cancellation_reason: reason || null
      })
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur cancel payment:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// DASHBOARD / KPIs
// ============================================================
router.get('/dashboard/summary', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const today = new Date();
    const range = academicYearRange(req.query.academic_year);
    // Période d'agrégation : toute l'année scolaire si fournie, sinon le mois en cours.
    const periodStart = range ? range.start : new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd = range ? range.end : new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    // Encaissé sur la période
    let paidQuery = supabaseAdmin
      .from('payments')
      .select('amount')
      .eq('status', 'confirmed')
      .gte('payment_date', periodStart)
      .lte('payment_date', periodEnd);
    if (schoolId) paidQuery = paidQuery.eq('school_id', schoolId);
    const { data: paidRows } = await paidQuery;
    const collectedThisMonth = (paidRows || []).reduce((s, r) => s + Number(r.amount), 0);

    // Dû total (non annulé, non payé) — scopé à l'année active si fournie.
    let dueQuery = supabaseAdmin
      .from('invoices')
      .select('total, amount_paid, due_date, status')
      .in('status', ['issued', 'partial', 'overdue']);
    if (schoolId) dueQuery = dueQuery.eq('school_id', schoolId);
    if (range) dueQuery = dueQuery.gte('issue_date', range.start).lte('issue_date', range.end);
    const { data: dueRows } = await dueQuery;

    const totalDue = (dueRows || []).reduce((s, r) => s + (Number(r.total) - Number(r.amount_paid || 0)), 0);
    const todayStr = today.toISOString().split('T')[0];
    const overdueRows = (dueRows || []).filter(r => r.due_date < todayStr);
    const totalOverdue = overdueRows.reduce((s, r) => s + (Number(r.total) - Number(r.amount_paid || 0)), 0);
    const overdueCount = overdueRows.length;

    // Factures émises sur la période
    let issuedQuery = supabaseAdmin
      .from('invoices')
      .select('total')
      .gte('issue_date', periodStart)
      .lte('issue_date', periodEnd)
      .neq('status', 'cancelled');
    if (schoolId) issuedQuery = issuedQuery.eq('school_id', schoolId);
    const { data: issuedRows } = await issuedQuery;
    const issuedThisMonth = (issuedRows || []).reduce((s, r) => s + Number(r.total), 0);

    res.json({
      collectedThisMonth,
      issuedThisMonth,
      totalDue,
      totalOverdue,
      overdueCount,
      collectionRate: issuedThisMonth > 0 ? (collectedThisMonth / issuedThisMonth) * 100 : 0
    });
  } catch (error) {
    console.error('Erreur dashboard summary:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/dashboard/cashflow', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const months = Number(req.query.months || 6);

    const result = [];
    const today = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const first = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];

      let q = supabaseAdmin.from('payments').select('amount').eq('status', 'confirmed').gte('payment_date', first).lte('payment_date', last);
      if (schoolId) q = q.eq('school_id', schoolId);
      const { data } = await q;
      const collected = (data || []).reduce((s, r) => s + Number(r.amount), 0);

      let qi = supabaseAdmin.from('invoices').select('total').gte('issue_date', first).lte('issue_date', last).neq('status', 'cancelled');
      if (schoolId) qi = qi.eq('school_id', schoolId);
      const { data: invData } = await qi;
      const issued = (invData || []).reduce((s, r) => s + Number(r.total), 0);

      result.push({
        month: `${getMonthName(d.getMonth() + 1)} ${d.getFullYear()}`,
        month_short: getMonthName(d.getMonth() + 1).substring(0, 3),
        collected, issued
      });
    }
    res.json({ cashflow: result });
  } catch (error) {
    console.error('Erreur cashflow:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/dashboard/by-class', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const range = academicYearRange(req.query.academic_year);
    let invQuery = supabaseAdmin
      .from('invoices')
      .select('total, amount_paid, issue_date, student:profiles!invoices_student_id_fkey(class_id, classes!fk_profiles_class(id, name))')
      .neq('status', 'cancelled');
    if (schoolId) invQuery = invQuery.eq('school_id', schoolId);
    if (range) invQuery = invQuery.gte('issue_date', range.start).lte('issue_date', range.end);
    const { data } = await invQuery;

    const byClass = {};
    (data || []).forEach(inv => {
      const cls = inv.student?.classes;
      if (!cls) return;
      if (!byClass[cls.id]) byClass[cls.id] = { class_id: cls.id, class_name: cls.name, total: 0, paid: 0 };
      byClass[cls.id].total += Number(inv.total);
      byClass[cls.id].paid += Number(inv.amount_paid || 0);
    });

    const classes = Object.values(byClass).map(c => ({
      ...c,
      due: c.total - c.paid,
      rate: c.total > 0 ? (c.paid / c.total) * 100 : 0
    })).sort((a, b) => a.rate - b.rate);

    res.json({ classes });
  } catch (error) {
    console.error('Erreur by-class:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// RAPPORTS FINANCIERS — synthèse exportable par période / mois / jour
// ============================================================
router.get('/reports/summary', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from et to requis' });

    const METHODS = ['cash', 'check', 'transfer', 'card_pos', 'other'];
    const emptyByMethod = () => METHODS.reduce((a, m) => ({ ...a, [m]: { total: 0, count: 0 } }), {});
    const monthKey = (d) => String(d).slice(0, 7); // YYYY-MM
    const monthLabelFromKey = (k) => {
      const [y, m] = k.split('-');
      return `${getMonthName(Number(m))} ${y}`;
    };

    // ---- Encaissements (paiements confirmés sur la période) ----
    let payQ = supabaseAdmin
      .from('payments')
      .select(`id, receipt_number, amount, payment_date, method, reference, invoice_id,
        student:profiles!payments_student_id_fkey(first_name, last_name, classes!fk_profiles_class(name))`)
      .eq('status', 'confirmed')
      .gte('payment_date', from)
      .lte('payment_date', to)
      .order('payment_date', { ascending: false });
    if (schoolId) payQ = payQ.eq('school_id', schoolId);
    const { data: payments, error: payErr } = await payQ;
    if (payErr) throw payErr;

    const incomeByMethod = emptyByMethod();
    const incomeByDay = {};
    const incomeByMonth = {};
    let incomeTotal = 0;
    for (const p of payments || []) {
      const m = METHODS.includes(p.method) ? p.method : 'other';
      const amt = Number(p.amount || 0);
      incomeByMethod[m].total += amt;
      incomeByMethod[m].count += 1;
      incomeTotal += amt;
      const d = String(p.payment_date).slice(0, 10);
      incomeByDay[d] = (incomeByDay[d] || 0) + amt;
      incomeByMonth[monthKey(d)] = (incomeByMonth[monthKey(d)] || 0) + amt;
    }

    // ---- Dépenses (sorties de caisse) — admin uniquement ----
    const expenseByCategory = {};
    const expenseByDay = {};
    const expenseByMonth = {};
    let expenseTotal = 0;
    let expensesDetail = [];
    if (isAdminRole(req)) {
      let expQ = supabaseAdmin
        .from('school_expenses')
        .select('amount, expense_date, payment_method, category, description, paid_to, account_id')
        .gte('expense_date', from)
        .lte('expense_date', to)
        .order('expense_date', { ascending: false });
      if (schoolId) expQ = expQ.eq('school_id', schoolId);
      const { data: expenses } = await expQ;
      expensesDetail = expenses || [];
      for (const e of expensesDetail) {
        const amt = Number(e.amount || 0);
        const cat = e.category || 'other';
        if (!expenseByCategory[cat]) expenseByCategory[cat] = { total: 0, count: 0 };
        expenseByCategory[cat].total += amt;
        expenseByCategory[cat].count += 1;
        expenseTotal += amt;
        const d = String(e.expense_date).slice(0, 10);
        expenseByDay[d] = (expenseByDay[d] || 0) + amt;
        expenseByMonth[monthKey(d)] = (expenseByMonth[monthKey(d)] || 0) + amt;
      }
    }

    // ---- Ventilation combinée par jour et par mois ----
    const dayKeys = Array.from(new Set([...Object.keys(incomeByDay), ...Object.keys(expenseByDay)])).sort();
    const byDay = dayKeys.map(d => ({
      date: d,
      income: incomeByDay[d] || 0,
      expense: expenseByDay[d] || 0,
      net: (incomeByDay[d] || 0) - (expenseByDay[d] || 0),
    }));
    const monthKeys = Array.from(new Set([...Object.keys(incomeByMonth), ...Object.keys(expenseByMonth)])).sort();
    const byMonth = monthKeys.map(k => ({
      key: k,
      label: monthLabelFromKey(k),
      income: incomeByMonth[k] || 0,
      expense: expenseByMonth[k] || 0,
      net: (incomeByMonth[k] || 0) - (expenseByMonth[k] || 0),
    }));

    // ---- Recouvrement ----
    // Facturé sur la période (factures émises entre from et to)
    let issuedQ = supabaseAdmin
      .from('invoices')
      .select('id, total')
      .gte('issue_date', from)
      .lte('issue_date', to)
      .neq('status', 'cancelled');
    if (schoolId) issuedQ = issuedQ.eq('school_id', schoolId);
    const { data: issuedRows } = await issuedQ;
    const invoicedPeriod = (issuedRows || []).reduce((s, r) => s + Number(r.total), 0);

    // Reste à recouvrer GLOBAL (dette réelle) + ventilation par classe
    let allInvQ = supabaseAdmin
      .from('invoices')
      .select('total, amount_paid, student:profiles!invoices_student_id_fkey(classes!fk_profiles_class(id, name))')
      .neq('status', 'cancelled');
    if (schoolId) allInvQ = allInvQ.eq('school_id', schoolId);
    const { data: allInv } = await allInvQ;

    const byClassMap = {};
    let invoicedTotal = 0;
    let paidTotal = 0;
    let outstandingTotal = 0;
    (allInv || []).forEach(inv => {
      const t = Number(inv.total);
      const p = Number(inv.amount_paid || 0);
      invoicedTotal += t;
      paidTotal += p;
      outstandingTotal += (t - p);
      const cls = inv.student?.classes;
      const key = cls?.id || 'none';
      if (!byClassMap[key]) byClassMap[key] = { class_name: cls?.name || 'Sans classe', invoiced: 0, paid: 0 };
      byClassMap[key].invoiced += t;
      byClassMap[key].paid += p;
    });
    const byClass = Object.values(byClassMap).map(c => ({
      ...c,
      remaining: c.invoiced - c.paid,
      rate: c.invoiced > 0 ? (c.paid / c.invoiced) * 100 : 0,
    })).sort((a, b) => a.rate - b.rate);

    // ---- Découpage réel par flux (recettes) et par poste comptable (dépenses) ----
    // Sur la période EXACTE demandée (au jour près), uniquement le réel.
    let accounts = [];
    if (schoolId) {
      const { data: accRows } = await supabaseAdmin
        .from('finance_account').select('*').eq('school_id', schoolId).order('sort_order');
      accounts = accRows || [];
    }
    const defaultKeyToId = {};
    accounts.forEach((a) => { if (a.default_key) defaultKeyToId[a.default_key] = a.id; });
    const streamName = {};
    accounts
      .filter((a) => a.kind === 'revenue' && a.node_type === 'line' && a.revenue_stream)
      .forEach((a) => { if (!streamName[a.revenue_stream]) streamName[a.revenue_stream] = a.name; });

    // Lignes de facture nécessaires : factures émises sur la période + factures réglées par les paiements de la période
    const periodInvIds = (issuedRows || []).map((r) => r.id);
    const periodInvSet = new Set(periodInvIds);
    const paidInvIds = (payments || []).map((p) => p.invoice_id).filter(Boolean);
    const allInvIds = Array.from(new Set([...periodInvIds, ...paidInvIds]));
    const linesByInvoice = {};
    if (allInvIds.length) {
      const { data: ld } = await supabaseAdmin
        .from('invoice_lines').select('invoice_id, category, amount').in('invoice_id', allInvIds);
      (ld || []).forEach((l) => { (linesByInvoice[l.invoice_id] = linesByInvoice[l.invoice_id] || []).push(l); });
    }
    // Facturé par flux (lignes des factures émises sur la période)
    const billedByStream = {};
    periodInvIds.forEach((invId) => {
      (linesByInvoice[invId] || []).forEach((l) => {
        const s = streamOfCategory(l.category);
        billedByStream[s] = (billedByStream[s] || 0) + Number(l.amount || 0);
      });
    });
    // Encaissé par flux (paiements de la période ventilés selon les lignes de la facture réglée)
    const collectedByStream = {};
    const addColl = (s, v) => { collectedByStream[s] = (collectedByStream[s] || 0) + v; };
    (payments || []).forEach((p) => {
      const amt = Number(p.amount || 0);
      const il = p.invoice_id ? linesByInvoice[p.invoice_id] : null;
      if (il && il.length) {
        const tot = il.reduce((s, x) => s + Number(x.amount || 0), 0);
        if (tot > 0) il.forEach((x) => addColl(streamOfCategory(x.category), amt * (Number(x.amount || 0) / tot)));
        else addColl('other', amt);
      } else addColl('other', amt);
    });
    const streamKeys = Array.from(new Set([...Object.keys(billedByStream), ...Object.keys(collectedByStream)]));
    const revenueByStream = streamKeys.map((s) => ({
      stream: s,
      name: streamName[s] || STREAM_LABEL_FALLBACK[s] || s,
      billed: billedByStream[s] || 0,
      collected: collectedByStream[s] || 0,
      impayes: (billedByStream[s] || 0) - (collectedByStream[s] || 0),
    })).sort((a, b) => b.collected - a.collected);

    // Dépenses réelles par poste comptable (regroupées par section) — période exacte
    const actualByAccount = {};
    let unmappedExpense = 0;
    expensesDetail.forEach((e) => {
      let accId = e.account_id || defaultKeyToId[EXP_DEFAULT_OF_CATEGORY[e.category] || 'misc'];
      if (!accId) { unmappedExpense += Number(e.amount || 0); return; }
      actualByAccount[accId] = (actualByAccount[accId] || 0) + Number(e.amount || 0);
    });
    const expSecAccounts = accounts.filter((a) => a.kind === 'expense' && a.node_type === 'section');
    const expLineAccounts = accounts.filter((a) => a.kind === 'expense' && a.node_type === 'line' && a.is_active);
    const buildLines = (lines) => lines
      .map((a) => ({ id: a.id, name: a.name, amount: actualByAccount[a.id] || 0 }))
      .filter((l) => l.amount !== 0);
    const expenseSections = [];
    expSecAccounts.forEach((sec) => {
      const secLines = buildLines(expLineAccounts.filter((l) => l.parent_id === sec.id));
      if (secLines.length) {
        expenseSections.push({ name: sec.name, lines: secLines, subtotal: secLines.reduce((s, l) => s + l.amount, 0) });
      }
    });
    const orphanLines = buildLines(expLineAccounts.filter((l) => !expSecAccounts.some((s) => s.id === l.parent_id)));
    const otherLines = [...orphanLines];
    if (unmappedExpense !== 0) otherLines.push({ id: 'unmapped', name: 'Non affecté', amount: unmappedExpense });
    if (otherLines.length) {
      expenseSections.push({ name: 'Autres dépenses', lines: otherLines, subtotal: otherLines.reduce((s, l) => s + l.amount, 0) });
    }
    const expenseByAccountTotal = expenseSections.reduce((s, sec) => s + sec.subtotal, 0);

    res.json({
      period: { from, to },
      income: { total: incomeTotal, count: (payments || []).length, by_method: incomeByMethod },
      expense: { total: expenseTotal, count: expensesDetail.length, by_category: expenseByCategory },
      net: incomeTotal - expenseTotal,
      by_day: byDay,
      by_month: byMonth,
      by_stream: {
        revenue: revenueByStream,
        billed_total: revenueByStream.reduce((s, r) => s + r.billed, 0),
        collected_total: revenueByStream.reduce((s, r) => s + r.collected, 0),
        impayes_total: revenueByStream.reduce((s, r) => s + r.impayes, 0),
        expense_sections: expenseSections,
        expense_total: expenseByAccountTotal,
      },
      recouvrement: {
        invoiced_period: invoicedPeriod,
        collected_period: incomeTotal,
        invoiced_total: invoicedTotal,
        paid_total: paidTotal,
        outstanding_total: outstandingTotal,
        rate: invoicedTotal > 0 ? (paidTotal / invoicedTotal) * 100 : 0,
        by_class: byClass,
      },
      payments: (payments || []).slice(0, 1000),
      expenses: expensesDetail.slice(0, 1000),
    });
  } catch (error) {
    console.error('Erreur reports/summary:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ============================================================
// RETARDS & RELANCES
// ============================================================
router.get('/overdue', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const today = new Date().toISOString().split('T')[0];

    let query = supabaseAdmin
      .from('invoices')
      .select(`*,
        student:profiles!invoices_student_id_fkey(id, first_name, last_name, class_id, classes!fk_profiles_class(id, name))
      `)
      .in('status', ['issued', 'partial', 'overdue'])
      .lt('due_date', today)
      .order('due_date', { ascending: true });
    if (schoolId) query = query.eq('school_id', schoolId);
    // Scope par année scolaire (plage de dates) si fournie.
    const ovRange = academicYearRange(req.query.academic_year);
    if (ovRange) query = query.gte('issue_date', ovRange.start).lte('issue_date', ovRange.end);

    const { data, error } = await query;
    if (error) throw error;

    const enriched = (data || []).map(inv => ({
      ...inv,
      days_overdue: Math.floor((new Date(today) - new Date(inv.due_date)) / (1000 * 60 * 60 * 24)),
      remaining: Number(inv.total) - Number(inv.amount_paid || 0)
    }));

    res.json({ overdue: enriched, total: enriched.length });
  } catch (error) {
    console.error('Erreur overdue:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// DÉPENSES ÉCOLE (admin only)
// ============================================================
router.get('/expenses', async (req, res) => {
  try {
    if (!isAdminRole(req)) return res.status(403).json({ error: 'Accès admin requis' });
    const schoolId = getSchoolId(req);
    const { from, to, category, account_id, academic_year } = req.query;

    let q = supabaseAdmin.from('school_expenses').select('*').order('expense_date', { ascending: false }).limit(500);
    if (schoolId) q = q.eq('school_id', schoolId);
    if (from) q = q.gte('expense_date', from);
    if (to) q = q.lte('expense_date', to);
    // Scope par année scolaire (plage de dates) si fournie et sans from/to explicites.
    const expRange = academicYearRange(academic_year);
    if (expRange && !from && !to) q = q.gte('expense_date', expRange.start).lte('expense_date', expRange.end);
    if (category) q = q.eq('category', category);
    if (account_id) q = q.eq('account_id', account_id);

    const { data, error } = await q;
    if (error) throw error;
    res.json({ expenses: data || [] });
  } catch (error) {
    console.error('Erreur expenses:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    if (!isAdminRole(req)) return res.status(403).json({ error: 'Accès admin requis' });
    const schoolId = getSchoolId(req);
    const { account_id, category, description, amount, expense_date, paid_to, payment_method, reference, notes } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Champs requis manquants' });

    const { data, error } = await supabaseAdmin
      .from('school_expenses')
      .insert({
        school_id: schoolId,
        account_id: account_id || null,
        category: category || 'other',
        description,
        amount: Number(amount),
        expense_date: expense_date || new Date().toISOString().split('T')[0],
        paid_to, payment_method, reference, notes,
        recorded_by: req.user.id
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, expense: data });
  } catch (error) {
    console.error('Erreur create expense:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message, code: error.code, hint: error.hint });
  }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    if (!isAdminRole(req)) return res.status(403).json({ error: 'Accès admin requis' });
    const { id } = req.params;
    await supabaseAdmin.from('school_expenses').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// LISTE ÉLÈVES AVEC STATUS FINANCIER
// ============================================================
router.get('/students', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { class_id, academic_year } = req.query;
    const range = academicYearRange(academic_year);

    // Liste des élèves : par année active = inscriptions actives (student_enrollments),
    // avec la classe de CETTE année ; sinon (ou si table absente) → profils courants.
    let students = null;
    if (academic_year) {
      let enrQ = supabaseAdmin
        .from('student_enrollments')
        .select('student_id, class_id, class:classes!student_enrollments_class_id_fkey(id, name)')
        .eq('academic_year', academic_year)
        .neq('status', 'NR');
      if (schoolId) enrQ = enrQ.eq('school_id', schoolId);
      if (class_id) enrQ = enrQ.eq('class_id', class_id);
      const { data: enr, error: enrErr } = await enrQ;
      if (!enrErr && enr) {
        const ids = enr.map(e => e.student_id);
        const classByStudent = {};
        enr.forEach(e => { classByStudent[e.student_id] = e.class || null; });
        if (ids.length === 0) return res.json({ students: [] });
        const { data: profs } = await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, class_id, avatar_url, gender')
          .in('id', ids);
        students = (profs || []).map(p => ({ ...p, classes: classByStudent[p.id] || null }));
      }
      // enrErr (table absente) → repli ci-dessous
    }

    if (students === null) {
      let query = supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, class_id, avatar_url, gender, classes!fk_profiles_class(id, name)')
        .eq('role', 'student');
      if (schoolId) query = query.eq('school_id', schoolId);
      if (class_id) query = query.eq('class_id', class_id);
      const { data, error } = await query;
      if (error) throw error;
      students = data || [];
    }

    const studentIds = (students || []).map(s => s.id);
    if (studentIds.length === 0) return res.json({ students: [] });

    // Invoices totals per student — scopés à l'année (par dates) si fournie.
    let invQ = supabaseAdmin
      .from('invoices')
      .select('student_id, total, amount_paid, status')
      .in('student_id', studentIds)
      .neq('status', 'cancelled');
    if (schoolId) invQ = invQ.eq('school_id', schoolId);
    if (range) invQ = invQ.gte('issue_date', range.start).lte('issue_date', range.end);
    const { data: invs } = await invQ;

    // Plans
    let plansQ = supabaseAdmin.from('student_fee_plans').select('student_id, academic_year, status').in('student_id', studentIds);
    if (academic_year) plansQ = plansQ.eq('academic_year', academic_year);
    const { data: plans } = await plansQ;

    const totalsByStudent = {};
    (invs || []).forEach(i => {
      if (!totalsByStudent[i.student_id]) totalsByStudent[i.student_id] = { total: 0, paid: 0, overdue_count: 0 };
      totalsByStudent[i.student_id].total += Number(i.total);
      totalsByStudent[i.student_id].paid += Number(i.amount_paid || 0);
      if (i.status === 'overdue') totalsByStudent[i.student_id].overdue_count += 1;
    });

    const plansByStudent = {};
    (plans || []).forEach(p => { plansByStudent[p.student_id] = p; });

    const enriched = students.map(s => ({
      ...s,
      total_invoiced: totalsByStudent[s.id]?.total || 0,
      total_paid: totalsByStudent[s.id]?.paid || 0,
      total_due: (totalsByStudent[s.id]?.total || 0) - (totalsByStudent[s.id]?.paid || 0),
      overdue_count: totalsByStudent[s.id]?.overdue_count || 0,
      has_plan: !!plansByStudent[s.id]
    }));

    res.json({ students: enriched });
  } catch (error) {
    console.error('Erreur finance students:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
function getMonthName(month) {
  const names = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  return names[month - 1] || '';
}

// Ordre des mois dans une année scolaire (Sept → Août)
const ACADEMIC_MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

// Rassemble les frais applicables d'un plan.
// Règle anti-doublement : si l'élève a des frais PERSONNALISÉS, ceux-ci font foi
// (le modèle n'est plus qu'une étiquette/source). Sinon, on utilise les frais du
// modèle attaché (cas d'une application en masse par classe, sans personnalisation).
function collectPlanItems(plan) {
  const customItems = (plan.custom_items || [])
    .filter(it => it.enabled !== false)
    .map(it => ({ ...it, _source: 'custom' }));
  if (customItems.length > 0) return customItems;
  return (plan.template?.fee_template_items || []).map(it => ({ ...it, _source: 'template' }));
}

// Détermine si un item est dû un mois donné
function itemAppliesToMonth(it, month) {
  if (it.recurrence === 'monthly') {
    const sm = it.start_month || 9;
    const em = it.end_month || 6;
    if (sm <= em) return month >= sm && month <= em;
    return month >= sm || month <= em; // wrap Sept→Juin
  }
  if (it.recurrence === 'one_time' || it.recurrence === 'annual') {
    return it.due_month === month;
  }
  if (it.recurrence === 'quarterly') {
    const sm = it.start_month || 9;
    const diff = ((month - sm) + 12) % 12;
    return diff % 3 === 0;
  }
  return false;
}

// ── Période de facturation propre à l'élève (entrée / sortie) ──────────────
const monthIdxAcademic = (m) => ACADEMIC_MONTH_ORDER.indexOf(Number(m));

function planRange(plan) {
  const s = plan.start_month ? Number(plan.start_month) : 9; // défaut : septembre
  const e = plan.end_month ? Number(plan.end_month) : 8;     // défaut : août (fin année scolaire)
  return { sIdx: monthIdxAcademic(s), eIdx: monthIdxAcademic(e) };
}

function monthInPlanRange(plan, month) {
  const { sIdx, eIdx } = planRange(plan);
  const idx = monthIdxAcademic(month);
  if (idx < 0) return false;
  if (sIdx < 0 || eIdx < 0) return true;
  return idx >= sIdx && idx <= eIdx;
}

// Mois effectif d'un frais ponctuel/annuel, ramené dans la période de l'élève :
// un frais d'inscription dû en septembre est facturé au mois d'entrée si l'élève
// arrive plus tard (sinon il serait perdu).
function effectiveOneTimeMonth(plan, it) {
  const { sIdx, eIdx } = planRange(plan);
  let dueIdx = monthIdxAcademic(it.due_month ?? 9);
  if (dueIdx < 0) dueIdx = sIdx >= 0 ? sIdx : 0;
  if (sIdx >= 0 && dueIdx < sIdx) dueIdx = sIdx; // dû avant l'entrée → à l'entrée
  if (eIdx >= 0 && dueIdx > eIdx) dueIdx = eIdx; // dû après la sortie → à la sortie
  return ACADEMIC_MONTH_ORDER[dueIdx];
}

// Applicabilité d'un item à un mois EN TENANT COMPTE de la période de l'élève
function itemAppliesToPlanMonth(plan, it, month) {
  if (!monthInPlanRange(plan, month)) return false;
  if (it.recurrence === 'one_time' || it.recurrence === 'annual') {
    return effectiveOneTimeMonth(plan, it) === Number(month);
  }
  return itemAppliesToMonth(it, month);
}

// Liste ordonnée des mois ayant au moins un frais dans le plan (période élève incluse)
function getScheduleMonths(plan) {
  const items = collectPlanItems(plan);
  return ACADEMIC_MONTH_ORDER.filter(m =>
    items.some(it => itemAppliesToPlanMonth(plan, it, m) && Number(it.amount) > 0)
  );
}

// Calcule les lignes + totaux d'un plan pour un mois (avec réductions identiques à generate-monthly)
function computeMonthForPlan(plan, month) {
  const items = collectPlanItems(plan);
  const lines = [];
  for (const it of items) {
    if (itemAppliesToPlanMonth(plan, it, month) && Number(it.amount) > 0) {
      lines.push({
        description: it.name,
        category: it.category,
        quantity: 1,
        unit_price: Number(it.amount),
        amount: Number(it.amount)
      });
    }
  }
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  // Nombre RÉEL de mois facturés (pour répartir bourse et remise annuelle)
  const billableCount = getScheduleMonths(plan).length || 1;
  // Réduction fratrie : pourcentage du sous-total OU montant fixe déduit chaque mois.
  const siblingDiscount = plan.sibling_discount_type === 'amount'
    ? Math.min(subtotal, Number(plan.sibling_discount_amount || 0))
    : subtotal * (Number(plan.sibling_discount_percent || 0) / 100);
  // Bourse + remise libre : montants ANNUELS répartis sur les mois réellement facturés.
  const scholarship = Number(plan.scholarship_amount || 0);
  const monthlyScholarship = scholarship > 0 ? scholarship / billableCount : 0;
  const customDiscount = Number(plan.custom_discount_amount || 0);
  const monthlyCustom = customDiscount > 0 ? customDiscount / billableCount : 0;
  const discount = siblingDiscount + monthlyScholarship + monthlyCustom;
  const total = Math.max(0, subtotal - discount);
  return { lines, subtotal, discount, total };
}

// Décompose un mois en SERVICES (catégories de frais), avec la remise mensuelle
// répartie au prorata pour que Σ(total des services) == total du mois.
// Retourne [{ category, name, gross, total }].
function computeMonthServices(plan, month) {
  const { lines, subtotal, total } = computeMonthForPlan(plan, month);
  if (!lines.length) return [];
  const byCat = {};
  for (const l of lines) {
    const cat = l.category || 'other';
    if (!byCat[cat]) byCat[cat] = { category: cat, name: l.description, gross: 0 };
    byCat[cat].gross += Number(l.amount || 0);
  }
  const cats = Object.values(byCat);
  const ratio = subtotal > 0 ? total / subtotal : 0;
  let allocated = 0;
  cats.forEach((c, i) => {
    if (i === cats.length - 1) {
      c.total = Math.round((total - allocated) * 100) / 100; // le reste absorbe l'arrondi
    } else {
      c.total = Math.round(c.gross * ratio * 100) / 100;
      allocated += c.total;
    }
  });
  return cats;
}

// Année civile correspondant à un mois dans une année scolaire "2025-2026"
function calendarYearFor(academicYear, month) {
  const parts = String(academicYear || '').split('-');
  const y1 = parseInt(parts[0], 10) || new Date().getFullYear();
  const y2 = parts[1] ? parseInt(parts[1], 10) : y1 + 1;
  return month >= 9 ? y1 : y2; // Sept-Déc = 1re année, Janv-Août = 2e année
}

function periodLabelFor(academicYear, month) {
  return `${getMonthName(month)} ${calendarYearFor(academicYear, month)}`;
}

// Récupère le plan complet (modèle + items perso) d'un élève pour une année
async function fetchStudentPlan(studentId, academicYear, schoolId) {
  let q = supabaseAdmin
    .from('student_fee_plans')
    .select(`*,
      template:fee_templates(*, fee_template_items(*)),
      custom_items:student_fee_plan_items(*)
    `)
    .eq('student_id', studentId)
    .eq('academic_year', academicYear)
    .eq('status', 'active');
  if (schoolId) q = q.eq('school_id', schoolId);
  const { data } = await q.maybeSingle();
  return data || null;
}

export default router;
