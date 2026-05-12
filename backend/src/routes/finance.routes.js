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
    const { template_id, academic_year, sibling_discount_percent, scholarship_amount, custom_notes, custom_items } = req.body;
    if (!academic_year) return res.status(400).json({ error: 'academic_year requis' });

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
          template_id, sibling_discount_percent: sibling_discount_percent || 0,
          scholarship_amount: scholarship_amount || 0,
          custom_notes, updated_at: new Date().toISOString()
        })
        .eq('id', planId);
    } else {
      const { data: newPlan, error } = await supabaseAdmin
        .from('student_fee_plans')
        .insert({
          school_id: schoolId,
          student_id: studentId,
          template_id,
          academic_year,
          sibling_discount_percent: sibling_discount_percent || 0,
          scholarship_amount: scholarship_amount || 0,
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
        // Collecter les items applicables pour ce mois
        const templateItems = (plan.template?.fee_template_items || []).map(it => ({ ...it, _source: 'template' }));
        const customItems = (plan.custom_items || []).filter(it => it.enabled).map(it => ({ ...it, _source: 'custom' }));
        const allItems = [...templateItems, ...customItems];

        const applicableLines = [];
        for (const it of allItems) {
          let applies = false;
          if (it.recurrence === 'monthly') {
            const sm = it.start_month || 9;
            const em = it.end_month || 6;
            // Septembre→Juin : wrap around
            if (sm <= em) applies = month >= sm && month <= em;
            else applies = month >= sm || month <= em;
          } else if (it.recurrence === 'one_time' || it.recurrence === 'annual') {
            applies = it.due_month === month;
          } else if (it.recurrence === 'quarterly') {
            const sm = it.start_month || 9;
            const diff = ((month - sm) + 12) % 12;
            applies = diff % 3 === 0;
          }
          if (applies && Number(it.amount) > 0) {
            applicableLines.push({
              description: it.name,
              category: it.category,
              quantity: 1,
              unit_price: Number(it.amount),
              amount: Number(it.amount)
            });
          }
        }

        if (applicableLines.length === 0) { skippedCount++; continue; }

        // Vérifier doublon (même élève, même période)
        const { data: existing } = await supabaseAdmin
          .from('invoices')
          .select('id')
          .eq('student_id', plan.student_id)
          .eq('period_label', periodLabel)
          .eq('status', 'issued')
          .maybeSingle();
        if (existing) { skippedCount++; continue; }

        const subtotal = applicableLines.reduce((s, l) => s + l.amount, 0);
        const siblingDiscount = subtotal * (Number(plan.sibling_discount_percent || 0) / 100);
        const scholarship = Number(plan.scholarship_amount || 0);
        // Scholarship réparti mensuellement (10 mois)
        const monthlyScholarship = scholarship > 0 ? scholarship / 10 : 0;
        const discount = siblingDiscount + monthlyScholarship;
        const total = Math.max(0, subtotal - discount);

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
    const { from, to, method, student_id, invoice_id } = req.query;

    let query = supabaseAdmin
      .from('payments')
      .select(`*,
        student:profiles!payments_student_id_fkey(id, first_name, last_name, class_id, classes!fk_profiles_class(id, name)),
        school:schools(id, name, logo_url, address, phone),
        invoice:invoices(id, invoice_number, total, period_label)
      `)
      .eq('status', 'confirmed')
      .order('payment_date', { ascending: false })
      .limit(500);
    if (schoolId) query = query.eq('school_id', schoolId);
    if (from) query = query.gte('payment_date', from);
    if (to) query = query.lte('payment_date', to);
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
    const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDayMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    // Encaissé ce mois
    let paidQuery = supabaseAdmin
      .from('payments')
      .select('amount')
      .eq('status', 'confirmed')
      .gte('payment_date', firstDayMonth)
      .lte('payment_date', lastDayMonth);
    if (schoolId) paidQuery = paidQuery.eq('school_id', schoolId);
    const { data: paidRows } = await paidQuery;
    const collectedThisMonth = (paidRows || []).reduce((s, r) => s + Number(r.amount), 0);

    // Dû total (non annulé, non payé)
    let dueQuery = supabaseAdmin
      .from('invoices')
      .select('total, amount_paid, due_date, status')
      .in('status', ['issued', 'partial', 'overdue']);
    if (schoolId) dueQuery = dueQuery.eq('school_id', schoolId);
    const { data: dueRows } = await dueQuery;

    const totalDue = (dueRows || []).reduce((s, r) => s + (Number(r.total) - Number(r.amount_paid || 0)), 0);
    const todayStr = today.toISOString().split('T')[0];
    const overdueRows = (dueRows || []).filter(r => r.due_date < todayStr);
    const totalOverdue = overdueRows.reduce((s, r) => s + (Number(r.total) - Number(r.amount_paid || 0)), 0);
    const overdueCount = overdueRows.length;

    // Factures émises ce mois
    let issuedQuery = supabaseAdmin
      .from('invoices')
      .select('total')
      .gte('issue_date', firstDayMonth)
      .lte('issue_date', lastDayMonth)
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
    let invQuery = supabaseAdmin
      .from('invoices')
      .select('total, amount_paid, student:profiles!invoices_student_id_fkey(class_id, classes!fk_profiles_class(id, name))')
      .neq('status', 'cancelled');
    if (schoolId) invQuery = invQuery.eq('school_id', schoolId);
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
    const { from, to, category } = req.query;

    let q = supabaseAdmin.from('school_expenses').select('*').order('expense_date', { ascending: false }).limit(500);
    if (schoolId) q = q.eq('school_id', schoolId);
    if (from) q = q.gte('expense_date', from);
    if (to) q = q.lte('expense_date', to);
    if (category) q = q.eq('category', category);

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
    const { category, description, amount, expense_date, paid_to, payment_method, reference, notes } = req.body;
    if (!category || !description || !amount) return res.status(400).json({ error: 'Champs requis manquants' });

    const { data, error } = await supabaseAdmin
      .from('school_expenses')
      .insert({
        school_id: schoolId,
        category, description,
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
    res.status(500).json({ error: 'Erreur serveur' });
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

    let query = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id, classes!fk_profiles_class(id, name)')
      .eq('role', 'student');
    if (schoolId) query = query.eq('school_id', schoolId);
    if (class_id) query = query.eq('class_id', class_id);

    const { data: students, error } = await query;
    if (error) throw error;

    const studentIds = (students || []).map(s => s.id);
    if (studentIds.length === 0) return res.json({ students: [] });

    // Invoices totals per student
    let invQ = supabaseAdmin
      .from('invoices')
      .select('student_id, total, amount_paid, status')
      .in('student_id', studentIds)
      .neq('status', 'cancelled');
    if (schoolId) invQ = invQ.eq('school_id', schoolId);
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

export default router;
