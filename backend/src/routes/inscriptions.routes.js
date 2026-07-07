/**
 * Routes « Inscriptions » accessibles au module finance (responsable financier).
 *
 * Le finance_manager n'a pas accès aux routes /api/admin (réservées aux admins).
 * Ce routeur expose donc un sous-ensemble strictement nécessaire à l'inscription
 * et la réinscription des élèves, scopé à l'école du demandeur :
 *   - GET  /classes   : classes de l'école (pour le formulaire + cibles de réinscription)
 *   - POST /students  : création d'un nouvel élève (compte auth + profil)
 *
 * La consultation des élèves (cartes) et l'entonnoir de métriques passent par
 * /api/enrollments (déjà accessible à tout utilisateur authentifié, scopé école).
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireFinanceAccess } from '../middleware/auth.js';
import { mapStudentOptionalFields } from '../utils/studentFields.js';
import { profilePhotoUpload, uploadProfilePhotoFile } from '../utils/profilePhoto.js';
import { ensureEnrollmentIfCurrentYear } from '../utils/enrollmentScope.js';

const router = Router();

router.use(authenticate);
router.use(requireFinanceAccess);

const getSchoolId = (req) => req.user?.school_id || null;

// Année scolaire courante au format slash "YYYY/YYYY" (rentrée en septembre) —
// repli si le front n'a pas transmis l'année active.
const currentYear = () => {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

// ── Helpers parents (mêmes règles que la création admin) ─────────────────────
const splitFullName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(1).join(' '), lastName: parts[0] };
};
// Mobile marocain strict (06/07) → E.164, sinon null.
const normalizeMoroccoMobile = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('212')) d = '0' + d.slice(3);
  if (d.length === 9 && /^[67]/.test(d)) d = '0' + d;
  if (/^0[67][0-9]{8}$/.test(d)) return `+212${d.slice(1)}`;
  return null;
};
const normalizePhoneToE164 = (raw) => {
  const digits = String(raw || '').replace(/[^0-9+]/g, '').trim();
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  const only = digits.replace(/\D/g, '');
  if (!only) return '';
  if (only.startsWith('212')) return `+${only}`;
  if (only.startsWith('0') && only.length >= 9) return `+212${only.slice(1)}`;
  if (only.length === 9) return `+212${only}`;
  return `+${only}`;
};
const sanitizeForEmail = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const buildParentPassword = (firstName) => {
  const year = new Date().getFullYear();
  const clean = String(firstName || '').normalize('NFD').replace(/[^a-zA-Z]/g, '').trim();
  if (!clean) return `Parent${year}${Math.random().toString(36).slice(2, 6)}`;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() + year;
};

// GET /api/inscriptions/classes?academic_year=YYYY/YYYY
// Classes de l'école (optionnellement filtrées par année scolaire).
router.get('/classes', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json([]);
    let q = supabaseAdmin
      .from('classes')
      .select('id, name, level, filiere, academic_year')
      .eq('school_id', schoolId)
      .order('name', { ascending: true });
    if (req.query.academic_year) q = q.eq('academic_year', req.query.academic_year);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('GET /inscriptions/classes:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// POST /api/inscriptions/students
// Crée un élève (compte auth + profil) — mêmes champs que la création admin.
// body: { email, password, firstName, lastName, classId, ...champs fiche }
router.post('/students', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'Aucune école associée au compte' });

    const { email, password, firstName, lastName, classId } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom et prénom requis' });
    if (!email || !password) return res.status(400).json({ error: 'Identifiants (email/mot de passe) requis' });

    // La classe cible doit appartenir à l'école du demandeur.
    if (classId) {
      const { data: cls } = await supabaseAdmin
        .from('classes').select('id').eq('id', classId).eq('school_id', schoolId).maybeSingle();
      if (!cls) return res.status(404).json({ error: 'Classe introuvable dans votre école' });
    }

    // 1. Compte d'authentification
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'student' },
    });
    if (authError) throw authError;

    // 2. Profil élève
    const profileData = {
      id: authData.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      role: 'student',
      class_id: classId || null,
      school_id: schoolId,
      ...mapStudentOptionalFields(req.body),
    };
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert(profileData)
      .select()
      .single();
    if (profileError) {
      // Nettoyage : supprimer le compte auth orphelin si le profil échoue.
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch (_) {}
      throw profileError;
    }

    // 3. Inscription de l'année active — SANS ELLE l'élève n'apparaît pas dans la
    // liste finance (roster = student_enrollments). Statut NI = nouvel inscrit.
    const academicYear = req.body.academicYear || currentYear();
    const { error: enrollError } = await supabaseAdmin
      .from('student_enrollments')
      .upsert({
        school_id: schoolId,
        student_id: profile.id,
        class_id: classId || null,
        academic_year: academicYear,
        status: 'NI',
        created_by: req.user.id,
      }, { onConflict: 'student_id,academic_year' });
    if (enrollError) console.error('Inscription (student_enrollments) échouée:', enrollError);

    res.status(201).json({ ...profile, password });
  } catch (error) {
    console.error('POST /inscriptions/students:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// GET /api/inscriptions/students/:id
// Fiche complète d'un élève (profil + parents) pour éditer/imprimer la fiche
// d'inscription côté finance — scopée à l'école du demandeur, mêmes champs que
// la fiche admin (le roster /enrollments ne renvoie qu'un sous-ensemble).
router.get('/students/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { id } = req.params;
    const { data: student, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .maybeSingle();
    if (error) throw error;
    if (!student) return res.status(404).json({ error: 'Élève introuvable dans votre école' });

    // Parents liés (mêmes champs que la fiche admin).
    const { data: links } = await supabaseAdmin
      .from('parent_students')
      .select('relationship, parent:profiles!parent_students_parent_id_fkey(first_name, last_name, email, phone, cin, profession, marital_status)')
      .eq('student_id', id);
    const parents = (links || []).map((l) => ({
      first_name: l.parent?.first_name || '',
      last_name: l.parent?.last_name || '',
      relationship: l.relationship || null,
      email: l.parent?.email || null,
      phone: l.parent?.phone || null,
      cin: l.parent?.cin || null,
      profession: l.parent?.profession || null,
      marital_status: l.parent?.marital_status || null,
    }));

    res.json({ ...student, parents });
  } catch (e) {
    console.error('GET /inscriptions/students/:id:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// PUT /api/inscriptions/students/:id
// Mise à jour de la fiche d'inscription d'un élève déjà inscrit (mêmes champs
// que l'édition admin, hors identifiants auth), scopée à l'école du demandeur.
// Si la classe change, l'inscription de l'année (student_enrollments) est
// synchronisée pour que le roster finance reflète aussitôt la nouvelle classe.
router.put('/students/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { id } = req.params;
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', id)
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Élève introuvable dans votre école' });

    const { classId } = req.body;
    if (classId) {
      const { data: cls } = await supabaseAdmin
        .from('classes').select('id').eq('id', classId).eq('school_id', schoolId).maybeSingle();
      if (!cls) return res.status(404).json({ error: 'Classe introuvable dans votre école' });
    }

    const updateData = mapStudentOptionalFields(req.body);
    if (typeof req.body.firstName === 'string' && req.body.firstName.trim()) updateData.first_name = req.body.firstName.trim();
    if (typeof req.body.lastName === 'string' && req.body.lastName.trim()) updateData.last_name = req.body.lastName.trim();
    if (req.body.classId !== undefined) updateData.class_id = classId || null;
    updateData.updated_at = new Date().toISOString();

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    if (req.body.classId !== undefined) {
      // L'année peut être stockée au format slash OU tiret selon la source.
      const y = req.body.academicYear || currentYear();
      const variants = [...new Set([y, String(y).replace('/', '-'), String(y).replace('-', '/')])];
      const { error: enrollError } = await supabaseAdmin
        .from('student_enrollments')
        .update({ class_id: classId || null })
        .eq('student_id', id)
        .eq('school_id', schoolId)
        .in('academic_year', variants);
      if (enrollError) console.error('Sync classe (student_enrollments) échouée:', enrollError);
    }

    res.json(profile);
  } catch (e) {
    console.error('PUT /inscriptions/students/:id:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// POST /api/inscriptions/students/:id/photo
// Upload de la photo d'un élève (même stockage que l'admin), scopé à l'école.
router.post('/students/:id/photo', profilePhotoUpload.single('photo'), async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Aucune image fournie' });
    const { data: student } = await supabaseAdmin
      .from('profiles').select('id').eq('id', id).eq('role', 'student').eq('school_id', schoolId).maybeSingle();
    if (!student) return res.status(404).json({ error: 'Élève introuvable dans votre école' });

    const avatar_url = await uploadProfilePhotoFile(req.file);
    const { data, error } = await supabaseAdmin
      .from('profiles').update({ avatar_url }).eq('id', id).select('id, avatar_url').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('POST /inscriptions/students/:id/photo:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// POST /api/inscriptions/students/:id/add-parents
// Crée/relie un ou plusieurs parents à un élève (même logique que l'admin :
// réutilisation d'un parent existant par numéro, contacts WhatsApp, lien
// parent↔élève, enrichissement CIN/profession/situation familiale).
// body: { contacts: [{ name, phone, relationship?, cin?, profession?, maritalStatus?, email? }] }
router.post('/students/:id/add-parents', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { id } = req.params;
    const { contacts: raw } = req.body;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: 'Au moins un parent (nom + téléphone) est requis' });
    }

    const { data: student } = await supabaseAdmin
      .from('profiles').select('id, school_id, class_id').eq('id', id).eq('role', 'student').eq('school_id', schoolId).maybeSingle();
    if (!student) return res.status(404).json({ error: 'Élève introuvable dans votre école' });

    // Normalisation + dédup des numéros, en conservant nom + relation.
    const seen = new Set();
    const contacts = [];
    for (const c of raw) {
      const phone = normalizeMoroccoMobile(c.phone) || normalizePhoneToE164(c.phone);
      const name = (c.name || '').trim();
      if (!phone || !name || seen.has(phone)) continue;
      seen.add(phone);
      contacts.push({
        phone, name, relationship: c.relationship || null,
        cin: c.cin || null, profession: c.profession || null,
        maritalStatus: c.maritalStatus || null, email: c.email || null,
      });
    }
    if (contacts.length === 0) {
      return res.status(400).json({ error: 'Aucun parent valide (nom + téléphone marocain requis)' });
    }

    const primary = contacts[0];
    const pn = splitFullName(primary.name);

    // Réutiliser un parent existant si l'un des numéros est déjà connu.
    const { data: existing } = await supabaseAdmin
      .from('parent_contacts').select('parent_id').in('phone_e164', contacts.map((c) => c.phone)).eq('channel', 'whatsapp');

    let parentId = existing?.[0]?.parent_id;
    let createdParent = false;
    if (!parentId) {
      let email = (primary.email || '').trim();
      if (!email) {
        const { data: sch } = await supabaseAdmin.from('schools').select('name, code').eq('id', schoolId).maybeSingle();
        const base = sanitizeForEmail(sch?.name || sch?.code || 'ecole') || 'ecole';
        const local = `${sanitizeForEmail(pn.firstName)}${sanitizeForEmail(pn.lastName)}` || `parent${Date.now().toString().slice(-6)}`;
        email = `${local}@${base}.ma`;
      }
      const password = buildParentPassword(pn.firstName);
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { first_name: pn.firstName || 'Parent', last_name: pn.lastName || '', role: 'parent' },
      });
      if (authErr) throw authErr;
      const { error: pErr } = await supabaseAdmin.from('profiles').insert({
        id: authData.user.id, email, first_name: pn.firstName || 'Parent', last_name: pn.lastName || '',
        role: 'parent', phone: primary.phone, school_id: schoolId,
      });
      if (pErr) { try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch (_) {} throw pErr; }
      parentId = authData.user.id;
      createdParent = true;
    }

    // Enrichir le profil parent (sans écraser par du vide).
    const extra = { cin: primary.cin, profession: primary.profession, marital_status: primary.maritalStatus };
    const upd = {};
    for (const [k, v] of Object.entries(extra)) { if (v && String(v).trim() !== '') upd[k] = v; }
    if (Object.keys(upd).length) await supabaseAdmin.from('profiles').update(upd).eq('id', parentId);

    // Upsert des contacts (1er = principal) + libellé Père/Mère.
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const label = [c.relationship ? c.relationship.charAt(0).toUpperCase() + c.relationship.slice(1) : null, c.name].filter(Boolean).join(' — ') || null;
      const { error: cErr } = await supabaseAdmin.from('parent_contacts').upsert(
        { parent_id: parentId, phone_e164: c.phone, channel: 'whatsapp', is_primary: i === 0, consent_status: 'pending', label },
        { onConflict: 'parent_id,phone_e164,channel' },
      );
      if (cErr) throw cErr;
    }

    // Lien parent ↔ élève.
    const { error: linkErr } = await supabaseAdmin.from('parent_students').upsert(
      { parent_id: parentId, student_id: id, relationship: primary.relationship || null },
      { onConflict: 'parent_id,student_id' },
    );
    if (linkErr) throw linkErr;

    // Faire apparaître le parent sur la page Parents si l'élève est de l'année active.
    await ensureEnrollmentIfCurrentYear(schoolId, id, student.class_id, req.body.academic_year, req.user?.id);

    res.status(201).json({ success: true, parent_id: parentId, createdParent, contactsCount: contacts.length });
  } catch (error) {
    console.error('POST /inscriptions/students/:id/add-parents:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

export default router;
