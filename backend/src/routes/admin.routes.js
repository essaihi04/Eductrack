import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize, getScopedClassIds } from '../middleware/auth.js';
import { sendText, sendImage, sendDocument, getStatus } from '../services/whatsapp/index.js';

const router = express.Router();

// Middleware pour vérifier que c'est un admin
router.use(authenticate);
router.use(authorize('admin', 'school_admin'));

const normalizeName = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const splitFullName = (fullName) => {
  const normalized = normalizeName(fullName);
  if (!normalized) return { firstName: '', lastName: '' };
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(1).join(' '),
    lastName: parts[0]
  };
};

const normalizePhoneToE164 = (raw) => {
  const digits = String(raw || '').replace(/[^0-9+]/g, '').trim();
  if (!digits) return '';

  if (digits.startsWith('+')) return digits;

  const onlyDigits = digits.replace(/\D/g, '');
  if (!onlyDigits) return '';

  // Morocco default (+212)
  if (onlyDigits.startsWith('212')) return `+${onlyDigits}`;
  if (onlyDigits.startsWith('0') && onlyDigits.length >= 9) return `+212${onlyDigits.slice(1)}`;
  if (onlyDigits.length === 9) return `+212${onlyDigits}`;
  return `+${onlyDigits}`;
};

const generatePlaceholderParentEmail = () =>
  `parent_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}@parents.local`;

const isPlaceholderParentEmail = (email) => {
  if (!email) return true;
  const e = String(email).toLowerCase();
  return e.endsWith('@parents.local') || e.startsWith('parent_');
};

const sanitizeForEmail = (str) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const getSchoolEmailDomain = async (schoolId) => {
  if (!schoolId) return 'ecole.ma';
  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('name, code')
    .eq('id', schoolId)
    .single();
  if (!school) return 'ecole.ma';
  const base = sanitizeForEmail(school.name || school.code || 'ecole') || 'ecole';
  return `${base}.ma`;
};

const buildParentEmail = (firstName, lastName, schoolDomain) => {
  const f = sanitizeForEmail(firstName);
  const l = sanitizeForEmail(lastName);
  if (!f && !l) {
    const ts = Date.now().toString().slice(-6);
    return `parent${ts}@${schoolDomain}`;
  }
  return `${f}${l}@${schoolDomain}`;
};

const buildParentPassword = (firstName) => {
  const year = new Date().getFullYear();
  const clean = String(firstName || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '').trim();
  if (!clean) return `Parent${year}${Math.random().toString(36).slice(2, 6)}`;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() + year;
};

const generateRandomPassword = () => crypto.randomBytes(10).toString('hex');

// Génère email + mot de passe lisibles pour un parent (basé sur l'école)
const generateParentCredentials = async ({ firstName, lastName, schoolId }) => {
  const schoolDomain = await getSchoolEmailDomain(schoolId);
  return {
    email: buildParentEmail(firstName, lastName, schoolDomain),
    password: buildParentPassword(firstName),
  };
};

const createParentProfile = async ({ email, firstName, lastName, phone, schoolId }) => {
  // Si pas d'email réel fourni → générer un email lisible (prenomnom@ecole.ma)
  let finalEmail = (email || '').trim();
  let usedAutoEmail = false;
  if (!finalEmail) {
    const schoolDomain = await getSchoolEmailDomain(schoolId);
    finalEmail = buildParentEmail(firstName, lastName, schoolDomain);
    usedAutoEmail = true;
  }
  // Mot de passe lisible basé sur prénom + année
  const password = buildParentPassword(firstName);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: finalEmail,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName || 'Parent',
      last_name: lastName || '',
      role: 'parent'
    }
  });

  if (authError) throw authError;

  const { data: parent, error: parentError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      email: finalEmail,
      first_name: firstName || 'Parent',
      last_name: lastName || '',
      role: 'parent',
      phone: phone || null,
      school_id: schoolId || null
    })
    .select('id, email, first_name, last_name, phone, created_at')
    .single();

  if (parentError) throw parentError;
  // Renvoyer les credentials générés pour que l'admin puisse les copier/envoyer
  return { ...parent, password, generatedEmail: finalEmail, autoEmail: usedAutoEmail };
};

// ==================== MULTI-SCHOOL HELPERS ====================

// Récupère le school_id du user connecté (null pour super_admin = voir tout)
const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return null;
  return req.user.school_id || null;
};

// Applique le filtre de scope (classes assignées) pour pedagogical_manager
// Renvoie {query, empty} — si empty=true, la route doit renvoyer [] sans appeler la BDD
const applyScopeFilterClass = async (query, req, column = 'class_id') => {
  const scopedIds = await getScopedClassIds(req);
  if (scopedIds === null) return { query, empty: false };
  if (scopedIds.length === 0) return { query, empty: true };
  return { query: query.in(column, scopedIds), empty: false };
};

// Applique le filtre school_id sur une requête Supabase (table qui a school_id directement)
const applySchoolFilter = (query, req, column = 'school_id') => {
  const schoolId = getSchoolId(req);
  if (schoolId) {
    return query.eq(column, schoolId);
  }
  return query;
};

const WASENDER_BASE = 'https://www.wasenderapi.com';

const safeJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error('WasenderAPI returned non-JSON:', text.substring(0, 200));
    return { success: false, message: `WasenderAPI error (HTTP ${response.status})` };
  }
};

const getGlobalApiKey = () => process.env.WASENDER_API_KEY || null;

const getSchoolSessionId = async (schoolId) => {
  if (!schoolId) return null;
  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('wasender_session_id')
    .eq('school_id', schoolId)
    .single();
  return data?.wasender_session_id || null;
};

const getSessionApiKey = async (schoolId) => {
  const globalKey = getGlobalApiKey();
  if (!globalKey) return null;

  const mappedSessionId = await getSchoolSessionId(schoolId);
  if (!mappedSessionId) return null;

  const detailRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${mappedSessionId}`, {
    headers: { 'Authorization': `Bearer ${globalKey}` }
  });
  const detailData = await safeJson(detailRes);
  if (detailData.success && detailData.data?.api_key && detailData.data.status === 'connected') {
    return detailData.data.api_key;
  }
  return null;
};

const WASENDER_MIN_INTERVAL_MS = 5000;
const waitWasenderInterval = () => new Promise((resolve) => setTimeout(resolve, WASENDER_MIN_INTERVAL_MS));

// ==================== ÉLÈVES ====================

// Récupérer le parent d'un élève
router.get('/students/:studentId/parent', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Récupérer la relation parent-élève
    const { data: relation, error: relationError } = await supabaseAdmin
      .from('parent_students')
      .select('parent_id')
      .eq('student_id', studentId)
      .single();

    if (relationError || !relation) {
      return res.status(404).json({ error: 'Aucun parent associé à cet élève' });
    }

    // Récupérer les informations du parent avec son numéro de téléphone depuis parent_contacts
    const { data: parent, error: parentError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone')
      .eq('id', relation.parent_id)
      .single();

    if (parentError) throw parentError;

    // Si pas de téléphone dans profiles, chercher dans parent_contacts
    if (!parent.phone) {
      const { data: contact } = await supabaseAdmin
        .from('parent_contacts')
        .select('phone_e164')
        .eq('parent_id', relation.parent_id)
        .eq('channel', 'whatsapp')
        .eq('is_primary', true)
        .single();

      if (contact) {
        parent.phone = contact.phone_e164;
      }
    }

    res.json(parent);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer tous les élèves
router.get('/students', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('role', 'student');
    query = applySchoolFilter(query, req);
    // Filtre de scope pour pedagogical_manager
    const scopedStuIds = await getScopedClassIds(req);
    if (scopedStuIds !== null) {
      if (scopedStuIds.length === 0) return res.json([]);
      query = query.in('class_id', scopedStuIds);
    }
    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== PARENTS ====================

// Lister les parents avec enfants + classes + contacts
router.get('/parents', async (req, res) => {
  try {
    let parentsQuery = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, created_at, updated_at')
      .eq('role', 'parent')
      .order('created_at', { ascending: false });
    parentsQuery = applySchoolFilter(parentsQuery, req);
    // Filtre de scope : ne garder que les parents ayant au moins un enfant dans les classes assignées
    const scopedClassIds = await getScopedClassIds(req);
    if (scopedClassIds !== null) {
      if (scopedClassIds.length === 0) return res.json([]);
      const { data: scopedStudents } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'student')
        .in('class_id', scopedClassIds);
      const studentIds = (scopedStudents || []).map(s => s.id);
      if (studentIds.length === 0) return res.json([]);
      const { data: ps } = await supabaseAdmin
        .from('parent_students')
        .select('parent_id')
        .in('student_id', studentIds);
      const allowedParentIds = [...new Set((ps || []).map(p => p.parent_id))];
      if (allowedParentIds.length === 0) return res.json([]);
      parentsQuery = parentsQuery.in('id', allowedParentIds);
    }
    const { data: parents, error: parentsError } = await parentsQuery;

    if (parentsError) throw parentsError;

    const parentIds = (parents || []).map(p => p.id);
    if (parentIds.length === 0) {
      return res.json([]);
    }

    const [{ data: links, error: linksError }, { data: contacts, error: contactsError }] = await Promise.all([
      supabaseAdmin
        .from('parent_students')
        .select('parent_id, student_id, relationship, student:profiles!parent_students_student_id_fkey(id, first_name, last_name, class_id, classes:classes!fk_profiles_class(name, level))')
        .in('parent_id', parentIds),
      supabaseAdmin
        .from('parent_contacts')
        .select('id, parent_id, phone_e164, channel, is_primary, consent_status, created_at')
        .in('parent_id', parentIds)
        .order('is_primary', { ascending: false })
    ]);

    if (linksError) throw linksError;
    if (contactsError) throw contactsError;

    const linksByParent = new Map();
    (links || []).forEach(l => {
      if (!linksByParent.has(l.parent_id)) linksByParent.set(l.parent_id, []);
      linksByParent.get(l.parent_id).push(l);
    });

    const contactsByParent = new Map();
    (contacts || []).forEach(c => {
      if (!contactsByParent.has(c.parent_id)) contactsByParent.set(c.parent_id, []);
      contactsByParent.get(c.parent_id).push(c);
    });

    const response = (parents || []).map(p => {
      const childLinks = linksByParent.get(p.id) || [];
      const classes = new Map();
      childLinks.forEach(l => {
        const cls = l.student?.classes;
        if (cls?.name) classes.set(cls.name, cls);
      });

      return {
        ...p,
        children: childLinks
          .filter(l => l.student)
          .map(l => ({
            id: l.student.id,
            first_name: l.student.first_name,
            last_name: l.student.last_name,
            class: l.student.classes || null,
            relationship: l.relationship || null
          })),
        classes: Array.from(classes.values()),
        contacts: contactsByParent.get(p.id) || []
      };
    });

    res.json(response);
  } catch (error) {
    console.error('Erreur /parents:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Créer un parent (sans création auth.users pour l'instant)
router.post('/parents', async (req, res) => {
  try {
    const { parent_full_name, phone_1, email } = req.body;
    const { firstName, lastName } = splitFullName(parent_full_name);
    const phone = normalizePhoneToE164(phone_1);

    if (!firstName && !lastName) {
      return res.status(400).json({ error: 'Nom parent invalide' });
    }

    const parent = await createParentProfile({
      email,
      firstName,
      lastName,
      phone,
      schoolId: getSchoolId(req)
    });

    if (phone) {
      const { error: contactError } = await supabaseAdmin
        .from('parent_contacts')
        .upsert(
          {
            parent_id: parent.id,
            phone_e164: phone,
            channel: 'whatsapp',
            is_primary: true,
            consent_status: 'pending'
          },
          { onConflict: 'parent_id,phone_e164,channel' }
        );
      if (contactError) throw contactError;
    }

    res.status(201).json(parent);
  } catch (error) {
    console.error('Erreur POST /parents:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Modifier un parent
router.patch('/parents/:parentId', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { first_name, last_name, phone, email } = req.body;

    const updatePayload = {};
    if (typeof first_name === 'string') updatePayload.first_name = first_name.trim();
    if (typeof last_name === 'string') updatePayload.last_name = last_name.trim();
    if (typeof phone === 'string') updatePayload.phone = normalizePhoneToE164(phone) || null;
    if (typeof email === 'string') updatePayload.email = email.trim();

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à modifier' });
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', parentId)
      .eq('role', 'parent')
      .select('id, email, first_name, last_name, phone, created_at, updated_at')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Parent non trouvé' });

    res.json(data);
  } catch (error) {
    console.error('Erreur PATCH /parents:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Supprimer un parent (profil + contacts + associations + auth user)
router.delete('/parents/:parentId', async (req, res) => {
  try {
    const { parentId } = req.params;

    // Delete contacts and links (cascade should handle it, but be explicit)
    await Promise.all([
      supabaseAdmin.from('parent_contacts').delete().eq('parent_id', parentId),
      supabaseAdmin.from('parent_students').delete().eq('parent_id', parentId)
    ]);

    // Delete profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', parentId)
      .eq('role', 'parent');
    if (profileError) throw profileError;

    // Delete auth user
    try {
      await supabaseAdmin.auth.admin.deleteUser(parentId);
    } catch (authErr) {
      console.warn('Auth user delete warning (may not exist):', authErr.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur DELETE /parents:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// (Re)générer les identifiants de connexion d'un parent existant
// Crée/répare le compte auth.users si nécessaire, force un email lisible et un nouveau mot de passe
router.post('/parents/:parentId/create-credentials', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { force } = req.body || {};

    const { data: parent, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email, school_id, role')
      .eq('id', parentId)
      .eq('role', 'parent')
      .single();
    if (pErr) throw pErr;
    if (!parent) return res.status(404).json({ error: 'Parent introuvable' });

    // Toujours générer un mot de passe lisible
    const password = buildParentPassword(parent.first_name);

    // Si email actuel est un placeholder (ou force) → générer un email lisible
    let newEmail = parent.email;
    if (force || isPlaceholderParentEmail(parent.email)) {
      const schoolDomain = await getSchoolEmailDomain(parent.school_id);
      newEmail = buildParentEmail(parent.first_name, parent.last_name, schoolDomain);
    }

    // Mettre à jour le compte auth.users (créer s'il n'existe pas)
    const { data: existingAuth } = await supabaseAdmin.auth.admin.getUserById(parentId);
    if (existingAuth?.user) {
      const updates = { password };
      if (newEmail && newEmail !== parent.email) {
        updates.email = newEmail;
        updates.email_confirm = true;
      }
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(parentId, updates);
      if (upErr) throw upErr;
    } else {
      // Pas de compte auth → en créer un avec le même id ? Impossible, l'id auth est généré.
      // Création d'un nouveau compte auth, et on bascule profile.id ? Trop risqué.
      // Solution simple : créer le compte avec l'id du profil via createUser n'est pas autorisé.
      // On crée donc un nouvel auth et on conserve les associations en migrant le profile.id.
      // Pour rester safe, on retourne une erreur ici.
      return res.status(409).json({ error: 'Aucun compte auth existant pour ce parent. Recréez le parent.' });
    }

    // Mettre à jour profiles.email
    if (newEmail !== parent.email) {
      const { error: profUpErr } = await supabaseAdmin
        .from('profiles')
        .update({ email: newEmail })
        .eq('id', parentId);
      if (profUpErr) throw profUpErr;
    }

    res.json({
      success: true,
      email: newEmail,
      password,
      first_name: parent.first_name,
      last_name: parent.last_name,
    });
  } catch (error) {
    console.error('Erreur POST /parents/:id/create-credentials:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Envoyer en masse les identifiants par WhatsApp
// Body: { parent_ids?: string[], all?: boolean }
router.post('/parents/send-credentials-whatsapp', async (req, res) => {
  try {
    const { parent_ids, all } = req.body || {};
    const schoolId = getSchoolId(req);

    let parentsQuery = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, school_id')
      .eq('role', 'parent');
    if (schoolId) parentsQuery = parentsQuery.eq('school_id', schoolId);
    if (!all && Array.isArray(parent_ids) && parent_ids.length) {
      parentsQuery = parentsQuery.in('id', parent_ids);
    } else if (!all) {
      return res.status(400).json({ error: 'Spécifier parent_ids ou all=true' });
    }

    const { data: parents, error: parentsError } = await parentsQuery;
    if (parentsError) throw parentsError;
    if (!parents || parents.length === 0) {
      return res.status(400).json({ error: 'Aucun parent trouvé' });
    }

    // Récupérer les contacts WhatsApp officiels (parent_contacts)
    const ids = parents.map(p => p.id);
    const { data: contacts } = await supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164, channel, is_primary')
      .in('parent_id', ids)
      .eq('channel', 'whatsapp');
    const phoneByParent = new Map();
    (contacts || []).forEach(c => {
      if (!phoneByParent.has(c.parent_id) || c.is_primary) {
        phoneByParent.set(c.parent_id, c.phone_e164);
      }
    });

    const candidates = parents.map(p => ({
      ...p,
      phone_e164: phoneByParent.get(p.id) || normalizePhoneToE164(p.phone),
    })).filter(p => !!p.phone_e164);

    if (candidates.length === 0) {
      return res.status(400).json({ error: 'Aucun parent n\'a de numéro WhatsApp' });
    }

    const waStatus = getStatus(schoolId);
    if (!waStatus.connected) {
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée pour cette école. Connectez le numéro de votre école depuis la page WhatsApp.' });
    }

    const schoolDomain = await getSchoolEmailDomain(schoolId);

    let sentCount = 0, errorCount = 0;
    const sentDetails = [];

    for (const parent of candidates) {
      try {
        // (Re)générer email si placeholder, et toujours un nouveau mot de passe lisible
        const password = buildParentPassword(parent.first_name);
        const newEmail = isPlaceholderParentEmail(parent.email)
          ? buildParentEmail(parent.first_name, parent.last_name, schoolDomain)
          : parent.email;

        const updates = { password };
        if (newEmail !== parent.email) {
          updates.email = newEmail;
          updates.email_confirm = true;
        }

        const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(parent.id, updates);
        if (upErr) {
          console.error('[Parents WhatsApp] update auth failed', parent.id, upErr.message);
          errorCount++;
          continue;
        }

        if (newEmail !== parent.email) {
          await supabaseAdmin.from('profiles').update({ email: newEmail }).eq('id', parent.id);
        }

        const messageText =
          `🔐 *Identifiants de connexion — Espace parent*\n\n` +
          `Bonjour ${parent.first_name || ''},\n\n` +
          `Voici vos accès à la plateforme EduTrack pour suivre votre/vos enfant(s) :\n\n` +
          `📧 *Login (email)*\n${newEmail}\n\n` +
          `🔑 *Mot de passe*\n${password}\n\n` +
          `🌐 *Lien de connexion*\nhttps://etrack.ma/login\n\n` +
          `_Vous pouvez copier ces informations séparément._\n\n` +
          `⚠️ Conservez ces identifiants en sécurité.`;

        // Logger via la pipeline whatsapp_messages avec category=general
        const { data: msgLog } = await supabaseAdmin
          .from('whatsapp_messages')
          .insert({
            school_id: schoolId,
            sent_by: req.user.id,
            message_type: 'text',
            content: messageText,
            total_recipients: 1,
            status: 'sending',
            category: 'general',
          })
          .select()
          .single();

        if (!msgLog) { errorCount++; continue; }

        const { data: recipientLog } = await supabaseAdmin
          .from('whatsapp_message_recipients')
          .insert({
            message_id: msgLog.id,
            phone_e164: parent.phone_e164,
            parent_id: parent.id,
            status: 'pending',
          })
          .select()
          .single();

        if (!recipientLog) { errorCount++; continue; }

        const waResult = await sendText(schoolId, parent.phone_e164, messageText, { urgent: true });

        if (waResult.success) {
          await supabaseAdmin
            .from('whatsapp_message_recipients')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', recipientLog.id);
          await supabaseAdmin
            .from('whatsapp_messages')
            .update({ status: 'sent', sent_count: 1 })
            .eq('id', msgLog.id);
          sentCount++;
          sentDetails.push({ parent_id: parent.id, email: newEmail });
        } else {
          console.error('[Parents WhatsApp] send failed', parent.id, waResult.message);
          await supabaseAdmin
            .from('whatsapp_message_recipients')
            .update({ status: 'failed', error_message: waResult.message || 'Échec envoi Baileys' })
            .eq('id', recipientLog.id);
          await supabaseAdmin
            .from('whatsapp_messages')
            .update({ status: 'failed', failed_count: 1 })
            .eq('id', msgLog.id);
          errorCount++;
        }
      } catch (err) {
        console.error('Erreur pour parent', parent.id, err);
        errorCount++;
      }
    }

    res.json({
      message: `Identifiants envoyés à ${sentCount} parent(s)`,
      sent: sentCount,
      errors: errorCount,
      total: candidates.length,
      details: sentDetails,
    });
  } catch (error) {
    console.error('Erreur POST /parents/send-credentials-whatsapp:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Associer parent ↔ élève
router.post('/parents/:parentId/link', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { student_id, relationship } = req.body;

    if (!student_id) return res.status(400).json({ error: 'student_id requis' });

    const { data, error } = await supabaseAdmin
      .from('parent_students')
      .upsert(
        { parent_id: parentId, student_id, relationship: relationship || null },
        { onConflict: 'parent_id,student_id' }
      )
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur link parent-student:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Supprimer association parent ↔ élève
router.delete('/parents/:parentId/unlink/:studentId', async (req, res) => {
  try {
    const { parentId, studentId } = req.params;

    const { error } = await supabaseAdmin
      .from('parent_students')
      .delete()
      .eq('parent_id', parentId)
      .eq('student_id', studentId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur unlink parent-student:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Contacts parent
router.get('/parents/:parentId/contacts', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('parent_contacts')
      .select('id, parent_id, phone_e164, channel, is_primary, consent_status, created_at')
      .eq('parent_id', parentId)
      .order('is_primary', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur get contacts:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.post('/parents/:parentId/contacts', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { phone, channel } = req.body;
    const phoneE164 = normalizePhoneToE164(phone);

    if (!phoneE164) return res.status(400).json({ error: 'Téléphone invalide' });

    const { data: existingPrimary, error: existingError } = await supabaseAdmin
      .from('parent_contacts')
      .select('id')
      .eq('parent_id', parentId)
      .eq('channel', channel || 'whatsapp')
      .eq('is_primary', true)
      .maybeSingle();
    if (existingError) throw existingError;

    const { data, error } = await supabaseAdmin
      .from('parent_contacts')
      .upsert(
        {
          parent_id: parentId,
          phone_e164: phoneE164,
          channel: channel || 'whatsapp',
          is_primary: existingPrimary ? false : true,
          consent_status: 'pending'
        },
        { onConflict: 'parent_id,phone_e164,channel' }
      )
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur add contact:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.patch('/parents/:parentId/contacts/:contactId', async (req, res) => {
  try {
    const { parentId, contactId } = req.params;
    const { is_primary, consent_status } = req.body;

    if (is_primary === true) {
      const { data: contact, error: contactError } = await supabaseAdmin
        .from('parent_contacts')
        .select('id, channel')
        .eq('id', contactId)
        .eq('parent_id', parentId)
        .single();
      if (contactError) throw contactError;

      const { error: clearError } = await supabaseAdmin
        .from('parent_contacts')
        .update({ is_primary: false })
        .eq('parent_id', parentId)
        .eq('channel', contact.channel);
      if (clearError) throw clearError;
    }

    const updatePayload = {};
    if (typeof is_primary === 'boolean') updatePayload.is_primary = is_primary;
    if (typeof consent_status === 'string') updatePayload.consent_status = consent_status;

    const { data, error } = await supabaseAdmin
      .from('parent_contacts')
      .update(updatePayload)
      .eq('id', contactId)
      .eq('parent_id', parentId)
      .select()
      .single();
    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur patch contact:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.delete('/parents/:parentId/contacts/:contactId', async (req, res) => {
  try {
    const { parentId, contactId } = req.params;

    const { error } = await supabaseAdmin
      .from('parent_contacts')
      .delete()
      .eq('id', contactId)
      .eq('parent_id', parentId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur delete contact:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Import parents (JSON) - dryRun + commit
// Body attendu: { class_id, rows: [{ student_full_name, parent_full_name, phone_1, relationship? }], dryRun?: boolean }
router.post('/parents/import', async (req, res) => {
  try {
    const { class_id, rows, dryRun } = req.body;
    if (!class_id) return res.status(400).json({ error: 'class_id requis' });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows requis' });

    const { data: students, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id')
      .eq('role', 'student')
      .eq('class_id', class_id);
    if (studentsError) throw studentsError;

    const studentsIndex = (students || []).map(s => {
      const full = normalizeName(`${s.last_name} ${s.first_name}`);
      const fullRev = normalizeName(`${s.first_name} ${s.last_name}`);
      return { ...s, full, fullRev };
    });

    const results = [];
    for (const row of rows) {
      const studentFullNameRaw = row?.student_full_name;
      const parentFullNameRaw = row?.parent_full_name;
      const phone1 = normalizePhoneToE164(row?.phone_1);

      if (!studentFullNameRaw || !parentFullNameRaw || !phone1) {
        results.push({
          row,
          matchStatus: 'invalid',
          reason: 'Champs requis manquants (student_full_name, parent_full_name, phone_1)'
        });
        continue;
      }

      const studentNeedle = normalizeName(studentFullNameRaw);
      const matches = studentsIndex.filter(s => s.full === studentNeedle || s.fullRev === studentNeedle);

      if (matches.length === 1) {
        const matchedStudent = matches[0];
        results.push({
          row: { ...row, phone_1: phone1 },
          matchStatus: 'matched',
          student: { id: matchedStudent.id, first_name: matchedStudent.first_name, last_name: matchedStudent.last_name },
          actionsPreview: ['upsert_parent', 'upsert_contact', 'upsert_link']
        });
      } else if (matches.length > 1) {
        results.push({
          row: { ...row, phone_1: phone1 },
          matchStatus: 'ambiguous',
          studentMatches: matches.slice(0, 5).map(s => ({ id: s.id, first_name: s.first_name, last_name: s.last_name })),
          actionsPreview: ['needs_manual_resolution']
        });
      } else {
        results.push({
          row: { ...row, phone_1: phone1 },
          matchStatus: 'not_found',
          actionsPreview: ['skip']
        });
      }
    }

    if (dryRun === true) {
      return res.json({ dryRun: true, results });
    }

    // Commit: only rows with matched + exact student id
    const commits = [];
    for (const r of results) {
      if (r.matchStatus !== 'matched' || !r.student?.id) continue;

      const parentName = splitFullName(r.row.parent_full_name);
      const parentPhone = normalizePhoneToE164(r.row.phone_1);

      // Find existing parent by primary phone
      const { data: existingParentContact, error: existingContactError } = await supabaseAdmin
        .from('parent_contacts')
        .select('parent_id')
        .eq('phone_e164', parentPhone)
        .eq('channel', 'whatsapp')
        .maybeSingle();
      if (existingContactError) throw existingContactError;

      let parentId = existingParentContact?.parent_id;
      if (!parentId) {
        const parent = await createParentProfile({
          email: null,
          firstName: parentName.firstName,
          lastName: parentName.lastName,
          phone: parentPhone,
          schoolId: getSchoolId(req)
        });
        parentId = parent.id;
      }

      // Upsert contact
      const { error: upsertContactError } = await supabaseAdmin
        .from('parent_contacts')
        .upsert(
          {
            parent_id: parentId,
            phone_e164: parentPhone,
            channel: 'whatsapp',
            is_primary: true,
            consent_status: 'pending'
          },
          { onConflict: 'parent_id,phone_e164,channel' }
        );
      if (upsertContactError) throw upsertContactError;

      // Upsert link
      const { error: upsertLinkError } = await supabaseAdmin
        .from('parent_students')
        .upsert(
          {
            parent_id: parentId,
            student_id: r.student.id,
            relationship: r.row.relationship || null
          },
          { onConflict: 'parent_id,student_id' }
        );
      if (upsertLinkError) throw upsertLinkError;

      commits.push({ parent_id: parentId, student_id: r.student.id });
    }

    res.json({ dryRun: false, results, commitsCount: commits.length });
  } catch (error) {
    console.error('Erreur import parents:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Créer un élève
router.post('/students', async (req, res) => {
  try {
    const { email, password, firstName, lastName, classId } = req.body;

    // Créer l'utilisateur dans Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'student' }
    });

    if (authError) throw authError;

    // Créer le profil
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role: 'student',
        class_id: classId || null,
        school_id: getSchoolId(req)
      })
      .select()
      .single();

    if (profileError) throw profileError;

    res.status(201).json({ ...profile, password });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Supprimer un élève
router.delete('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Supprimer le profil (cascade supprimera les données liées)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', id);

    if (profileError) throw profileError;

    // Supprimer l'utilisateur Auth
    await supabaseAdmin.auth.admin.deleteUser(id);

    res.json({ message: 'Élève supprimé' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un professeur
router.delete('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[DELETE Teacher] Tentative de suppression du professeur:', id);

    // Vérifier que c'est bien un professeur
    const { data: teacher, error: teacherError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .eq('role', 'teacher')
      .single();

    if (teacherError) {
      console.error('[DELETE Teacher] Erreur lors de la recherche du professeur:', teacherError);
      return res.status(404).json({ error: 'Professeur non trouvé', details: teacherError.message });
    }

    if (!teacher) {
      console.error('[DELETE Teacher] Professeur non trouvé avec cet ID');
      return res.status(404).json({ error: 'Professeur non trouvé' });
    }

    console.log('[DELETE Teacher] Professeur trouvé:', teacher);

    // Supprimer les sessions du professeur
    console.log('[DELETE Teacher] Suppression des sessions...');
    const { error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('teacher_id', id);

    if (sessionsError) {
      console.error('[DELETE Teacher] Erreur suppression sessions:', sessionsError);
    }

    // Supprimer les associations teacher_subjects
    console.log('[DELETE Teacher] Suppression des associations teacher_subjects...');
    const { error: subjectsError } = await supabaseAdmin
      .from('teacher_subjects')
      .delete()
      .eq('teacher_id', id);

    if (subjectsError) {
      console.error('[DELETE Teacher] Erreur suppression teacher_subjects:', subjectsError);
    }

    // Supprimer les associations class_teachers
    console.log('[DELETE Teacher] Suppression des associations class_teachers...');
    const { error: classesError } = await supabaseAdmin
      .from('class_teachers')
      .delete()
      .eq('teacher_id', id);

    if (classesError) {
      console.error('[DELETE Teacher] Erreur suppression class_teachers:', classesError);
    }

    // Supprimer les documents du professeur
    console.log('[DELETE Teacher] Suppression des documents...');
    const { error: documentsError } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('teacher_id', id);

    if (documentsError) {
      console.error('[DELETE Teacher] Erreur suppression documents:', documentsError);
    }

    // Supprimer le profil
    console.log('[DELETE Teacher] Suppression du profil...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', id);

    if (profileError) {
      console.error('[DELETE Teacher] Erreur suppression profil:', profileError);
      throw profileError;
    }

    // Supprimer l'utilisateur Auth
    console.log('[DELETE Teacher] Suppression de l\'utilisateur Auth...');
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    
    if (authError) {
      console.error('[DELETE Teacher] Erreur suppression Auth:', authError);
      // Ne pas bloquer si l'utilisateur Auth n'existe plus
    }

    console.log('[DELETE Teacher] Professeur supprimé avec succès');
    res.json({ message: 'Professeur supprimé avec succès' });
  } catch (error) {
    console.error('[DELETE Teacher] Erreur suppression professeur:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression du professeur',
      details: error.message 
    });
  }
});

// Envoyer les identifiants des élèves via WhatsApp en masse
router.post('/students/send-credentials-whatsapp', async (req, res) => {
  try {
    const { filter, filiere, classId } = req.body;
    const schoolId = getSchoolId(req);

    // Récupérer les élèves selon le filtre
    let studentsQuery = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, class_id, classes!fk_profiles_class(name, filiere)')
      .eq('role', 'student');

    if (schoolId) {
      studentsQuery = studentsQuery.eq('school_id', schoolId);
    }

    if (filter === 'class' && classId) {
      studentsQuery = studentsQuery.eq('class_id', classId);
    }

    const { data: students, error: studentsError } = await studentsQuery;
    if (studentsError) throw studentsError;

    let filteredStudents = students || [];

    // Filtrer par filière si nécessaire
    if (filter === 'filiere' && filiere) {
      filteredStudents = filteredStudents.filter(s => s.classes?.filiere === filiere);
    }

    if (filteredStudents.length === 0) {
      return res.status(400).json({ error: 'Aucun élève trouvé avec ces critères' });
    }

    // Récupérer les mots de passe actuels depuis Auth (on ne peut pas les récupérer, donc on génère de nouveaux)
    // Pour chaque élève, récupérer les parents et envoyer
    let sentCount = 0;
    let errorCount = 0;

    for (const student of filteredStudents) {
      try {
        // Récupérer les parents de l'élève
        const { data: parentLinks } = await supabaseAdmin
          .from('parent_students')
          .select('parent_id')
          .eq('student_id', student.id);

        if (!parentLinks || parentLinks.length === 0) {
          errorCount++;
          continue;
        }

        const parentIds = parentLinks.map(l => l.parent_id);

        // Récupérer les contacts WhatsApp des parents
        const { data: contacts } = await supabaseAdmin
          .from('parent_contacts')
          .select('parent_id, phone_e164, is_primary')
          .in('parent_id', parentIds)
          .eq('channel', 'whatsapp')
          .order('is_primary', { ascending: false });

        if (!contacts || contacts.length === 0) {
          errorCount++;
          continue;
        }

        // Dédupliquer les numéros
        const parentPhoneMap = {};
        contacts.forEach(c => {
          if (!parentPhoneMap[c.parent_id]) {
            parentPhoneMap[c.parent_id] = c;
          }
        });

        const uniquePhones = {};
        Object.values(parentPhoneMap).forEach(c => {
          if (!uniquePhones[c.phone_e164]) {
            uniquePhones[c.phone_e164] = c;
          }
        });

        const recipients = Object.values(uniquePhones);

        if (recipients.length === 0) {
          errorCount++;
          continue;
        }

        if (!getStatus(schoolId).connected) {
          errorCount++;
          continue;
        }

        // Générer un nouveau mot de passe pour l'élève
        const year = new Date().getFullYear();
        const cleanFirstName = student.first_name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z]/g, '')
          .trim();
        const newPassword = cleanFirstName ? 
          cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1).toLowerCase() + year :
          `Eleve${year}`;

        // Mettre à jour le mot de passe
        await supabaseAdmin.auth.admin.updateUserById(student.id, {
          password: newPassword
        });

        // Formater le message
        const messageText = `🔐 *Identifiants de connexion*\n\n` +
          `Voici les identifiants de connexion pour *${student.first_name} ${student.last_name}* :\n\n` +
          `📧 *Login (Email)*\n${student.email}\n\n` +
          `🔑 *Mot de passe*\n${newPassword}\n\n` +
          `🌐 *Lien de connexion*\nhttps://etrack.ma/login\n\n` +
          `_Vous pouvez copier ces informations séparément pour faciliter la connexion._\n\n` +
          `⚠️ Veuillez conserver ces informations en sécurité.`;

        // Créer le log du message
        const { data: msgLog } = await supabaseAdmin
          .from('whatsapp_messages')
          .insert({
            school_id: schoolId,
            sent_by: req.user.id,
            message_type: 'text',
            content: messageText,
            total_recipients: recipients.length,
            status: 'sending'
          })
          .select()
          .single();

        if (msgLog) {
          // Envoyer les messages
          for (const contact of recipients) {
            try {
              const recipientLog = await supabaseAdmin
                .from('whatsapp_message_recipients')
                .insert({
                  message_id: msgLog.id,
                  phone_e164: contact.phone_e164,
                  parent_id: contact.parent_id,
                  status: 'pending'
                })
                .select()
                .single();

              if (recipientLog.data) {
                const waResult = await sendText(schoolId, contact.phone_e164, messageText, { urgent: true });

                if (waResult.success) {
                  await supabaseAdmin
                    .from('whatsapp_message_recipients')
                    .update({ status: 'sent', sent_at: new Date().toISOString() })
                    .eq('id', recipientLog.data.id);
                  sentCount++;
                } else {
                  await supabaseAdmin
                    .from('whatsapp_message_recipients')
                    .update({ status: 'failed', error_message: waResult.message || 'Échec envoi Baileys' })
                    .eq('id', recipientLog.data.id);
                }
              }
            } catch (err) {
              console.error('Erreur envoi WhatsApp:', err);
            }
          }

          // Mettre à jour le statut du message
          const { data: recipientStats } = await supabaseAdmin
            .from('whatsapp_message_recipients')
            .select('status')
            .eq('message_id', msgLog.id);

          const msgSentCount = recipientStats?.filter(r => r.status === 'sent').length || 0;
          const msgFailedCount = recipientStats?.filter(r => r.status === 'failed').length || 0;

          await supabaseAdmin
            .from('whatsapp_messages')
            .update({
              status: msgFailedCount === recipients.length ? 'failed' : 'sent',
              sent_count: msgSentCount,
              failed_count: msgFailedCount
            })
            .eq('id', msgLog.id);
        }
      } catch (err) {
        console.error('Erreur pour élève:', student.id, err);
        errorCount++;
      }
    }

    res.json({ 
      message: `Identifiants envoyés à ${sentCount} parent(s)`,
      sent: sentCount,
      errors: errorCount,
      total: filteredStudents.length
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Réinitialiser le mot de passe d'un élève
router.post('/students/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Mettre à jour le mot de passe dans Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: newPassword
    });

    if (updateError) throw updateError;

    // Envoyer le login et mot de passe via WhatsApp aux parents
    try {
      // Récupérer les informations de l'élève
      const { data: student } = await supabaseAdmin
        .from('profiles')
        .select('email, first_name, last_name, class_id, school_id')
        .eq('id', id)
        .single();

      if (student) {
        // Récupérer les parents de l'élève
        const { data: parentLinks } = await supabaseAdmin
          .from('parent_students')
          .select('parent_id')
          .eq('student_id', id);

        if (parentLinks && parentLinks.length > 0) {
          const parentIds = parentLinks.map(l => l.parent_id);

          // Récupérer les contacts WhatsApp des parents
          const { data: contacts } = await supabaseAdmin
            .from('parent_contacts')
            .select('parent_id, phone_e164, is_primary')
            .in('parent_id', parentIds)
            .eq('channel', 'whatsapp')
            .order('is_primary', { ascending: false });

          if (contacts && contacts.length > 0) {
            // Dédupliquer les numéros
            const parentPhoneMap = {};
            contacts.forEach(c => {
              if (!parentPhoneMap[c.parent_id]) {
                parentPhoneMap[c.parent_id] = c;
              }
            });

            const uniquePhones = {};
            Object.values(parentPhoneMap).forEach(c => {
              if (!uniquePhones[c.phone_e164]) {
                uniquePhones[c.phone_e164] = c;
              }
            });

            const recipients = Object.values(uniquePhones);

            if (recipients.length > 0) {
              const sessionApiKey = await getSessionApiKey(student.school_id);

              if (sessionApiKey) {
                // Formater le message avec login et mot de passe séparés
                const messageText = `🔐 *Réinitialisation du mot de passe*\n\n` +
                  `Le mot de passe de votre enfant *${student.first_name} ${student.last_name}* a été réinitialisé.\n\n` +
                  `Voici les nouveaux identifiants de connexion :\n\n` +
                  `📧 *Login (Email)*\n${student.email}\n\n` +
                  `🔑 *Mot de passe*\n${newPassword}\n\n` +
                  `🌐 *Lien de connexion*\nhttps://etrack.ma/login\n\n` +
                  `_Vous pouvez copier ces informations séparément pour faciliter la connexion._\n\n` +
                  `⚠️ Veuillez conserver ces informations en sécurité.`;

                // Créer le log du message
                const { data: msgLog } = await supabaseAdmin
                  .from('whatsapp_messages')
                  .insert({
                    school_id: student.school_id,
                    sent_by: req.user.id,
                    message_type: 'text',
                    content: messageText,
                    total_recipients: recipients.length,
                    status: 'sending'
                  })
                  .select()
                  .single();

                if (msgLog) {
                  // Envoyer les messages séquentiellement (limite Wasender: 1 message / 5 secondes)
                  for (const contact of recipients) {
                    try {
                      const recipientLog = await supabaseAdmin
                        .from('whatsapp_message_recipients')
                        .insert({
                          message_id: msgLog.id,
                          phone_e164: contact.phone_e164,
                          parent_id: contact.parent_id,
                          status: 'pending'
                        })
                        .select()
                        .single();

                      if (recipientLog.data) {
                        const response = await fetch(`${WASENDER_BASE}/api/send-message`, {
                          method: 'POST',
                          headers: {
                            'Authorization': `Bearer ${sessionApiKey}`,
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            to: contact.phone_e164,
                            text: messageText
                          })
                        });

                        if (response.ok) {
                          await supabaseAdmin
                            .from('whatsapp_message_recipients')
                            .update({ status: 'sent', sent_at: new Date().toISOString() })
                            .eq('id', recipientLog.data.id);
                        } else {
                          await supabaseAdmin
                            .from('whatsapp_message_recipients')
                            .update({ status: 'failed', error_message: 'Échec envoi API' })
                            .eq('id', recipientLog.data.id);
                        }

                        await waitWasenderInterval();
                      }
                    } catch (err) {
                      console.error('Erreur envoi WhatsApp:', err);
                    }
                  }

                  const { data: recipientStats } = await supabaseAdmin
                    .from('whatsapp_message_recipients')
                    .select('status')
                    .eq('message_id', msgLog.id);

                  const sentCount = recipientStats?.filter(r => r.status === 'sent').length || 0;
                  const failedCount = recipientStats?.filter(r => r.status === 'failed').length || 0;

                  await supabaseAdmin
                    .from('whatsapp_messages')
                    .update({
                      status: failedCount === recipients.length ? 'failed' : 'sent',
                      sent_count: sentCount,
                      failed_count: failedCount
                    })
                    .eq('id', msgLog.id);
                }
              }
            }
          }
        }
      }
    } catch (whatsappError) {
      console.error('Erreur notification WhatsApp:', whatsappError);
      // Ne pas bloquer la réinitialisation si l'envoi WhatsApp échoue
    }

    res.json({ message: 'Mot de passe réinitialisé avec succès', password: newPassword });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== CLASSES ====================

// Récupérer toutes les classes
router.get('/classes', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('classes')
      .select('*, teacher:profiles!classes_teacher_id_fkey(first_name, last_name)');
    query = applySchoolFilter(query, req);
    // Filtre de scope pour pedagogical_manager
    const scopedClsIds = await getScopedClassIds(req);
    if (scopedClsIds !== null) {
      if (scopedClsIds.length === 0) return res.json([]);
      query = query.in('id', scopedClsIds);
    }
    const { data, error } = await query;

    if (error) throw error;

    const classIds = (data || []).map(c => c.id);
    if (classIds.length === 0) {
      return res.json([]);
    }

    let studentsQuery = supabaseAdmin
      .from('profiles')
      .select('id, class_id')
      .eq('role', 'student')
      .in('class_id', classIds);
    studentsQuery = applySchoolFilter(studentsQuery, req);

    const { data: studentsData, error: studentsError } = await studentsQuery;
    if (studentsError) throw studentsError;

    const studentCountByClass = (studentsData || []).reduce((acc, student) => {
      if (!student.class_id) return acc;
      acc[student.class_id] = (acc[student.class_id] || 0) + 1;
      return acc;
    }, {});

    const classesWithCount = data.map(cls => ({
      ...cls,
      student_count: studentCountByClass[cls.id] || 0
    }));

    res.json(classesWithCount);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une classe
router.post('/classes', async (req, res) => {
  try {
    const { name, level, academicYear, teacherId, school_type, filiere } = req.body;

    const { data, error } = await supabaseAdmin
      .from('classes')
      .insert({
        name,
        level,
        academic_year: academicYear,
        teacher_id: teacherId || null,
        school_type: school_type || null,
        filiere: filiere || null,
        school_id: getSchoolId(req)
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier une classe
router.patch('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, level, academicYear, teacherId, school_type, filiere } = req.body;

    const updatePayload = {};
    if (typeof name === 'string') updatePayload.name = name.trim();
    if (typeof level === 'string') updatePayload.level = level.trim();
    if (typeof academicYear === 'string') updatePayload.academic_year = academicYear.trim();
    if (teacherId !== undefined) updatePayload.teacher_id = teacherId || null;
    if (school_type !== undefined) updatePayload.school_type = school_type || null;
    if (filiere !== undefined) updatePayload.filiere = filiere || null;

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'Aucun champ à modifier' });
    }

    const { data, error } = await supabaseAdmin
      .from('classes')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Classe non trouvée' });
    res.json(data);
  } catch (error) {
    console.error('Erreur PATCH /classes:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Supprimer une classe
router.delete('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Récupérer tous les élèves de la classe
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('class_id', id)
      .eq('role', 'student');

    if (studentsError) throw studentsError;

    // Supprimer les élèves et leurs comptes Auth
    if (students && students.length > 0) {
      for (const student of students) {
        // Supprimer le profil
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', student.id);

        if (profileError) {
          console.error(`Erreur suppression profil ${student.id}:`, profileError);
        }

        // Supprimer le compte Auth
        try {
          await supabaseAdmin.auth.admin.deleteUser(student.id);
        } catch (authError) {
          console.error(`Erreur suppression utilisateur Auth ${student.id}:`, authError);
        }
      }
    }

    // Supprimer la classe
    const { error: classError } = await supabaseAdmin
      .from('classes')
      .delete()
      .eq('id', id);

    if (classError) throw classError;
    
    console.log(`Classe ${id} supprimée avec ${students?.length || 0} élève(s)`);
    res.json({ message: `Classe supprimée avec ${students?.length || 0} élève(s)` });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Importer des classes en vrac avec leurs élèves (depuis Excel)
router.post('/classes/import', async (req, res) => {
  try {
    const { classes: classesData } = req.body;

    if (!Array.isArray(classesData) || classesData.length === 0) {
      return res.status(400).json({ error: 'Données invalides : tableau de classes requis' });
    }

    const schoolId = getSchoolId(req);
    let schoolDomain = 'ecole.ma';
    let schoolName = '';
    
    if (schoolId) {
      const { data: school } = await supabaseAdmin
        .from('schools')
        .select('name, code')
        .eq('id', schoolId)
        .single();
      if (school) {
        schoolName = school.name || school.code || 'ecole';
        schoolDomain = schoolName
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '') + '.ma';
      }
    }

    const createdClasses = [];
    const errors = [];
    const allCreatedStudents = [];
    const allExistingStudents = [];
    const reassignedStudents = [];
    const otherSchoolStudents = []; // Élèves qui existent dans une autre école
    let totalStudentsProcessed = 0;
    // Cache des années déjà traitées dans CETTE requête → évite de réécrire
    // la même config établissement/année pour chaque fichier importé.
    const yearConfigDone = new Set();

    for (const classData of classesData) {
      const {
        name, level, school_type, filiere, academic_year, students: studentsList,
        academy, provincialDirection, commune, establishment
      } = classData;

      if (!name || !level) {
        errors.push({ className: name || 'Inconnue', reason: 'Nom et niveau obligatoires' });
        continue;
      }

      try {
        // 1. Réutiliser la classe existante (même école + nom + année) ou la créer.
        //    → Réimporter le même fichier met à jour la classe au lieu d'en dupliquer une.
        let newClass = null;
        let classError = null;

        let findQuery = supabaseAdmin
          .from('classes')
          .select('*')
          .eq('name', name)
          .eq('school_id', schoolId || null);
        findQuery = academic_year
          ? findQuery.eq('academic_year', academic_year)
          : findQuery.is('academic_year', null);
        // limit(1) + order : robuste même si des doublons existent déjà
        const { data: foundClasses } = await findQuery.order('created_at', { ascending: true }).limit(1);
        const existingClass = Array.isArray(foundClasses) && foundClasses.length ? foundClasses[0] : null;

        if (existingClass) {
          // Compléter les champs manquants sans écraser ce qui existe
          const patch = {};
          if (level && existingClass.level !== level) patch.level = level;
          if (school_type && !existingClass.school_type) patch.school_type = school_type;
          if (filiere && !existingClass.filiere) patch.filiere = filiere;
          if (Object.keys(patch).length) {
            const { data: upd } = await supabaseAdmin
              .from('classes').update(patch).eq('id', existingClass.id).select().single();
            newClass = upd || existingClass;
          } else {
            newClass = existingClass;
          }
        } else {
          const { data: created, error: cErr } = await supabaseAdmin
            .from('classes')
            .insert({
              name,
              level,
              school_type: school_type || null,
              filiere: filiere || null,
              academic_year: academic_year || null,
              school_id: schoolId
            })
            .select()
            .single();
          newClass = created;
          classError = cErr;
        }

        if (classError || !newClass) {
          errors.push({ className: name, reason: `Erreur création classe: ${classError?.message || 'inconnue'}` });
          continue;
        }

        // 1.b Renseigner la config d'année scolaire (académie / direction / commune /
        //     établissement) à partir du fichier officiel Massar — UNE SEULE FOIS par
        //     année : sert de référence. Réimporter d'autres fichiers de la même
        //     année/établissement ne réécrit PAS la config (réutilisation simple).
        if (schoolId && academic_year && (academy || provincialDirection || commune || establishment)
            && !yearConfigDone.has(academic_year)) {
          try {
            const { data: syc } = await supabaseAdmin
              .from('school_year_config')
              .select('*')
              .eq('school_id', schoolId)
              .eq('academic_year', academic_year)
              .maybeSingle();

            // Ne réécrire que s'il manque réellement une info ; sinon on réutilise tel quel.
            const needsWrite =
              (academy && !syc?.academy) ||
              (provincialDirection && !syc?.provincial_direction) ||
              (commune && !syc?.region) ||
              (establishment && !syc?.establishment_label);

            if (needsWrite) {
              await supabaseAdmin
                .from('school_year_config')
                .upsert({
                  school_id: schoolId,
                  academic_year,
                  academy: syc?.academy || academy || null,
                  provincial_direction: syc?.provincial_direction || provincialDirection || null,
                  region: syc?.region || commune || null,
                  establishment_label: syc?.establishment_label || establishment || null,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'school_id,academic_year' });
              console.log(`[Import Class] Config établissement enregistrée (référence) pour ${academic_year}`);
            } else {
              console.log(`[Import Class] Config ${academic_year} déjà présente → réutilisée (pas de réécriture)`);
            }
            yearConfigDone.add(academic_year); // ne plus retraiter cette année dans cette requête
          } catch (e) {
            console.warn('[Import Class] school_year_config non mis à jour:', e.message);
          }
        }

        // 2. Créer les élèves de cette classe
        const classStudents = [];
        if (Array.isArray(studentsList) && studentsList.length > 0) {
          for (const student of studentsList) {
            const firstName = String(student.firstName || '').replace(/\s+/g, ' ').trim();
            let lastName = String(student.lastName || '').replace(/\s+/g, ' ').trim();
            const { birthDate, birthPlace, gender } = student;
            const massarCode = student.massarCode ? String(student.massarCode).trim() : null;

            if (!firstName && !lastName) {
              continue; // Ligne réellement vide
            }
            if (!lastName) lastName = firstName; // ne pas perdre un élève sans nom de famille

            // Genre : Massar = 'ذكر' (M) / 'أنثى' (F)
            const gStr = String(gender || '').trim();
            const genderCode = /ذكر|^m|gar|masc/i.test(gStr) ? 'M'
              : /أنثى|انثى|^f|fil|fem/i.test(gStr) ? 'F' : null;

            totalStudentsProcessed += 1;

            // Générer email basé sur le code Massar ou le nom
            const emailId = massarCode 
              ? massarCode.toLowerCase().replace(/[^a-z0-9]/g, '')
              : `${firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')}${lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')}`;
            
            let email = `${emailId}@${schoolDomain}`;
            // Mot de passe simplifié: Prénom + Année (ex: Ahmed2025)
            const cleanFirstName = firstName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '');
            const baseName = cleanFirstName ? (cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1).toLowerCase()) : 'Eleve';
            const codeTail = (massarCode || emailId).replace(/[^a-zA-Z0-9]/g, '').slice(-4) || '0000';
            const password = `${baseName}${new Date().getFullYear()}${codeTail}`;

            try {
              // 2.a Chercher un profil existant : d'abord par CODE MASSAR (clé fiable),
              //     sinon par email généré. Permet la mise à jour lors d'un réimport.
              let existingProfile = null;
              let existingProfileError = null;
              if (massarCode) {
                const r = await supabaseAdmin
                  .from('profiles')
                  .select('id, email, first_name, last_name, school_id, class_id, massar_code')
                  .eq('massar_code', massarCode)
                  .eq('role', 'student')
                  .maybeSingle();
                existingProfile = r.data; existingProfileError = r.error;
              }
              if (!existingProfile && !existingProfileError) {
                const r = await supabaseAdmin
                  .from('profiles')
                  .select('id, email, first_name, last_name, school_id, class_id, massar_code')
                  .eq('email', email)
                  .eq('role', 'student')
                  .maybeSingle();
                existingProfile = r.data; existingProfileError = r.error;
              }

              if (existingProfileError) {
                errors.push({ className: name, student: `${firstName} ${lastName}`, email, reason: `Erreur recherche profil: ${existingProfileError.message}` });
                continue;
              }

              if (existingProfile) {
                if (schoolId && existingProfile.school_id && existingProfile.school_id !== schoolId) {
                  otherSchoolStudents.push({
                    className: name,
                    email,
                    first_name: existingProfile.first_name,
                    last_name: existingProfile.last_name,
                    school_id: existingProfile.school_id
                  });
                  continue;
                }

                let finalExistingProfile = existingProfile;
                let wasReassigned = false;

                // Patch : (re)affectation de classe + complétion des champs Massar
                const profPatch = {};
                if (existingProfile.class_id !== newClass.id) profPatch.class_id = newClass.id;
                if (massarCode && !existingProfile.massar_code) profPatch.massar_code = massarCode;
                if (birthDate) profPatch.date_of_birth = birthDate;
                if (genderCode) profPatch.gender = genderCode;
                if (birthPlace) profPatch.birth_place = String(birthPlace).trim();

                if (Object.keys(profPatch).length) {
                  let { data: updatedProfile, error: updateProfileError } = await supabaseAdmin
                    .from('profiles')
                    .update(profPatch)
                    .eq('id', existingProfile.id)
                    .select('id, email, first_name, last_name, school_id, class_id')
                    .single();

                  // Repli si gender/birth_place pas encore migrés
                  if (updateProfileError && /gender|birth_place|column/i.test(updateProfileError.message || '')) {
                    const { gender: _g, birth_place: _b, ...safePatch } = profPatch;
                    if (Object.keys(safePatch).length) {
                      ({ data: updatedProfile, error: updateProfileError } = await supabaseAdmin
                        .from('profiles').update(safePatch).eq('id', existingProfile.id)
                        .select('id, email, first_name, last_name, school_id, class_id').single());
                    } else { updateProfileError = null; updatedProfile = existingProfile; }
                  }

                  if (updateProfileError) {
                    errors.push({ className: name, student: `${firstName} ${lastName}`, email, reason: `Erreur mise à jour: ${updateProfileError.message}` });
                    continue;
                  }

                  finalExistingProfile = updatedProfile;
                  if (profPatch.class_id) {
                    wasReassigned = true;
                    reassignedStudents.push({ id: updatedProfile.id, email: updatedProfile.email, className: name });
                  }
                }

                const existingPayload = {
                  ...finalExistingProfile,
                  password: '********',
                  massarCode: massarCode || null,
                  className: name,
                  status: wasReassigned ? 'reassigned' : 'existing'
                };

                classStudents.push(existingPayload);
                allExistingStudents.push(existingPayload);
                continue;
              }

              // Fonction pour créer l'utilisateur avec retry et email unique
              let authData = null;
              let authError = null;
              let attempts = 0;
              const maxAttempts = 5;
              
              while (attempts < maxAttempts) {
                const result = await supabaseAdmin.auth.admin.createUser({
                  email,
                  password,
                  email_confirm: true,
                  user_metadata: { 
                    first_name: firstName, 
                    last_name: lastName, 
                    role: 'student',
                    massar_code: massarCode || null
                  }
                });
                
                authData = result.data;
                authError = result.error;
                
                if (!authError) {
                  // Succès - sortir de la boucle
                  break;
                }
                
                // Vérifier si l'erreur est "email déjà utilisé"
                const errorMsg = String(authError.message || authError.msg || authError);
                const errorCode = authError.code || authError.status || '';
                const isEmailExists = errorMsg.includes('already') || 
                                      errorMsg.includes('exists') || 
                                      errorMsg.includes('duplicate') || 
                                      errorMsg.includes('registered') ||
                                      errorCode === 'email_exists' ||
                                      errorCode === 'user_already_exists' ||
                                      errorCode === 422;
                
                if (isEmailExists) {
                  // Email existe - générer un nouvel email unique avec suffixe
                  attempts++;
                  const suffix = `_${attempts}`;
                  email = `${emailId}${suffix}@${schoolDomain}`;
                  console.log(`[Import Class] Email existe, tentative ${attempts} avec: ${email}`);
                } else {
                  // Autre erreur - ne pas réessayer
                  console.error(`[Import Class] Erreur auth non-récupérable pour ${email}:`, authError);
                  break;
                }
              }

              if (authError) {
                console.error(`[Import Class] Échec création après ${attempts} tentatives pour ${emailId}:`, authError);
                errors.push({ className: name, student: `${firstName} ${lastName}`, email, reason: `Création compte échouée: ${authError.message || authError.msg || authError}` });
                continue;
              }

              const userId = authData?.user?.id;
              if (!userId) {
                console.error(`[Import Class] Pas d'ID utilisateur pour ${email}`);
                errors.push({ className: name, student: `${firstName} ${lastName}`, email, reason: 'Compte créé sans identifiant' });
                continue;
              }
              
              console.log(`[Import Class] Utilisateur créé: ${email} (ID: ${userId})`);

              // Créer le profil élève. Les colonnes gender/birth_place nécessitent
              // MIGRATION_STUDENT_FIELDS.sql ; repli automatique si absentes pour ne
              // jamais perdre d'élève.
              const baseProfile = {
                id: userId,
                email,
                first_name: firstName,
                last_name: lastName,
                role: 'student',
                class_id: newClass.id,
                school_id: schoolId,
                date_of_birth: birthDate || null,
                massar_code: massarCode || null
              };
              let { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .insert({ ...baseProfile, gender: genderCode, birth_place: birthPlace ? String(birthPlace).trim() : null })
                .select()
                .single();

              if (profileError && /gender|birth_place|column/i.test(profileError.message || '')) {
                // Colonnes non encore migrées → réinsertion sans elles
                ({ data: profile, error: profileError } = await supabaseAdmin
                  .from('profiles').insert(baseProfile).select().single());
              }

              if (profileError) {
                console.error(`[Import Class] Erreur profil ${email}:`, profileError);
                errors.push({ className: name, student: `${firstName} ${lastName}`, email, reason: `Erreur profil: ${profileError.message}` });
                continue;
              }

              classStudents.push({
                ...profile,
                password,
                massarCode: massarCode || null
              });
              allCreatedStudents.push({
                ...profile,
                password,
                className: name,
                massarCode: massarCode || null
              });
            } catch (studentErr) {
              console.error(`[Import Class] Erreur élève ${firstName} ${lastName}:`, studentErr);
            }
          }
        }

        createdClasses.push({
          ...newClass,
          studentCount: classStudents.length,
          students: classStudents
        });

      } catch (err) {
        errors.push({ className: name, reason: err.message });
      }
    }

    console.log(`[Import Classes] ${createdClasses.length} classes créées, ${allCreatedStudents.length} élèves, ${otherSchoolStudents.length} dans autres écoles, ${errors.length} erreurs`);
    res.status(201).json({
      message: `${createdClasses.length} classe(s) importée(s) avec ${allCreatedStudents.length} élève(s)`,
      classes: createdClasses,
      totalStudents: allCreatedStudents.length,
      existingStudents: allExistingStudents.length > 0 ? allExistingStudents : undefined,
      reassignedStudents: reassignedStudents.length > 0 ? reassignedStudents : undefined,
      otherSchoolStudents: otherSchoolStudents.length > 0 ? otherSchoolStudents : undefined,
      otherSchoolCount: otherSchoolStudents.length,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        new: allCreatedStudents.length,
        existing: allExistingStudents.length,
        reassigned: reassignedStudents.length,
        otherSchool: otherSchoolStudents.length,
        errors: errors.length,
        total: totalStudentsProcessed
      }
    });
  } catch (error) {
    console.error('Erreur import classes:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== MATIÈRES ====================

// Matières par défaut du système éducatif marocain
const DEFAULT_MOROCCAN_SUBJECTS = [
  { name: 'Mathématiques', code: 'MATH', description: 'Algèbre, analyse, géométrie, statistiques' },
  { name: 'Physique-Chimie', code: 'PC', description: 'Sciences physiques et chimie' },
  { name: 'Sciences de la Vie et de la Terre', code: 'SVT', description: 'Biologie et géologie' },
  { name: 'Langue Arabe', code: 'AR', description: 'Langue et littérature arabe' },
  { name: 'Langue Française', code: 'FR', description: 'Langue et littérature française' },
  { name: 'Langue Anglaise', code: 'EN', description: 'Langue anglaise' },
  { name: 'Éducation Islamique', code: 'ISLAM', description: 'Sciences islamiques' },
  { name: 'Histoire-Géographie', code: 'HG', description: 'Histoire et géographie' },
  { name: 'Philosophie', code: 'PHILO', description: 'Philosophie et pensée critique' },
  { name: 'Informatique', code: 'INFO', description: 'Sciences informatiques et programmation' },
  { name: 'Économie et Gestion', code: 'ECO', description: 'Sciences économiques et gestion' },
  { name: 'Comptabilité', code: 'COMPTA', description: 'Comptabilité générale et analytique' },
  { name: "Sciences de l'Ingénieur", code: 'SI', description: "Sciences de l'ingénieur et technologie" },
  { name: 'Éducation Physique et Sportive', code: 'EPS', description: 'Sport et activités physiques' },
  { name: 'Arts Plastiques', code: 'ART', description: 'Arts plastiques et éducation artistique' },
  { name: 'Musique', code: 'MUS', description: 'Éducation musicale' },
  { name: 'Traduction', code: 'TRAD', description: 'Traduction et interprétation' },
  { name: 'Droit', code: 'DROIT', description: 'Sciences juridiques' },
  { name: 'Espagnol', code: 'ES', description: 'Langue espagnole' },
  { name: 'Allemand', code: 'DE', description: 'Langue allemande' },
  { name: 'Italien', code: 'IT', description: 'Langue italienne' },
  { name: 'Amazighe', code: 'AMZ', description: 'Langue et culture amazighe' },
  { name: 'Activité Scientifique', code: 'ACTSCI', description: 'Activités scientifiques (primaire/collège)' },
  { name: 'Technologie', code: 'TECH', description: 'Technologie et informatique' },
];

// Récupérer toutes les matières (auto-seed si vide)
router.get('/subjects', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    let query = supabaseAdmin.from('subjects').select('*');
    query = applySchoolFilter(query, req);
    let { data, error } = await query;

    if (error) throw error;

    // Auto-seed default subjects if school has none
    if ((!data || data.length === 0) && schoolId) {
      const toInsert = DEFAULT_MOROCCAN_SUBJECTS.map(s => ({ ...s, school_id: schoolId }));
      const { data: seeded, error: seedErr } = await supabaseAdmin
        .from('subjects')
        .insert(toInsert)
        .select();
      if (!seedErr && seeded) data = seeded;
    }

    res.json(data || []);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une matière
router.post('/subjects', async (req, res) => {
  try {
    const { name, code, description } = req.body;

    const { data, error } = await supabaseAdmin
      .from('subjects')
      .insert({
        name,
        code,
        description,
        school_id: getSchoolId(req)
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une matière
router.delete('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('subjects')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Matière supprimée' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== PROFESSEURS ====================

// Récupérer tous les professeurs
router.get('/teachers', async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('role', 'teacher');
    query = applySchoolFilter(query, req);
    // Filtre de scope : profs qui enseignent dans les classes assignées
    const scopedIds = await getScopedClassIds(req);
    if (scopedIds !== null) {
      if (scopedIds.length === 0) return res.json([]);
      const { data: ct } = await supabaseAdmin
        .from('class_teachers')
        .select('teacher_id')
        .in('class_id', scopedIds);
      const teacherIds = [...new Set((ct || []).map(r => r.teacher_id))];
      if (teacherIds.length === 0) return res.json([]);
      query = query.in('id', teacherIds);
    }
    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un professeur
router.post('/teachers', async (req, res) => {
  try {
    let { email, password, firstName, lastName, phone, subjectId } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Le prénom et le nom sont obligatoires.' });
    }

    // Auto-générer email et mot de passe si non fournis
    if (!email || !password) {
      const schoolId = getSchoolId(req);
      let schoolDomain = 'ecole.ma';
      if (schoolId) {
        const { data: school } = await supabaseAdmin
          .from('schools')
          .select('name, code')
          .eq('id', schoolId)
          .single();
        if (school) {
          // Utiliser le nom de l'école comme domaine (ex: "Mon École" -> "monecole.ma")
          schoolDomain = (school.name || school.code || 'ecole')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '') + '.ma';
        }
      }

      if (!email) {
        const sanitize = (str) => {
          return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        };
        const firstPart = sanitize(firstName);
        const lastPart = sanitize(lastName);
        // Si les deux parties sont vides (noms arabes), générer un email avec timestamp
        if (!firstPart && !lastPart) {
          const timestamp = Date.now().toString().slice(-6);
          email = `prof${timestamp}@${schoolDomain}`;
        } else {
          email = `${firstPart}${lastPart}@${schoolDomain}`;
        }
      }
      if (!password) {
        const year = new Date().getFullYear();
        const cleanFirstName = firstName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z]/g, '')
          .trim();
        // Si le prénom nettoyé est vide (arabe), utiliser un mot de passe générique
        password = cleanFirstName ? 
          cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1).toLowerCase() + year :
          `Prof${year}${Math.random().toString(36).slice(2, 6)}`;
      }
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'teacher' }
    });

    if (authError) throw authError;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        role: 'teacher',
        school_id: getSchoolId(req)
      })
      .select()
      .single();

    if (profileError) throw profileError;

    // Assigner la matière si fournie
    if (subjectId) {
      await supabaseAdmin
        .from('teacher_subjects')
        .insert({
          teacher_id: authData.user.id,
          subject_id: subjectId,
          school_id: getSchoolId(req)
        });
    }

    res.status(201).json({ ...profile, password, generatedEmail: email });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Modifier un professeur
router.put('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Le prénom et le nom sont obligatoires.' });
    }

    // Mettre à jour le profil
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        phone: phone || null
      })
      .eq('id', id)
      .eq('role', 'teacher')
      .select()
      .single();

    if (profileError) throw profileError;
    if (!profile) return res.status(404).json({ error: 'Professeur non trouvé' });

    res.json(profile);
  } catch (error) {
    console.error('Erreur PUT /teachers/:id:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Importer des professeurs en masse (depuis Excel)
router.post('/teachers/import', async (req, res) => {
  try {
    const { teachers } = req.body;

    if (!Array.isArray(teachers) || teachers.length === 0) {
      return res.status(400).json({ error: 'Données invalides : tableau de professeurs requis' });
    }

    const schoolId = getSchoolId(req);
    let schoolDomain = 'ecole.ma';
    if (schoolId) {
      const { data: school } = await supabaseAdmin
        .from('schools')
        .select('name, code')
        .eq('id', schoolId)
        .single();
      if (school) {
        schoolDomain = (school.name || school.code || 'ecole')
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '') + '.ma';
      }
    }

    // Récupérer toutes les matières pour le matching par nom
    const { data: allSubjects } = await supabaseAdmin
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId);

    const subjectMap = new Map();
    (allSubjects || []).forEach(s => {
      subjectMap.set(s.name.toLowerCase().trim(), s.id);
    });

    const createdTeachers = [];
    const errors = [];
    const sanitize = (str) => {
      return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    };

    for (const teacher of teachers) {
      const { firstName, lastName, phone, subjectName } = teacher;

      if (!firstName || !lastName) {
        errors.push({ name: `${firstName || ''} ${lastName || ''}`, reason: 'Prénom et nom obligatoires' });
        continue;
      }

      // Générer email avec fallback pour noms arabes
      const firstPart = sanitize(firstName);
      const lastPart = sanitize(lastName);
      let email;
      if (!firstPart && !lastPart) {
        const timestamp = Date.now().toString().slice(-6);
        email = `prof${timestamp}@${schoolDomain}`;
      } else {
        email = `${firstPart}${lastPart}@${schoolDomain}`;
      }

      const year = new Date().getFullYear();
      const cleanFirstName = firstName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z]/g, '')
        .trim();
      const password = cleanFirstName ? 
        cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1).toLowerCase() + year :
        `Prof${year}${Math.random().toString(36).slice(2, 6)}`;

      try {
        // Créer l'utilisateur dans Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { first_name: firstName, last_name: lastName, role: 'teacher' }
        });

        if (authError) {
          errors.push({ name: `${firstName} ${lastName}`, reason: authError.message });
          continue;
        }

        // Créer le profil
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: authData.user.id,
            email,
            first_name: firstName,
            last_name: lastName,
            phone: phone || null,
            role: 'teacher',
            school_id: schoolId
          })
          .select()
          .single();

        if (profileError) {
          errors.push({ name: `${firstName} ${lastName}`, reason: profileError.message });
          continue;
        }

        // Assigner la matière si trouvée
        let assignedSubject = null;
        if (subjectName) {
          const subjectId = subjectMap.get(subjectName.toLowerCase().trim());
          if (subjectId) {
            await supabaseAdmin
              .from('teacher_subjects')
              .insert({
                teacher_id: authData.user.id,
                subject_id: subjectId,
                school_id: schoolId
              });
            assignedSubject = subjectName;
          }
        }

        createdTeachers.push({
          ...profile,
          email,
          password,
          assignedSubject
        });
      } catch (err) {
        errors.push({ name: `${firstName} ${lastName}`, reason: err.message });
      }
    }

    console.log(`[Import Profs] ${createdTeachers.length} créés, ${errors.length} erreurs`);
    res.status(201).json({
      message: `${createdTeachers.length} professeur(s) importé(s) avec succès`,
      teachers: createdTeachers,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Erreur import professeurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Envoyer les identifiants des professeurs via WhatsApp en masse
router.post('/teachers/send-credentials-whatsapp', async (req, res) => {
  try {
    const { filter, message, messageType = 'text', mediaUrl, fileName } = req.body;
    const schoolId = getSchoolId(req);

    // Récupérer tous les professeurs
    let teachersQuery = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone')
      .eq('role', 'teacher');

    if (schoolId) {
      teachersQuery = teachersQuery.eq('school_id', schoolId);
    }

    const { data: teachers, error: teachersError } = await teachersQuery;
    if (teachersError) throw teachersError;

    if (!teachers || teachers.length === 0) {
      return res.status(400).json({ error: 'Aucun professeur trouvé' });
    }

    // Appliquer les filtres
    let filteredTeachers = teachers || [];
    
    // Filtrer par IDs de professeurs spécifiques
    if (filter?.teacher_ids && filter.teacher_ids.length > 0) {
      filteredTeachers = filteredTeachers.filter(t => filter.teacher_ids.includes(t.id));
    }
    
    // Filtrer par matière
    if (filter?.subjectId) {
      const { data: teacherSubjectsData } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id')
        .eq('subject_id', filter.subjectId);
      
      const teacherIdsWithSubject = teacherSubjectsData?.map(ts => ts.teacher_id) || [];
      filteredTeachers = filteredTeachers.filter(t => teacherIdsWithSubject.includes(t.id));
    }
    
    // Filtrer par classe
    if (filter?.classId) {
      const { data: classTeachersData } = await supabaseAdmin
        .from('class_teachers')
        .select('teacher_id')
        .eq('class_id', filter.classId);
      
      const teacherIdsWithClass = classTeachersData?.map(ct => ct.teacher_id) || [];
      filteredTeachers = filteredTeachers.filter(t => teacherIdsWithClass.includes(t.id));
    }

    // Normaliser les numéros puis garder uniquement les professeurs avec numéro valide
    const teachersWithPhone = filteredTeachers
      .map((t) => ({ ...t, normalized_phone: normalizePhoneToE164(t.phone) }))
      .filter((t) => !!t.normalized_phone);

    console.log('[Teachers WhatsApp] Stats:', {
      schoolId,
      totalTeachers: teachers?.length || 0,
      filteredTeachers: filteredTeachers.length,
      teachersWithValidPhone: teachersWithPhone.length,
      filters: filter
    });

    if (teachersWithPhone.length === 0) {
      return res.status(400).json({ error: 'Aucun professeur n\'a de numéro de téléphone' });
    }

    const waStatusTeacher = getStatus(schoolId);
    if (!waStatusTeacher.connected) {
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée pour cette école. Connectez le numéro de votre école depuis la page WhatsApp.' });
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const teacher of teachersWithPhone) {
      try {
        const phoneNumber = teacher.normalized_phone;

        // Utiliser le message personnalisé ou générer les identifiants par défaut
        let messageText, message_type, content, media_url, file_name;
        
        // Si un message personnalisé est fourni (texte, image ou document), l'utiliser tel quel
        if (message && message.trim()) {
          // Message personnalisé - NE PAS générer les identifiants
          messageText = message;
          message_type = messageType;
          content = message;
          media_url = mediaUrl || null;
          file_name = fileName || null;
        } else if (mediaUrl) {
          // Si seulement un média est fourni sans texte - NE PAS générer les identifiants
          messageText = '';
          message_type = messageType;
          content = '';
          media_url = mediaUrl;
          file_name = fileName || null;
        } else {
          // SEULEMENT si aucun message ni média n'est fourni : générer les identifiants
          const year = new Date().getFullYear();
          const cleanFirstName = teacher.first_name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z]/g, '')
            .trim();
          const newPassword = cleanFirstName ? 
            cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1).toLowerCase() + year :
            `Prof${year}`;

          // Mettre à jour le mot de passe
          await supabaseAdmin.auth.admin.updateUserById(teacher.id, {
            password: newPassword
          });

          messageText = `🔐 *Identifiants de connexion*\n\n` +
            `Voici vos identifiants de connexion pour la plateforme EduTrack :\n\n` +
            `📧 *Login (Email)*\n${teacher.email}\n\n` +
            `🔑 *Mot de passe*\n${newPassword}\n\n` +
            `🌐 *Lien de connexion*\nhttps://etrack.ma/login\n\n` +
            `_Vous pouvez copier ces informations séparément pour faciliter la connexion._\n\n` +
            `⚠️ Veuillez conserver ces informations en sécurité.`;
          message_type = 'text';
          content = messageText;
          media_url = null;
          file_name = null;
        }

        // Créer le log du message
        const { data: msgLog } = await supabaseAdmin
          .from('whatsapp_messages')
          .insert({
            school_id: schoolId,
            sent_by: req.user.id,
            message_type: message_type,
            content: content,
            media_url: media_url,
            file_name: file_name,
            total_recipients: 1,
            status: 'sending'
          })
          .select()
          .single();

        if (msgLog) {
          // Créer le log du destinataire
          const recipientLog = await supabaseAdmin
            .from('whatsapp_message_recipients')
            .insert({
              message_id: msgLog.id,
              phone_e164: phoneNumber,
              parent_id: null,
              status: 'pending'
            })
            .select()
            .single();

          if (recipientLog.data) {
            // Envoyer via Baileys selon le type de message
            let waResult;
            if (messageType === 'image' && mediaUrl) {
              waResult = await sendImage(schoolId, phoneNumber, mediaUrl, messageText || '', { urgent: true });
            } else if (messageType === 'document' && mediaUrl) {
              waResult = await sendDocument(schoolId, phoneNumber, mediaUrl, fileName || 'document.pdf', messageText || '', undefined, { urgent: true });
            } else {
              waResult = await sendText(schoolId, phoneNumber, messageText, { urgent: true });
            }

            if (waResult.success) {
              await supabaseAdmin
                .from('whatsapp_message_recipients')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('id', recipientLog.data.id);
              await supabaseAdmin
                .from('whatsapp_messages')
                .update({ status: 'sent', sent_count: 1 })
                .eq('id', msgLog.id);
              sentCount++;
            } else {
              console.error('[Teachers WhatsApp] send failed:', { teacherId: teacher.id, phoneNumber, error: waResult.message });
              await supabaseAdmin
                .from('whatsapp_message_recipients')
                .update({ status: 'failed', error_message: waResult.message || 'Échec envoi Baileys' })
                .eq('id', recipientLog.data.id);
              await supabaseAdmin
                .from('whatsapp_messages')
                .update({ status: 'failed', failed_count: 1 })
                .eq('id', msgLog.id);
              errorCount++;
            }
          }
        }
      } catch (err) {
        console.error('Erreur pour professeur:', teacher.id, err);
        errorCount++;
      }
    }

    res.json({ 
      message: `Identifiants envoyés à ${sentCount} professeur(s)`,
      sent: sentCount,
      errors: errorCount,
      total: teachersWithPhone.length
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Réinitialiser le mot de passe d'un professeur
router.post('/teachers/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    console.log('[ResetPassword] Tentative de réinitialisation pour user:', id);
    console.log('[ResetPassword] Nouveau mot de passe longueur:', newPassword?.length);

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Vérifier que l'utilisateur existe
    const { data: user, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(id);
    if (getUserError || !user) {
      console.error('[ResetPassword] Utilisateur non trouvé:', getUserError);
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    console.log('[ResetPassword] Email utilisateur:', user.user.email);

    // Mettre à jour le mot de passe dans Auth avec email_confirm à false
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: newPassword,
      email_confirm: true // Confirmer l'email automatiquement
    });

    if (updateError) {
      console.error('[ResetPassword] Erreur mise à jour:', updateError);
      throw updateError;
    }

    console.log('[ResetPassword] Mot de passe mis à jour avec succès pour:', user.user.email);

    res.json({ 
      message: 'Mot de passe réinitialisé avec succès', 
      password: newPassword,
      email: user.user.email
    });
  } catch (error) {
    console.error('[ResetPassword] Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Ajouter une matière à un professeur
router.post('/teachers/:teacherId/subjects', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { subjectId } = req.body;

    const { data, error } = await supabaseAdmin
      .from('teacher_subjects')
      .insert({
        teacher_id: teacherId,
        subject_id: subjectId
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Récupérer les matières d'un professeur
router.get('/teachers/:teacherId/subjects', async (req, res) => {
  try {
    const { teacherId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('teacher_subjects')
      .select('subject_id, subjects(*)')
      .eq('teacher_id', teacherId);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une matière d'un professeur
router.delete('/teachers/:teacherId/subjects/:subjectId', async (req, res) => {
  try {
    const { teacherId, subjectId } = req.params;

    const { error } = await supabaseAdmin
      .from('teacher_subjects')
      .delete()
      .eq('teacher_id', teacherId)
      .eq('subject_id', subjectId);

    if (error) throw error;
    res.json({ message: 'Matière supprimée du professeur' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter plusieurs professeurs à une classe
router.post('/classes/:classId/teachers', async (req, res) => {
  try {
    const { classId } = req.params;
    const { teacherId } = req.body;

    const { data, error } = await supabaseAdmin
      .from('class_teachers')
      .insert({
        class_id: classId,
        teacher_id: teacherId
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Récupérer les professeurs d'une classe
router.get('/classes/:classId/teachers', async (req, res) => {
  try {
    const { classId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('class_teachers')
      .select('teacher_id, profiles(*)')
      .eq('class_id', classId);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un professeur d'une classe
router.delete('/classes/:classId/teachers/:teacherId', async (req, res) => {
  try {
    const { classId, teacherId } = req.params;

    const { error } = await supabaseAdmin
      .from('class_teachers')
      .delete()
      .eq('class_id', classId)
      .eq('teacher_id', teacherId);

    if (error) throw error;
    res.json({ message: 'Professeur supprimé de la classe' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== EMPLOI DU TEMPS ====================

// Récupérer l'emploi du temps d'une classe
router.get('/classes/:classId/timetable', async (req, res) => {
  try {
    const { classId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('class_timetable')
      .select('*, subject:subjects(id, name, code), teacher:profiles!class_timetable_teacher_id_fkey(id, first_name, last_name)')
      .eq('class_id', classId)
      .order('slot_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur timetable GET:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarder l'emploi du temps d'une classe (bulk upsert — remplace tout)
router.put('/classes/:classId/timetable', async (req, res) => {
  try {
    const { classId } = req.params;
    const { slots } = req.body; // array of { day_of_week, slot_order, start_time, end_time, subject_id, teacher_id, room }
    const schoolId = getSchoolId(req);

    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'slots must be an array' });
    }

    // Delete existing timetable for this class
    const { error: deleteError } = await supabaseAdmin
      .from('class_timetable')
      .delete()
      .eq('class_id', classId);

    if (deleteError) throw deleteError;

    if (slots.length === 0) {
      return res.json([]);
    }

    // Insert new slots
    const rows = slots.map((slot, idx) => ({
      class_id: classId,
      day_of_week: slot.day_of_week,
      slot_order: slot.slot_order ?? idx + 1,
      start_time: slot.start_time,
      end_time: slot.end_time,
      subject_id: slot.subject_id || null,
      teacher_id: slot.teacher_id || null,
      room: slot.room || null,
      school_id: schoolId
    }));

    const { data, error: insertError } = await supabaseAdmin
      .from('class_timetable')
      .insert(rows)
      .select('*, subject:subjects(id, name, code), teacher:profiles!class_timetable_teacher_id_fkey(id, first_name, last_name)');

    if (insertError) throw insertError;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur timetable PUT:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Supprimer un créneau spécifique
router.delete('/classes/:classId/timetable/:slotId', async (req, res) => {
  try {
    const { classId, slotId } = req.params;

    const { error } = await supabaseAdmin
      .from('class_timetable')
      .delete()
      .eq('id', slotId)
      .eq('class_id', classId);

    if (error) throw error;
    res.json({ message: 'Créneau supprimé' });
  } catch (error) {
    console.error('Erreur timetable DELETE:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Importer des élèves via Excel
router.post('/students/import', async (req, res) => {
  try {
    const { students, classId } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    const createdStudents = [];
    const existingStudents = [];
    const errors = [];

    for (const student of students) {
      const { email, password, firstName, lastName, massarCode } = student;
      const [emailLocalPart, emailDomainPart] = String(email || '').split('@');

      // Vérifier si l'élève existe déjà
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, email, first_name, last_name')
        .eq('email', email)
        .eq('role', 'student')
        .single();

      if (existingProfile) {
        console.log(`[Import] Élève existant: ${email}`);
        existingStudents.push({
          ...existingProfile,
          password: '********' // Masquer le mot de passe pour les élèves existants
        });
        continue;
      }

      // Créer l'utilisateur dans Auth (avec retry email suffixé si déjà utilisé)
      let finalEmail = email;
      let authData = null;
      let authError = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const result = await supabaseAdmin.auth.admin.createUser({
          email: finalEmail,
          password,
          email_confirm: true,
          user_metadata: { first_name: firstName, last_name: lastName, role: 'student', massar_code: massarCode || null }
        });

        authData = result.data;
        authError = result.error;

        if (!authError) break;

        const errorMsg = String(authError.message || authError.msg || '').toLowerCase();
        const errorCode = String(authError.code || authError.status || '').toLowerCase();
        const isEmailExists = errorMsg.includes('already') ||
          errorMsg.includes('exists') ||
          errorMsg.includes('duplicate') ||
          errorMsg.includes('registered') ||
          errorCode === 'email_exists' ||
          errorCode === 'user_already_exists' ||
          errorCode === '422';

        if (!isEmailExists) break;

        attempts += 1;
        finalEmail = `${emailLocalPart}_${attempts}@${emailDomainPart}`;
        console.log(`[Import] Email déjà utilisé (${email}), tentative ${attempts} avec ${finalEmail}`);
      }

      if (authError || !authData?.user?.id) {
        console.error(`[Import] Erreur création utilisateur ${email}:`, authError);
        errors.push({ email, reason: authError?.message || 'Erreur création utilisateur Auth' });
        continue;
      }

      // Créer le profil
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: finalEmail,
          first_name: firstName,
          last_name: lastName,
          role: 'student',
          class_id: classId || null,
          school_id: getSchoolId(req),
          massar_code: massarCode || null
        })
        .select()
        .single();

      if (profileError) {
        console.error(`[Import] Erreur création profil ${email}:`, profileError);
        errors.push({ email, reason: profileError.message });
        continue;
      }

      // Ajouter le mot de passe au profil pour l'affichage
      createdStudents.push({
        ...profile,
        password,
        originalEmail: email
      });
    }

    console.log(`[Import] ${createdStudents.length} élèves créés, ${existingStudents.length} élèves existants, ${errors.length} erreurs`);
    res.status(201).json({
      message: `${createdStudents.length} nouveaux élèves importés, ${existingStudents.length} élèves existaient déjà`,
      students: createdStudents,
      existingStudents: existingStudents.length > 0 ? existingStudents : undefined,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        new: createdStudents.length,
        existing: existingStudents.length,
        errors: errors.length,
        total: students.length
      }
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== STATISTIQUES ====================

// Récupérer les statistiques globales
router.get('/stats', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let studentsQ = supabaseAdmin.from('profiles').select('id', { count: 'exact' }).eq('role', 'student');
    let teachersQ = supabaseAdmin.from('profiles').select('id', { count: 'exact' }).eq('role', 'teacher');
    let classesQ = supabaseAdmin.from('classes').select('id', { count: 'exact' });
    let attendanceQ = supabaseAdmin.from('attendance').select('status');
    if (schoolId) {
      studentsQ = studentsQ.eq('school_id', schoolId);
      teachersQ = teachersQ.eq('school_id', schoolId);
      classesQ = classesQ.eq('school_id', schoolId);
      attendanceQ = attendanceQ.eq('school_id', schoolId);
    }
    const [studentsRes, teachersRes, classesRes, attendanceRes] = await Promise.all([
      studentsQ, teachersQ, classesQ, attendanceQ
    ]);

    const totalPresent = attendanceRes.data?.filter(a => a.status === 'present').length || 0;
    const totalRecords = attendanceRes.data?.length || 1;
    const attendanceRate = ((totalPresent / totalRecords) * 100).toFixed(1);

    res.json({
      totalStudents: studentsRes.count || 0,
      totalTeachers: teachersRes.count || 0,
      totalClasses: classesRes.count || 0,
      attendanceRate
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== TABLEAU DE BORD SUIVI DES PROFS ====================

// Suivi de l'activité des professeurs sur une période
// Query: ?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/teachers/tracking-dashboard', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const today = new Date().toISOString().split('T')[0];
    const start = req.query.start || today;
    const end = req.query.end || today;

    // Sécurité : limiter l'amplitude à 1 an
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    if (isNaN(startDate) || isNaN(endDate) || endDate < startDate) {
      return res.status(400).json({ error: 'Période invalide' });
    }
    const MS_DAY = 86400000;
    if ((endDate - startDate) / MS_DAY > 366) {
      return res.status(400).json({ error: 'Période trop large (max 1 an)' });
    }

    const DOW_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
    const durationHours = (s, e) => {
      const a = hhmm(s), b = hhmm(e);
      if (!a || !b) return 0;
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      const mins = (bh * 60 + bm) - (ah * 60 + am);
      return mins > 0 ? mins / 60 : 0;
    };

    // 1. Professeurs de l'école
    let teachersQ = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'teacher');
    teachersQ = applySchoolFilter(teachersQ, req);
    const { data: teachersRaw, error: teachersErr } = await teachersQ;
    if (teachersErr) throw teachersErr;
    let teachers = teachersRaw || [];

    // Filtre de scope (pedagogical_manager) : profs enseignant dans les classes assignées
    const scopedIds = await getScopedClassIds(req);
    let scopedClassSet = null;
    if (scopedIds !== null) {
      scopedClassSet = new Set(scopedIds);
      if (scopedIds.length === 0) {
        return res.json({ period: { start, end }, teachers: [] });
      }
      const { data: ct } = await supabaseAdmin
        .from('class_teachers')
        .select('teacher_id')
        .in('class_id', scopedIds);
      const allowed = new Set((ct || []).map(r => r.teacher_id));
      teachers = teachers.filter(t => allowed.has(t.id));
    }

    if (teachers.length === 0) {
      return res.json({ period: { start, end }, teachers: [] });
    }
    const teacherIds = teachers.map(t => t.id);

    // 2. Classes de l'école (pour libellés)
    let classesQ = supabaseAdmin.from('classes').select('id, name');
    classesQ = applySchoolFilter(classesQ, req);
    const { data: classesRaw } = await classesQ;
    const classMap = {};
    (classesRaw || []).forEach(c => { classMap[c.id] = c.name; });
    const schoolClassIds = new Set((classesRaw || []).map(c => c.id));

    // 3. Créneaux emploi du temps des profs
    const { data: slotsRaw } = await supabaseAdmin
      .from('class_timetable')
      .select('id, class_id, teacher_id, day_of_week, start_time, end_time, subject:subjects(name)')
      .in('teacher_id', teacherIds);
    const slots = (slotsRaw || []).filter(s =>
      schoolClassIds.size === 0 || schoolClassIds.has(s.class_id)
    ).filter(s => !scopedClassSet || scopedClassSet.has(s.class_id));

    // 4. Séances réalisées sur la période
    const { data: sessionsRaw } = await supabaseAdmin
      .from('sessions')
      .select('id, teacher_id, class_id, date, start_time, end_time, type')
      .in('teacher_id', teacherIds)
      .gte('date', start)
      .lte('date', end);
    const sessions = sessionsRaw || [];
    const sessionIds = sessions.map(s => s.id);

    // 5. Séances ayant au moins un suivi élève
    const trackedSessionIds = new Set();
    for (let i = 0; i < sessionIds.length; i += 100) {
      const chunk = sessionIds.slice(i, i + 100);
      if (chunk.length === 0) break;
      const { data } = await supabaseAdmin
        .from('session_tracking')
        .select('session_id')
        .in('session_id', chunk);
      (data || []).forEach(r => trackedSessionIds.add(r.session_id));
    }

    // 6. Devoirs créés sur la période
    const { data: homeworkRaw } = await supabaseAdmin
      .from('homework')
      .select('id, created_by, created_at, class_id')
      .in('created_by', teacherIds)
      .gte('created_at', `${start}T00:00:00`)
      .lte('created_at', `${end}T23:59:59`);
    const homework = homeworkRaw || [];

    // 7. Contrôles planifiés sur la période
    const { data: controlsRaw } = await supabaseAdmin
      .from('controls_plan')
      .select('id, teacher_id, class_id, date, status')
      .in('teacher_id', teacherIds)
      .gte('date', start)
      .lte('date', end);
    const controls = controlsRaw || [];

    // ===== Pré-indexation =====
    // Créneaux par prof groupés par jour de semaine
    const slotsByTeacher = {};
    teacherIds.forEach(id => { slotsByTeacher[id] = []; });
    slots.forEach(s => { (slotsByTeacher[s.teacher_id] ||= []).push(s); });

    // Séances indexées par clé prof|date|HH:MM (réalisation des créneaux)
    const sessionKeySet = new Set();
    sessions.forEach(s => {
      sessionKeySet.add(`${s.teacher_id}|${s.date}|${hhmm(s.start_time)}`);
    });

    // Liste des dates de la période
    const dates = [];
    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + MS_DAY)) {
      dates.push({
        iso: d.toISOString().split('T')[0],
        dow: DOW_NAMES[d.getDay()]
      });
    }

    // ===== Calcul par prof =====
    const result = teachers.map(t => {
      const tSlots = slotsByTeacher[t.id] || [];
      const tSessions = sessions.filter(s => s.teacher_id === t.id);
      const tHomework = homework.filter(h => h.created_by === t.id);
      const tControls = controls.filter(c => c.teacher_id === t.id);

      // Créneaux attendus / réalisés + créneaux manqués
      let expected = 0;
      let realized = 0;
      const missed = [];
      const byClass = {};

      dates.forEach(({ iso, dow }) => {
        tSlots.filter(s => s.day_of_week === dow).forEach(s => {
          expected += 1;
          const key = `${t.id}|${iso}|${hhmm(s.start_time)}`;
          const done = sessionKeySet.has(key);
          if (done) realized += 1;
          else missed.push({
            date: iso,
            day: dow,
            start_time: hhmm(s.start_time),
            end_time: hhmm(s.end_time),
            class_name: classMap[s.class_id] || '—',
            subject: s.subject?.name || '—'
          });
          const cid = s.class_id;
          byClass[cid] ||= { class_id: cid, class_name: classMap[cid] || '—', expected: 0, realized: 0, hours: 0 };
          byClass[cid].expected += 1;
          if (done) byClass[cid].realized += 1;
        });
      });

      // Heures enseignées (toutes les séances de la période)
      let hours = 0;
      tSessions.forEach(s => {
        const h = durationHours(s.start_time, s.end_time);
        hours += h;
        const cid = s.class_id;
        if (byClass[cid]) byClass[cid].hours += h;
      });

      const sessionsWithTracking = tSessions.filter(s => trackedSessionIds.has(s.id)).length;
      const controlsCompleted = tControls.filter(c => c.status === 'completed').length;

      const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

      return {
        id: t.id,
        first_name: t.first_name,
        last_name: t.last_name,
        email: t.email,
        expected_slots: expected,
        realized_slots: realized,
        slots_rate: pct(realized, expected),
        hours_taught: Math.round(hours * 10) / 10,
        sessions_count: tSessions.length,
        sessions_with_tracking: sessionsWithTracking,
        tracking_rate: pct(sessionsWithTracking, tSessions.length),
        homework_count: tHomework.length,
        controls_planned: tControls.length,
        controls_completed: controlsCompleted,
        controls_rate: pct(controlsCompleted, tControls.length),
        by_class: Object.values(byClass).map(c => ({
          ...c,
          hours: Math.round(c.hours * 10) / 10,
          rate: pct(c.realized, c.expected)
        })),
        missed_slots: missed
      };
    });

    res.json({ period: { start, end }, teachers: result });
  } catch (error) {
    console.error('Erreur tracking-dashboard:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== TABLEAU DE BORD COMPORTEMENT ====================

// Récupérer les métriques comportementales du jour
router.get('/behavior/daily', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const nextDate = new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0];

    let trackingQuery = supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(id, date, class_id, tracking_options, school_id)')
      .gte('sessions.date', date)
      .lt('sessions.date', nextDate);
    trackingQuery = applySchoolFilter(trackingQuery, req, 'sessions.school_id');
    const { data: trackingData, error } = await trackingQuery;

    if (error) throw error;
    
    console.log(`[/behavior/daily] Date: ${date}, Records found: ${trackingData?.length || 0}`);

    const stats = {
      totalRecords: 0,
      presence: { present: 0, absent: 0, late: 0, unknown: 0 },
      cahier: { present: 0, absent: 0 },
      cahierDetails: { lessonComplete: 0, docsComplete: 0, readable: 0 },
      vigilance: { vigilant: 0, bavarre: 0 },
      participationLevels: { faible: 0, good: 0, excellent: 0 },
      attitudeLevels: { correct: 0, perturbateur: 0, excellent: 0 },
      evaluation: { count: 0, sum: 0, average: null },
      notes: { count: 0 },
      sleepingIncidents: 0,
      phoneIncidents: 0,
      homeworkIssues: 0
    };

    const isPresentStatus = (status) => ['present', 'late', 'excused'].includes(status);

    trackingData?.forEach(record => {
      const presentOrExcused = isPresentStatus(record.presence);
      const trackingOptions = record.sessions?.tracking_options || {};
      const shouldTrack = (key) => trackingOptions?.[key] !== false;
      stats.totalRecords += 1;

      if (record.presence === 'present') stats.presence.present += 1;
      else if (record.presence === 'absent') stats.presence.absent += 1;
      else if (record.presence === 'late') stats.presence.late += 1;
      else stats.presence.unknown += 1;

      if (presentOrExcused && shouldTrack('cahier_present')) {
        if (record.cahier_present === true) stats.cahier.present += 1;
        else if (record.cahier_present === false) stats.cahier.absent += 1;
      }

      if (presentOrExcused && shouldTrack('cahier')) {
        if (record.cahier_lesson === 'complete') stats.cahierDetails.lessonComplete += 1;
        if (record.cahier_documents === 'correct') stats.cahierDetails.docsComplete += 1;
        if (record.cahier_readability === 'readable') stats.cahierDetails.readable += 1;
      }

      if (presentOrExcused && shouldTrack('discipline')) {
        const disciplineValue = typeof record.discipline === 'string'
          ? record.discipline.trim().toLowerCase()
          : record.discipline;
        if (disciplineValue === 'concentre' || disciplineValue === 'moyen' || disciplineValue === 'vigilant') {
          stats.vigilance.vigilant += 1;
        } else if (disciplineValue === 'distrait' || disciplineValue === 'bavarre') {
          stats.vigilance.bavarre += 1;
        }
      }

      if (presentOrExcused && shouldTrack('participation')) {
        if (record.participation === 'faible') stats.participationLevels.faible += 1;
        else if (record.participation === 'bon' || record.participation === 'good') stats.participationLevels.good += 1;
        else if (record.participation === 'excellent') stats.participationLevels.excellent += 1;
      }

      if (presentOrExcused && shouldTrack('attitude')) {
        if (record.attitude === 'correct') stats.attitudeLevels.correct += 1;
        else if (record.attitude === 'perturbateur') stats.attitudeLevels.perturbateur += 1;
        else if (record.attitude === 'excellent') stats.attitudeLevels.excellent += 1;
      }

      if (presentOrExcused && shouldTrack('sleeping') && record.sleeping === true) stats.sleepingIncidents += 1;
      if (presentOrExcused && shouldTrack('phone_use') && record.phone_use === true) stats.phoneIncidents += 1;
      if (presentOrExcused && shouldTrack('homework') && record.homework === false) stats.homeworkIssues += 1;

      const evalValue =
        typeof record.mini_eval === 'number'
          ? record.mini_eval
          : record.mini_eval
          ? parseFloat(record.mini_eval)
          : NaN;
      if (!Number.isNaN(evalValue)) {
        stats.evaluation.count += 1;
        stats.evaluation.sum += evalValue;
      }

      if (
        (record.comment && record.comment.trim().length > 0) ||
        (record.notes && record.notes.trim().length > 0)
      ) {
        stats.notes.count += 1;
      }
    });

    if (stats.evaluation.count > 0) {
      stats.evaluation.average = Math.round(stats.evaluation.sum / stats.evaluation.count);
    }

    const percent = (value, base = stats.totalRecords) =>
      base > 0 ? Number(((value / base) * 100).toFixed(1)) : 0;

    const overview = {
      presenceRate: percent(stats.presence.present),
      absenceRate: percent(stats.presence.absent),
      lateRate: percent(stats.presence.late),
      cahierPresentRate: percent(stats.cahier.present),
      cahierLessonRate: percent(stats.cahierDetails.lessonComplete),
      cahierDocsRate: percent(stats.cahierDetails.docsComplete),
      cahierReadableRate: percent(stats.cahierDetails.readable),
      vigilanceVigilantRate: percent(stats.vigilance.vigilant),
      vigilanceBavarreRate: percent(stats.vigilance.bavarre),
      participationPositiveRate: percent(stats.participationLevels.good + stats.participationLevels.excellent),
      participationWeakRate: percent(stats.participationLevels.faible),
      attitudeCorrectRate: percent(stats.attitudeLevels.correct),
      attitudePerturbateurRate: percent(stats.attitudeLevels.perturbateur),
      sleepingRate: percent(stats.sleepingIncidents),
      phoneRate: percent(stats.phoneIncidents),
      averageEval: stats.evaluation.average,
      notesCount: stats.notes.count,
      totalRecords: stats.totalRecords
    };

    res.json({
      date,
      totals: stats,
      overview
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les métriques par classe
router.get('/behavior/classes', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const includeEmpty = req.query.includeEmpty === 'true';

    let classesQuery = supabaseAdmin
      .from('classes')
      .select('id, name, level, school_type, filiere, teacher:profiles!classes_teacher_id_fkey(first_name, last_name)');
    classesQuery = applySchoolFilter(classesQuery, req);
    const { data: classes, error: classError } = await classesQuery;

    if (classError) throw classError;

    // Count students per class
    let studentCountsQuery = supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('role', 'student')
      .not('class_id', 'is', null);
    studentCountsQuery = applySchoolFilter(studentCountsQuery, req);
    const { data: studentCounts } = await studentCountsQuery;

    const studentsPerClass = {};
    studentCounts?.forEach(s => {
      studentsPerClass[s.class_id] = (studentsPerClass[s.class_id] || 0) + 1;
    });

    const classMetrics = await Promise.all(
      classes.map(async (cls) => {
        const { data: trackingData } = await supabaseAdmin
          .from('session_tracking')
          .select('*, sessions!inner(id, date, class_id, tracking_options)')
          .eq('sessions.class_id', cls.id)
          .gte('sessions.date', date)
          .lt('sessions.date', new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0]);

        const totalRecords = trackingData?.length || 0;
        const isPresentStatus = (status) => ['present', 'late', 'excused'].includes(status);
        const safeDiv = (value, base) => (base > 0 ? Number(((value / base) * 100).toFixed(1)) : 0);

        // Count unique sessions
        const sessionIds = new Set(trackingData?.map(r => r.session_id).filter(Boolean));
        const sessionCount = sessionIds.size;

        // Group tracking records by student_id to deduplicate across sessions
        const studentRecordsMap = {};
        trackingData?.forEach(record => {
          const sid = record.student_id;
          if (!sid) return;
          if (!studentRecordsMap[sid]) studentRecordsMap[sid] = [];
          studentRecordsMap[sid].push(record);
        });

        const uniqueStudentIds = Object.keys(studentRecordsMap);
        const uniqueStudentCount = uniqueStudentIds.length;

        // Aggregate per unique student: pick best/representative value across sessions
        const presence = { present: 0, absent: 0, late: 0 };
        const discipline = { correct: 0, moyen: 0, perturbateur: 0 };
        const phone = { nonUtilise: 0, avertissement: 0, abusif: 0 };
        const participation = { faible: 0, good: 0, excellent: 0 };
        const attitude = { correct: 0, perturbateur: 0, excellent: 0 };
        let cahierPresent = 0, cahierAbsent = 0;
        let sleepingCount = 0;
        let homeworkDone = 0, homeworkMissing = 0;
        let evalCount = 0, evalSum = 0;
        let disciplineTracked = 0, phoneTracked = 0, participationTracked = 0;
        let attitudeTracked = 0, cahierTracked = 0, sleepingTracked = 0, homeworkTracked = 0;

        uniqueStudentIds.forEach(sid => {
          const records = studentRecordsMap[sid];

          // Presence: student is "present" for the day if present in ANY session
          const presenceValues = records.map(r => r.presence);
          const wasPresent = presenceValues.some(p => p === 'present');
          const wasLate = presenceValues.some(p => p === 'late');
          const wasExcused = presenceValues.some(p => p === 'excused');
          const allAbsent = presenceValues.every(p => p === 'absent');

          if (wasPresent) presence.present += 1;
          else if (wasLate) { presence.late += 1; }
          else if (allAbsent) presence.absent += 1;
          else if (wasExcused) presence.present += 1;

          const studentPresent = wasPresent || wasLate || wasExcused;
          if (!studentPresent) return;

          // For behavior metrics, aggregate across sessions (worst case / any occurrence)
          records.forEach(record => {
            const trackingOptions = record.sessions?.tracking_options || {};
            const shouldTrack = (key) => trackingOptions?.[key] !== false;
            const presentInSession = isPresentStatus(record.presence);
            if (!presentInSession) return;

            if (shouldTrack('discipline')) {
              const dv = typeof record.discipline === 'string' ? record.discipline.trim().toLowerCase() : record.discipline;
              if (dv === 'concentre' || dv === 'vigilant') discipline.correct += 1;
              else if (dv === 'moyen' || dv === 'bavarre') discipline.moyen += 1;
              else if (dv === 'distrait') discipline.perturbateur += 1;
              disciplineTracked += 1;
            }

            if (shouldTrack('phone_use')) {
              if (record.phone_use === true) phone.abusif += 1;
              else if (record.phone_use === false) phone.nonUtilise += 1;
              phoneTracked += 1;
            }

            if (shouldTrack('participation')) {
              if (record.participation === 'faible') participation.faible += 1;
              else if (record.participation === 'bon' || record.participation === 'good') participation.good += 1;
              else if (record.participation === 'excellent') participation.excellent += 1;
              participationTracked += 1;
            }

            if (shouldTrack('attitude')) {
              if (record.attitude === 'correct') attitude.correct += 1;
              else if (record.attitude === 'perturbateur') attitude.perturbateur += 1;
              else if (record.attitude === 'excellent') attitude.excellent += 1;
              attitudeTracked += 1;
            }

            if (shouldTrack('cahier_present')) {
              if (record.cahier_present === true) cahierPresent += 1;
              else if (record.cahier_present === false) cahierAbsent += 1;
              cahierTracked += 1;
            }

            if (shouldTrack('sleeping')) {
              if (record.sleeping === true) sleepingCount += 1;
              sleepingTracked += 1;
            }

            if (shouldTrack('homework')) {
              if (record.homework === 'done' || record.homework === true) homeworkDone += 1;
              else if (record.homework === false || record.homework === 'missing') homeworkMissing += 1;
              homeworkTracked += 1;
            }

            const evalValue = typeof record.mini_eval === 'number' ? record.mini_eval : parseFloat(record.mini_eval);
            if (!isNaN(evalValue)) { evalCount += 1; evalSum += evalValue; }
          });
        });

        const totalDiscipline = discipline.correct + discipline.moyen + discipline.perturbateur;
        const totalPhone = phone.nonUtilise + phone.avertissement + phone.abusif;
        const totalParticipation = participation.faible + participation.good + participation.excellent;
        const totalCahier = cahierPresent + cahierAbsent;
        const totalAttitude = attitude.correct + attitude.perturbateur + attitude.excellent;

        const teacherName = cls.teacher ? `${cls.teacher.first_name} ${cls.teacher.last_name}` : null;

        return {
          classId: cls.id,
          className: cls.name,
          level: cls.level,
          school_type: cls.school_type || null,
          filiere: cls.filiere || null,
          teacher: teacherName,
          studentCount: studentsPerClass[cls.id] || 0,
          recordCount: totalRecords,
          sessionCount,
          uniqueStudentCount,
          presence: {
            present: safeDiv(presence.present, uniqueStudentCount),
            absent: safeDiv(presence.absent, uniqueStudentCount),
            late: safeDiv(presence.late, uniqueStudentCount),
            presentCount: presence.present,
            absentCount: presence.absent,
            lateCount: presence.late
          },
          discipline: {
            correct: safeDiv(discipline.correct, totalDiscipline),
            moyen: safeDiv(discipline.moyen, totalDiscipline),
            perturbateur: safeDiv(discipline.perturbateur, totalDiscipline),
            dominant: totalDiscipline === 0 ? 'correct' : discipline.perturbateur >= Math.max(discipline.correct, discipline.moyen) ? 'perturbateur' : discipline.moyen >= discipline.correct ? 'moyen' : 'correct'
          },
          phone: {
            nonUtilise: safeDiv(phone.nonUtilise, totalPhone),
            avertissement: safeDiv(phone.avertissement, totalPhone),
            abusif: safeDiv(phone.abusif, totalPhone),
            dominant: totalPhone === 0 ? 'nonUtilise' : phone.abusif >= phone.nonUtilise ? 'abusif' : 'nonUtilise'
          },
          participation: {
            positive: safeDiv(participation.good + participation.excellent, totalParticipation),
            faible: safeDiv(participation.faible, totalParticipation),
            dominant: totalParticipation === 0 ? 'good' : participation.faible >= (participation.good + participation.excellent) ? 'faible' : 'good'
          },
          attitude: {
            correct: safeDiv(attitude.correct + attitude.excellent, totalAttitude),
            perturbateur: safeDiv(attitude.perturbateur, totalAttitude)
          },
          cahier: {
            present: safeDiv(cahierPresent, totalCahier),
            absent: safeDiv(cahierAbsent, totalCahier)
          },
          sleeping: {
            rate: safeDiv(sleepingCount, sleepingTracked),
            count: sleepingCount
          },
          homework: {
            doneRate: safeDiv(homeworkDone, homeworkDone + homeworkMissing),
            missingCount: homeworkMissing
          },
          evaluation: {
            average: evalCount > 0 ? Math.round(evalSum / evalCount) : null,
            count: evalCount
          }
        };
      })
    );

    const filteredMetrics = includeEmpty
      ? classMetrics
      : classMetrics.filter(metric => (metric.recordCount || 0) > 0);

    res.json(filteredMetrics);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les tendances (7 ou 30 jours)
router.get('/behavior/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    let trendsQuery = supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(id, date, school_id)')
      .gte('sessions.date', startDate.toISOString().split('T')[0])
      .lte('sessions.date', endDate.toISOString().split('T')[0]);
    trendsQuery = applySchoolFilter(trendsQuery, req, 'sessions.school_id');
    const { data: trackingData, error } = await trendsQuery;

    if (error) throw error;

    const trends = {};

    const normalizeDate = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return value.split('T')[0];
      return new Date(value).toISOString().split('T')[0];
    };

    const addTrendBucket = (date) => {
      if (!trends[date]) {
        trends[date] = {
          count: 0,
          presence: { present: 0, absent: 0, late: 0 },
          cahier: { present: 0 },
          participation: { faible: 0, good: 0, excellent: 0 },
          vigilance: { vigilant: 0, bavarre: 0 },
          sleeping: 0,
          phone: 0,
          evaluation: { count: 0, sum: 0 }
        };
      }
      return trends[date];
    };

    trackingData?.forEach(record => {
      const date = normalizeDate(record.sessions?.date);
      if (!date) return;

      const bucket = addTrendBucket(date);
      bucket.count += 1;

      if (record.presence === 'present') bucket.presence.present += 1;
      else if (record.presence === 'absent') bucket.presence.absent += 1;
      else if (record.presence === 'late') bucket.presence.late += 1;

      if (record.cahier_present === true) bucket.cahier.present += 1;

      if (record.participation === 'faible') bucket.participation.faible += 1;
      else if (record.participation === 'good') bucket.participation.good += 1;
      else if (record.participation === 'excellent') bucket.participation.excellent += 1;

      if (record.discipline === 'bavarre') bucket.vigilance.bavarre += 1;
      else if (record.discipline === 'vigilant') bucket.vigilance.vigilant += 1;

      if (record.sleeping === true) bucket.sleeping += 1;
      if (record.phone_use === true) bucket.phone += 1;

      const evalValue =
        typeof record.mini_eval === 'number'
          ? record.mini_eval
          : record.mini_eval
          ? parseFloat(record.mini_eval)
          : NaN;
      if (!Number.isNaN(evalValue)) {
        bucket.evaluation.count += 1;
        bucket.evaluation.sum += evalValue;
      }
    });

    const percent = (value, total) => (total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0);

    const trendArray = Object.entries(trends)
      .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
      .map(([date, data]) => {
        const total = data.count || 0;
        const evalAvg =
          data.evaluation.count > 0
            ? Number((data.evaluation.sum / data.evaluation.count).toFixed(1))
            : null;

        return {
          date,
          presenceRate: percent(data.presence.present, total),
          absenceRate: percent(data.presence.absent, total),
          cahierRate: percent(data.cahier.present, total),
          participationPositiveRate: percent(data.participation.good + data.participation.excellent, total),
          participationWeakRate: percent(data.participation.faible, total),
          vigilanceIncidentRate: percent(data.vigilance.bavarre, total),
          sleepingRate: percent(data.sleeping, total),
          phoneRate: percent(data.phone, total),
          evaluationAverage: evalAvg
        };
      });

    res.json(trendArray);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les alertes du jour
router.get('/behavior/alerts', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const alerts = [];

    let alertsQuery = supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(id, date, class_id, school_id, classes(name))')
      .eq('sessions.date', date);
    alertsQuery = applySchoolFilter(alertsQuery, req, 'sessions.school_id');
    const { data: trackingData } = await alertsQuery;

    const classStats = {};
    trackingData?.forEach(record => {
      const classId = record.sessions?.class_id;
      if (!classStats[classId]) {
        classStats[classId] = {
          className: record.sessions?.classes?.name,
          phone: 0,
          sleeping: 0,
          total: 0
        };
      }
      classStats[classId].total++;
      if (record.phone_use === true) classStats[classId].phone++;
      if (record.sleeping === true) classStats[classId].sleeping++;
    });

    Object.entries(classStats).forEach(([classId, stats]) => {
      const phonePercent = (stats.phone / stats.total) * 100;
      const sleepingPercent = (stats.sleeping / stats.total) * 100;

      if (phonePercent > 30) {
        alerts.push({
          id: `phone-${classId}`,
          title: `Usage abusif du téléphone - ${stats.className}`,
          level: 'attention',
          description: `${phonePercent.toFixed(0)}% des élèves ont utilisé le téléphone`,
          classId
        });
      }

      if (sleepingPercent > 20) {
        alerts.push({
          id: `sleep-${classId}`,
          title: `Dormance élevée - ${stats.className}`,
          level: 'attention',
          description: `${sleepingPercent.toFixed(0)}% des élèves dormaient`,
          classId
        });
      }
    });

    res.json(alerts);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détails d'une classe pour corrélation avec le suivi prof
router.get('/behavior/classes/:classId/details', async (req, res) => {
  try {
    const { classId } = req.params;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const { data: sessionsData, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('id, start_time, end_time, tracking_options, topic, teacher_id, subject_id, teacher:profiles!sessions_teacher_id_fkey(first_name, last_name), subject:subjects(name)')
      .eq('class_id', classId)
      .eq('date', date)
      .order('start_time', { ascending: true });

    if (sessionsError) throw sessionsError;

    // For sessions without subject_id, try to resolve via teacher_subjects
    const teacherIdsWithoutSubject = [...new Set(
      sessionsData.filter(s => !s.subject_id && s.teacher_id).map(s => s.teacher_id)
    )];
    let teacherSubjectsMap = {};
    if (teacherIdsWithoutSubject.length > 0) {
      const { data: tsData } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id, subject:subjects(name)')
        .in('teacher_id', teacherIdsWithoutSubject);
      if (tsData) {
        tsData.forEach(ts => {
          if (!teacherSubjectsMap[ts.teacher_id]) teacherSubjectsMap[ts.teacher_id] = [];
          if (ts.subject?.name) teacherSubjectsMap[ts.teacher_id].push(ts.subject.name);
        });
      }
    }

    const sessionIds = sessionsData.map(session => session.id);

    let trackingData = [];
    if (sessionIds.length > 0) {
      const { data, error: trackingError } = await supabaseAdmin
        .from('session_tracking')
        .select(`
          session_id,
          student_id,
          presence,
          sleeping,
          phone_use,
          homework,
          participation,
          discipline,
          cahier_present,
          cahier_lesson,
          cahier_documents,
          cahier_readability,
          mini_eval,
          attitude,
          comment,
          notes,
          created_at
        `)
        .in('session_id', sessionIds);

      if (trackingError) throw trackingError;
      trackingData = data;
    }

    let studentMap = {};
    const studentIds = [...new Set(trackingData.map(record => record.student_id).filter(Boolean))];

    if (studentIds.length > 0) {
      const { data: studentsData, error: studentsError } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', studentIds)
        .eq('role', 'student');

      if (studentsError) throw studentsError;
      studentMap = studentsData.reduce((acc, student) => {
        acc[student.id] = student;
        return acc;
      }, {});
    }

    const sessionOptionsMap = sessionsData.reduce((acc, session) => {
      acc[session.id] = session.tracking_options || {};
      return acc;
    }, {});

    const shouldTrack = (options, key) => options?.[key] !== false;

    const sessions = sessionsData.map(session => {
      const sessionRecords = trackingData.filter(record => record.session_id === session.id);
      const sessionOptions = sessionOptionsMap[session.id] || {};

      const summary = sessionRecords.reduce(
        (acc, record) => {
          acc.totalRecords += 1;

          const student = record.student_id ? studentMap[record.student_id] : null;
          const studentName = student
            ? `${student.first_name || ''} ${student.last_name || ''}`.trim()
            : 'Élève';

          acc.studentRows.push({
            studentId: record.student_id || null,
            studentName: studentName || 'Élève',
            presence: record.presence || 'unknown',
            cahier_present: record.cahier_present,
            cahier_lesson: record.cahier_lesson,
            cahier_documents: record.cahier_documents,
            cahier_readability: record.cahier_readability,
            vigilance: record.discipline,
            participation: record.participation,
            mini_eval: record.mini_eval,
            attitude: record.attitude,
            sleeping: record.sleeping,
            phone_use: record.phone_use,
            notes: record.notes || record.comment || '',
            comment: record.comment || ''
          });

          const presentOrExcused = ['present', 'late', 'excused'].includes(record.presence);

          if (shouldTrack(sessionOptions, 'presence')) {
            acc.metricTotals.presence += 1;
            if (record.presence === 'present') acc.presence.present += 1;
            else if (record.presence === 'absent') acc.presence.absent += 1;
            else if (record.presence === 'late') acc.presence.late += 1;
            else acc.presence.unknown += 1;
          }

          if (presentOrExcused && shouldTrack(sessionOptions, 'cahier_present')) {
            acc.metricTotals.cahierPresent += 1;
            if (record.cahier_present === true) acc.cahier.present += 1;
            else if (record.cahier_present === false) acc.cahier.absent += 1;
          }

          if (presentOrExcused && shouldTrack(sessionOptions, 'cahier')) {
            if (record.cahier_lesson === 'complete') acc.cahierDetails.lessonComplete += 1;
            if (record.cahier_documents === 'correct') acc.cahierDetails.docsComplete += 1;
            if (record.cahier_readability === 'readable') acc.cahierDetails.readable += 1;
          }

          if (presentOrExcused && shouldTrack(sessionOptions, 'sleeping')) {
            acc.metricTotals.sleeping += 1;
            if (record.sleeping === true) acc.sleepingIncidents += 1;
          }
          if (presentOrExcused && shouldTrack(sessionOptions, 'phone_use')) {
            acc.metricTotals.phone += 1;
            if (record.phone_use === true) acc.phoneIncidents += 1;
          }
          if (presentOrExcused && shouldTrack(sessionOptions, 'homework') && record.homework === false) {
            acc.homeworkIssues += 1;
          }

          if (presentOrExcused && shouldTrack(sessionOptions, 'participation')) {
            acc.metricTotals.participation += 1;
            if (record.participation === 'faible') acc.participationLevels.faible += 1;
            if (record.participation === 'bon' || record.participation === 'good' || record.participation === 'excellent') {
              acc.participationIncidents += 1;
            }
            if (record.participation === 'bon' || record.participation === 'good') acc.participationLevels.good += 1;
            if (record.participation === 'excellent') acc.participationLevels.excellent += 1;
          }

          if (presentOrExcused && shouldTrack(sessionOptions, 'discipline')) {
            acc.metricTotals.vigilance += 1;
            const disciplineValue = typeof record.discipline === 'string'
              ? record.discipline.trim().toLowerCase()
              : record.discipline;
            if (disciplineValue === 'concentre' || disciplineValue === 'moyen' || disciplineValue === 'vigilant') {
              acc.vigilance.vigilant += 1;
            }
            if (disciplineValue === 'distrait' || disciplineValue === 'bavarre') {
              acc.vigilance.bavarre += 1;
              acc.disciplineIssues += 1;
            }
          }

          if (presentOrExcused && shouldTrack(sessionOptions, 'cahier_present') && record.cahier_present === false) acc.cahierIncidents += 1;
          if (presentOrExcused && shouldTrack(sessionOptions, 'attitude')) {
            acc.metricTotals.attitude += 1;
            if (record.attitude === false) acc.attitudeIssues += 1;
            if (record.attitude === 'correct') acc.attitudeLevels.correct += 1;
            if (record.attitude === 'perturbateur' || record.attitude === 'bavarre') {
              acc.attitudeLevels.perturbateur += 1;
              acc.attitudeIssues += 1;
            }
            if (record.attitude === 'excellent') acc.attitudeLevels.excellent += 1;
          }

          const evalValue =
            typeof record.mini_eval === 'number'
              ? record.mini_eval
              : record.mini_eval
              ? parseFloat(record.mini_eval)
              : NaN;
          if (!Number.isNaN(evalValue)) {
            acc.evaluation.count += 1;
            acc.evaluation.sum += evalValue;
          }

          if (
            (record.comment && record.comment.trim().length > 0) ||
            (record.notes && record.notes.trim().length > 0)
          ) {
            acc.notes.count += 1;
          }

          if (!acc.lastUpdate || new Date(record.created_at) > new Date(acc.lastUpdate)) {
            acc.lastUpdate = record.created_at;
          }

          return acc;
        },
        {
          totalRecords: 0,
          presence: { present: 0, absent: 0, late: 0, unknown: 0 },
          cahier: { present: 0, absent: 0 },
          cahierDetails: { lessonComplete: 0, docsComplete: 0, readable: 0 },
          vigilance: { vigilant: 0, bavarre: 0 },
          participationLevels: { faible: 0, good: 0, excellent: 0 },
          attitudeLevels: { correct: 0, perturbateur: 0, excellent: 0 },
          evaluation: { count: 0, sum: 0, average: 0 },
          notes: { count: 0 },
          sleepingIncidents: 0,
          phoneIncidents: 0,
          homeworkIssues: 0,
          participationIncidents: 0,
          disciplineIssues: 0,
          cahierIncidents: 0,
          attitudeIssues: 0,
          lastUpdate: null,
          metricTotals: {
            presence: 0,
            cahierPresent: 0,
            vigilance: 0,
            participation: 0,
            attitude: 0,
            sleeping: 0,
            phone: 0
          },
          studentRows: []
        }
      );

      if (summary.evaluation.count > 0) {
        summary.evaluation.average = Math.round(summary.evaluation.sum / summary.evaluation.count);
      }

      // Resolve subject name: direct join > teacher_subjects fallback
      let subjectName = session.subject?.name || null;
      if (!subjectName && session.teacher_id && teacherSubjectsMap[session.teacher_id]?.length > 0) {
        subjectName = teacherSubjectsMap[session.teacher_id].join(', ');
      }

      return {
        sessionId: session.id,
        startTime: session.start_time,
        endTime: session.end_time,
        topic: session.topic || null,
        teacher: session.teacher
          ? `${session.teacher.first_name} ${session.teacher.last_name}`
          : 'Non assigné',
        subject: subjectName,
        studentCount: summary.totalRecords,
        summary
      };
    });

    res.json({
      classId,
      date,
      sessions
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SANTÉ DES CLASSES ====================

// Endpoint pour les scores de santé des classes et recommandations stratégiques
router.get('/behavior/class-health', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const date = req.query.date;
    const endDate = date ? new Date(date) : new Date();
    const startDate = date ? new Date(date) : new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Récupérer toutes les classes
    let classHealthClassesQ = supabaseAdmin
      .from('classes')
      .select('id, name, level, school_type, filiere, teacher:profiles!classes_teacher_id_fkey(first_name, last_name)');
    classHealthClassesQ = applySchoolFilter(classHealthClassesQ, req);
    const { data: classes, error: classError } = await classHealthClassesQ;

    if (classError) throw classError;

    // Récupérer tous les trackings de la période
    let trackingQuery = supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(id, date, class_id, teacher_id, school_id)');
    trackingQuery = applySchoolFilter(trackingQuery, req, 'sessions.school_id');

    if (date) {
      trackingQuery = trackingQuery.eq('sessions.date', date);
    } else {
      trackingQuery = trackingQuery
        .gte('sessions.date', startDate.toISOString().split('T')[0])
        .lte('sessions.date', endDate.toISOString().split('T')[0]);
    }

    const { data: trackingData, error: trackingError } = await trackingQuery;

    if (trackingError) throw trackingError;

    // Calculer les métriques par classe
    const classHealthData = classes.map(cls => {
      const classRecords = trackingData?.filter(t => t.sessions?.class_id === cls.id) || [];
      const total = classRecords.length;

      if (total === 0) {
        return {
          classId: cls.id,
          className: cls.name,
          level: cls.level,
          school_type: cls.school_type || null,
          filiere: cls.filiere || null,
          teacher: cls.teacher ? `${cls.teacher.first_name} ${cls.teacher.last_name}` : 'Non assigné',
          totalRecords: 0,
          healthScore: null,
          healthStatus: 'gray',
          metrics: null,
          recommendations: ['Aucune donnée de suivi disponible pour cette classe'],
          trends: null
        };
      }

      // Calcul des métriques
      const metrics = {
        presence: {
          present: classRecords.filter(r => r.presence === 'present').length,
          absent: classRecords.filter(r => r.presence === 'absent').length,
          late: classRecords.filter(r => r.presence === 'late').length
        },
        behavior: {
          sleeping: classRecords.filter(r => r.sleeping === true).length,
          phoneUse: classRecords.filter(r => r.phone_use === true).length,
          perturbateur: classRecords.filter(r => r.attitude === 'perturbateur').length,
          bavarre: classRecords.filter(r => r.discipline === 'bavarre').length
        },
        engagement: {
          participationGood: classRecords.filter(r => r.participation === 'good' || r.participation === 'excellent').length,
          participationFaible: classRecords.filter(r => r.participation === 'faible').length,
          attitudeCorrect: classRecords.filter(r => r.attitude === 'correct' || r.attitude === 'excellent').length
        },
        materials: {
          cahierPresent: classRecords.filter(r => r.cahier_present === true).length,
          cahierAbsent: classRecords.filter(r => r.cahier_present === false).length,
          homeworkDone: classRecords.filter(r => r.homework === 'done' || r.homework === true).length,
          homeworkMissing: classRecords.filter(r => r.homework === false || r.homework === 'missing').length
        },
        evaluation: {
          count: 0,
          sum: 0,
          average: null
        }
      };

      // Calculer la moyenne des évaluations
      classRecords.forEach(r => {
        const evalValue = typeof r.mini_eval === 'number' ? r.mini_eval : parseFloat(r.mini_eval);
        if (!isNaN(evalValue)) {
          metrics.evaluation.count++;
          metrics.evaluation.sum += evalValue;
        }
      });
      if (metrics.evaluation.count > 0) {
        metrics.evaluation.average = Math.round(metrics.evaluation.sum / metrics.evaluation.count);
      }

      // Calculer les taux
      const rates = {
        presenceRate: Math.round((metrics.presence.present / total) * 100),
        absenceRate: Math.round((metrics.presence.absent / total) * 100),
        sleepingRate: Math.round((metrics.behavior.sleeping / total) * 100),
        phoneRate: Math.round((metrics.behavior.phoneUse / total) * 100),
        perturbateurRate: Math.round((metrics.behavior.perturbateur / total) * 100),
        bavarreRate: Math.round((metrics.behavior.bavarre / total) * 100),
        participationPositiveRate: Math.round((metrics.engagement.participationGood / total) * 100),
        participationFaibleRate: Math.round((metrics.engagement.participationFaible / total) * 100),
        cahierRate: Math.round((metrics.materials.cahierPresent / total) * 100),
        homeworkRate: metrics.materials.homeworkDone + metrics.materials.homeworkMissing > 0 
          ? Math.round((metrics.materials.homeworkDone / (metrics.materials.homeworkDone + metrics.materials.homeworkMissing)) * 100)
          : null
      };

      // Calculer le score de santé global (0-100)
      // Pondération: Présence 25%, Comportement 30%, Engagement 25%, Matériel 20%
      const presenceScore = rates.presenceRate;
      const behaviorScore = 100 - Math.min(100, (rates.sleepingRate * 2 + rates.phoneRate * 2 + rates.perturbateurRate * 3 + rates.bavarreRate));
      const engagementScore = rates.participationPositiveRate + (100 - rates.participationFaibleRate * 2) / 2;
      const materialsScore = rates.cahierRate;

      const healthScore = Math.round(
        presenceScore * 0.25 +
        behaviorScore * 0.30 +
        engagementScore * 0.25 +
        materialsScore * 0.20
      );

      // Déterminer le statut
      let healthStatus = 'green';
      if (healthScore < 50) healthStatus = 'red';
      else if (healthScore < 70) healthStatus = 'orange';

      // Générer les recommandations stratégiques
      const recommendations = [];

      if (rates.presenceRate < 80) {
        recommendations.push({
          type: 'presence',
          priority: 'high',
          title: 'Améliorer la présence',
          description: `Taux de présence à ${rates.presenceRate}%. Identifier les causes d'absentéisme et contacter les familles.`,
          action: 'Organiser des entretiens individuels avec les élèves fréquemment absents'
        });
      }

      if (rates.sleepingRate > 10) {
        recommendations.push({
          type: 'engagement',
          priority: rates.sleepingRate > 20 ? 'high' : 'medium',
          title: 'Problème de vigilance',
          description: `${rates.sleepingRate}% des élèves s'endorment en classe. Vérifier les horaires et le rythme des cours.`,
          action: 'Varier les activités pédagogiques et intégrer des pauses actives'
        });
      }

      if (rates.phoneRate > 15) {
        recommendations.push({
          type: 'discipline',
          priority: rates.phoneRate > 30 ? 'high' : 'medium',
          title: 'Usage excessif du téléphone',
          description: `${rates.phoneRate}% d'usage abusif détecté. Renforcer les règles de classe.`,
          action: 'Mettre en place un système de collecte des téléphones en début de cours'
        });
      }

      if (rates.participationFaibleRate > 30) {
        recommendations.push({
          type: 'pedagogy',
          priority: 'medium',
          title: 'Participation insuffisante',
          description: `${rates.participationFaibleRate}% de participation faible. Diversifier les méthodes d'enseignement.`,
          action: 'Introduire des activités de groupe et des exercices interactifs'
        });
      }

      if (rates.cahierRate < 70) {
        recommendations.push({
          type: 'organization',
          priority: 'medium',
          title: 'Problème de matériel',
          description: `Seulement ${rates.cahierRate}% des élèves ont leur cahier. Rappeler l'importance du matériel.`,
          action: 'Envoyer un rappel aux familles concernant le matériel scolaire'
        });
      }

      if (rates.perturbateurRate > 10) {
        recommendations.push({
          type: 'behavior',
          priority: 'high',
          title: 'Comportements perturbateurs',
          description: `${rates.perturbateurRate}% d'élèves perturbateurs. Action disciplinaire nécessaire.`,
          action: 'Convoquer les élèves concernés et contacter les parents'
        });
      }

      if (metrics.evaluation.average !== null && metrics.evaluation.average < 50) {
        recommendations.push({
          type: 'academic',
          priority: 'high',
          title: 'Niveau académique faible',
          description: `Moyenne des mini-évaluations: ${metrics.evaluation.average}/100. Renforcement nécessaire.`,
          action: 'Mettre en place des séances de soutien et revoir les notions non acquises'
        });
      }

      // Trier par priorité
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      return {
        classId: cls.id,
        className: cls.name,
        level: cls.level,
        school_type: cls.school_type || null,
        filiere: cls.filiere || null,
        teacher: cls.teacher ? `${cls.teacher.first_name} ${cls.teacher.last_name}` : 'Non assigné',
        totalRecords: total,
        healthScore,
        healthStatus,
        metrics: rates,
        detailedMetrics: metrics,
        recommendations: recommendations.slice(0, 3), // Top 3 recommandations
        allRecommendations: recommendations
      };
    });

    // Trier par score de santé (les plus problématiques en premier)
    classHealthData.sort((a, b) => {
      if (a.healthScore === null) return 1;
      if (b.healthScore === null) return -1;
      return a.healthScore - b.healthScore;
    });

    // Générer des recommandations globales
    const globalRecommendations = [];
    const avgHealthScore = classHealthData
      .filter(c => c.healthScore !== null)
      .reduce((sum, c) => sum + c.healthScore, 0) / classHealthData.filter(c => c.healthScore !== null).length || 0;

    const problemClasses = classHealthData.filter(c => c.healthStatus === 'red');
    const warningClasses = classHealthData.filter(c => c.healthStatus === 'orange');

    if (problemClasses.length > 0) {
      globalRecommendations.push({
        type: 'urgent',
        title: `${problemClasses.length} classe(s) en situation critique`,
        description: `Les classes ${problemClasses.map(c => c.className).join(', ')} nécessitent une attention immédiate.`,
        action: 'Organiser une réunion d\'urgence avec les enseignants concernés'
      });
    }

    if (warningClasses.length > 2) {
      globalRecommendations.push({
        type: 'warning',
        title: 'Tendance générale préoccupante',
        description: `${warningClasses.length} classes en zone d'alerte. Revoir la stratégie pédagogique globale.`,
        action: 'Planifier une réunion pédagogique pour harmoniser les pratiques'
      });
    }

    // Identifier les problèmes récurrents
    const allRecs = classHealthData.flatMap(c => c.allRecommendations || []);
    const recTypes = {};
    allRecs.forEach(r => {
      recTypes[r.type] = (recTypes[r.type] || 0) + 1;
    });

    const mostCommonIssue = Object.entries(recTypes).sort((a, b) => b[1] - a[1])[0];
    if (mostCommonIssue && mostCommonIssue[1] >= 3) {
      const issueLabels = {
        presence: 'absentéisme',
        engagement: 'manque d\'engagement',
        discipline: 'problèmes de discipline',
        pedagogy: 'participation faible',
        organization: 'problèmes de matériel',
        behavior: 'comportements perturbateurs',
        academic: 'difficultés académiques'
      };
      globalRecommendations.push({
        type: 'pattern',
        title: `Problème récurrent: ${issueLabels[mostCommonIssue[0]] || mostCommonIssue[0]}`,
        description: `Ce problème affecte ${mostCommonIssue[1]} classes. Une action coordonnée est recommandée.`,
        action: 'Développer un plan d\'action global pour ce problème'
      });
    }

    res.json({
      period: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0], days },
      summary: {
        totalClasses: classes.length,
        classesWithData: classHealthData.filter(c => c.healthScore !== null).length,
        averageHealthScore: Math.round(avgHealthScore),
        healthDistribution: {
          green: classHealthData.filter(c => c.healthStatus === 'green').length,
          orange: classHealthData.filter(c => c.healthStatus === 'orange').length,
          red: classHealthData.filter(c => c.healthStatus === 'red').length,
          gray: classHealthData.filter(c => c.healthStatus === 'gray').length
        }
      },
      globalRecommendations,
      classes: classHealthData
    });
  } catch (error) {
    console.error('Erreur class-health:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Endpoint pour les élèves problématiques
router.get('/behavior/problem-students', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    let problemQuery = supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(id, date, class_id, school_id, classes(name))')
      .gte('sessions.date', startDate.toISOString().split('T')[0])
      .lte('sessions.date', endDate.toISOString().split('T')[0]);
    problemQuery = applySchoolFilter(problemQuery, req, 'sessions.school_id');
    const { data: trackingData, error } = await problemQuery;

    if (error) throw error;

    // Agréger par élève
    const studentStats = {};
    trackingData?.forEach(record => {
      const studentId = record.student_id;
      if (!studentId) return;

      if (!studentStats[studentId]) {
        studentStats[studentId] = {
          studentId,
          className: record.sessions?.classes?.name || 'N/A',
          classId: record.sessions?.class_id,
          totalSessions: 0,
          absences: 0,
          lates: 0,
          sleepingIncidents: 0,
          phoneIncidents: 0,
          perturbateurIncidents: 0,
          bavarreIncidents: 0,
          homeworkMissing: 0,
          cahierMissing: 0,
          participationFaible: 0,
          evaluations: []
        };
      }

      const stats = studentStats[studentId];
      stats.totalSessions++;

      if (record.presence === 'absent') stats.absences++;
      if (record.presence === 'late') stats.lates++;
      if (record.sleeping === true) stats.sleepingIncidents++;
      if (record.phone_use === true) stats.phoneIncidents++;
      if (record.attitude === 'perturbateur') stats.perturbateurIncidents++;
      if (record.discipline === 'bavarre') stats.bavarreIncidents++;
      if (record.homework === false) stats.homeworkMissing++;
      if (record.cahier_present === false) stats.cahierMissing++;
      if (record.participation === 'faible') stats.participationFaible++;

      const evalValue = typeof record.mini_eval === 'number' ? record.mini_eval : parseFloat(record.mini_eval);
      if (!isNaN(evalValue)) {
        stats.evaluations.push(evalValue);
      }
    });

    // Calculer les scores de risque et récupérer les noms
    const studentIds = Object.keys(studentStats);
    let studentNames = {};

    if (studentIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', studentIds);

      profiles?.forEach(p => {
        studentNames[p.id] = `${p.first_name} ${p.last_name}`;
      });
    }

    const problemStudents = Object.values(studentStats)
      .map(stats => {
        const total = stats.totalSessions || 1;
        
        // Calculer le score de risque (plus élevé = plus problématique)
        const riskScore = 
          (stats.absences / total) * 20 +
          (stats.perturbateurIncidents / total) * 25 +
          (stats.phoneIncidents / total) * 15 +
          (stats.sleepingIncidents / total) * 15 +
          (stats.bavarreIncidents / total) * 10 +
          (stats.homeworkMissing / total) * 10 +
          (stats.participationFaible / total) * 5;

        const avgEval = stats.evaluations.length > 0
          ? Math.round(stats.evaluations.reduce((a, b) => a + b, 0) / stats.evaluations.length)
          : null;

        // Identifier les problèmes principaux
        const issues = [];
        if (stats.absences / total > 0.2) issues.push('Absentéisme');
        if (stats.perturbateurIncidents / total > 0.1) issues.push('Comportement perturbateur');
        if (stats.phoneIncidents / total > 0.2) issues.push('Usage téléphone');
        if (stats.sleepingIncidents / total > 0.1) issues.push('Somnolence');
        if (stats.homeworkMissing / total > 0.3) issues.push('Devoirs non faits');
        if (avgEval !== null && avgEval < 40) issues.push('Difficultés académiques');

        return {
          ...stats,
          studentName: studentNames[stats.studentId] || 'Élève inconnu',
          riskScore: Math.round(riskScore * 100) / 100,
          riskLevel: riskScore > 30 ? 'high' : riskScore > 15 ? 'medium' : 'low',
          averageEvaluation: avgEval,
          mainIssues: issues
        };
      })
      .filter(s => s.riskScore > 10) // Seulement les élèves avec un score de risque significatif
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20); // Top 20 élèves problématiques

    res.json({
      period: { start: startDate.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0], days },
      totalStudentsAnalyzed: Object.keys(studentStats).length,
      problemStudentsCount: problemStudents.length,
      students: problemStudents
    });
  } catch (error) {
    console.error('Erreur problem-students:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== CLASSEMENT DES CLASSES ====================

// GET /dashboard/class-ranking — classement des classes par score composite
router.get('/dashboard/class-ranking', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    // Récupérer classes et élèves
    let classesQ = supabaseAdmin.from('classes').select('id, name, level, academic_year, teacher:profiles!classes_teacher_id_fkey(id, first_name, last_name)');
    let studentsQ = supabaseAdmin.from('profiles').select('id, class_id').eq('role', 'student');
    if (schoolId) {
      classesQ = classesQ.eq('school_id', schoolId);
      studentsQ = studentsQ.eq('school_id', schoolId);
    }

    // Récupérer tout le tracking (30 derniers jours)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sinceDate = thirtyDaysAgo.toISOString().split('T')[0];

    let trackingQ = supabaseAdmin
      .from('session_tracking')
      .select('student_id, presence, phone_use, sleeping, discipline, attitude, homework, cahier_present, participation, writing, sessions!inner(id, date, class_id, tracking_options, school_id)')
      .gte('sessions.date', sinceDate);
    if (schoolId) trackingQ = trackingQ.eq('sessions.school_id', schoolId);

    const [classesRes, studentsRes, trackingRes] = await Promise.all([classesQ, studentsQ, trackingQ]);
    const classes = classesRes.data || [];
    const students = studentsRes.data || [];
    const trackingData = trackingRes.data || [];

    const isPresentStatus = (status) => ['present', 'excused', 'late'].includes(status);

    // Agréger par classe
    const classMetrics = new Map();
    classes.forEach(cls => {
      classMetrics.set(cls.id, {
        classId: cls.id,
        name: cls.name,
        level: cls.level,
        academic_year: cls.academic_year,
        teacher: cls.teacher ? `${cls.teacher.first_name} ${cls.teacher.last_name}` : null,
        studentCount: students.filter(s => s.class_id === cls.id).length,
        presence: { total: 0, present: 0 },
        incidents: { total: 0, count: 0 },
        homework: { total: 0, done: 0 },
        cahier: { total: 0, present: 0 },
        participation: { total: 0, active: 0 },
        sessionCount: 0
      });
    });

    // Compter les sessions par classe
    const sessionClasses = new Set();
    trackingData.forEach(record => {
      const classId = record.sessions?.class_id;
      if (!classId || !classMetrics.has(classId)) return;
      const m = classMetrics.get(classId);
      const opts = record.sessions?.tracking_options || {};
      const sessionKey = `${record.sessions.id}`;
      if (!sessionClasses.has(sessionKey)) {
        sessionClasses.add(sessionKey);
        m.sessionCount++;
      }

      // Présence
      if (opts.presence !== false && record.presence) {
        m.presence.total++;
        if (isPresentStatus(record.presence)) m.presence.present++;
      }

      const isPresent = isPresentStatus(record.presence);
      if (!isPresent) return;

      // Incidents
      let hasIncident = false;
      if (opts.phone_use !== false && record.phone_use === true) hasIncident = true;
      if (opts.sleeping !== false && record.sleeping === true) hasIncident = true;
      if (opts.discipline !== false && record.discipline === 'bavarre') hasIncident = true;
      if (opts.attitude !== false && record.attitude === 'perturbateur') hasIncident = true;
      m.incidents.total++;
      if (hasIncident) m.incidents.count++;

      // Devoirs
      if (opts.homework !== false && record.homework !== null && record.homework !== undefined) {
        m.homework.total++;
        if (record.homework === true || record.homework === 'done') m.homework.done++;
      }

      // Cahier
      if (opts.cahier_present !== false && record.cahier_present !== null && record.cahier_present !== undefined) {
        m.cahier.total++;
        if (record.cahier_present === true) m.cahier.present++;
      }

      // Participation (values: 'faible', 'bon', 'excellent')
      if (opts.participation !== false && record.participation) {
        m.participation.total++;
        if (record.participation === 'bon' || record.participation === 'excellent') m.participation.active++;
      }
    });

    // Calculer le score composite (0-100)
    const ranking = Array.from(classMetrics.values()).map(m => {
      const attendanceRate = m.presence.total > 0 ? (m.presence.present / m.presence.total) * 100 : null;
      const incidentRate = m.incidents.total > 0 ? (1 - m.incidents.count / m.incidents.total) * 100 : null;
      const homeworkRate = m.homework.total > 0 ? (m.homework.done / m.homework.total) * 100 : null;
      const cahierRate = m.cahier.total > 0 ? (m.cahier.present / m.cahier.total) * 100 : null;
      const participationRate = m.participation.total > 0 ? (m.participation.active / m.participation.total) * 100 : null;

      // Score pondéré : présence 35%, discipline 25%, devoirs 15%, cahier 10%, participation 15%
      const weights = { attendance: 35, discipline: 25, homework: 15, cahier: 10, participation: 15 };
      let totalWeight = 0;
      let weightedSum = 0;

      if (attendanceRate !== null) { weightedSum += attendanceRate * weights.attendance; totalWeight += weights.attendance; }
      if (incidentRate !== null) { weightedSum += incidentRate * weights.discipline; totalWeight += weights.discipline; }
      if (homeworkRate !== null) { weightedSum += homeworkRate * weights.homework; totalWeight += weights.homework; }
      if (cahierRate !== null) { weightedSum += cahierRate * weights.cahier; totalWeight += weights.cahier; }
      if (participationRate !== null) { weightedSum += participationRate * weights.participation; totalWeight += weights.participation; }

      const compositeScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null;

      return {
        classId: m.classId,
        name: m.name,
        level: m.level,
        academic_year: m.academic_year,
        teacher: m.teacher,
        studentCount: m.studentCount,
        sessionCount: m.sessionCount,
        metrics: {
          attendanceRate: attendanceRate !== null ? Math.round(attendanceRate * 10) / 10 : null,
          incidentRate: incidentRate !== null ? Math.round(incidentRate * 10) / 10 : null,
          homeworkRate: homeworkRate !== null ? Math.round(homeworkRate * 10) / 10 : null,
          cahierRate: cahierRate !== null ? Math.round(cahierRate * 10) / 10 : null,
          participationRate: participationRate !== null ? Math.round(participationRate * 10) / 10 : null
        },
        compositeScore,
        rank: 0
      };
    });

    // Trier : classes avec données d'abord, puis par score décroissant
    ranking.sort((a, b) => {
      if (a.compositeScore === null && b.compositeScore === null) return 0;
      if (a.compositeScore === null) return 1;
      if (b.compositeScore === null) return -1;
      return b.compositeScore - a.compositeScore;
    });

    // Assigner les rangs
    let currentRank = 1;
    ranking.forEach((item, index) => {
      if (item.compositeScore === null) {
        item.rank = null;
      } else {
        if (index > 0 && ranking[index - 1].compositeScore === item.compositeScore) {
          item.rank = ranking[index - 1].rank;
        } else {
          item.rank = currentRank;
        }
        currentRank = index + 2;
      }
    });

    res.json({
      ranking,
      period: { since: sinceDate, until: new Date().toISOString().split('T')[0] },
      totalClasses: classes.length,
      rankedClasses: ranking.filter(r => r.compositeScore !== null).length
    });
  } catch (error) {
    console.error('Erreur class-ranking:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== DASHBOARD OPÉRATIONNEL ====================

// GET /dashboard/timetable-today — today's timetable for all classes with tracking status
router.get('/dashboard/timetable-today', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    // JS: 0=Sunday, class_timetable stores day names as strings
    const jsDow = today.getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dbDow = dayNames[jsDow];

    // 1. Get all classes
    let classesQ = supabaseAdmin.from('classes').select('id, name, level, school_type, filiere');
    if (schoolId) classesQ = classesQ.eq('school_id', schoolId);
    const { data: classes } = await classesQ;

    if (!classes?.length) return res.json({ date: todayStr, dayOfWeek: dbDow, slots: [], classes: [], sessions: [] });

    const classIds = classes.map(c => c.id);

    // 2. Get today's timetable slots for all classes
    let ttQ = supabaseAdmin
      .from('class_timetable')
      .select('id, class_id, day_of_week, slot_order, start_time, end_time, room, subject:subjects(id, name, code), teacher:profiles!class_timetable_teacher_id_fkey(id, first_name, last_name)')
      .eq('day_of_week', dbDow)
      .in('class_id', classIds)
      .order('slot_order', { ascending: true });
    const { data: timetableSlots, error: ttError } = await ttQ;

    // 3. Get today's sessions for all classes (to know which slots have been tracked)
    let sessionsQ = supabaseAdmin
      .from('sessions')
      .select('id, class_id, teacher_id, start_time, end_time, topic, type, subject_id')
      .eq('date', todayStr)
      .in('class_id', classIds);
    const { data: sessions } = await sessionsQ;

    // 4. Get tracking data for today's sessions to compute health scores
    const sessionIds = (sessions || []).map(s => s.id);
    let trackingData = [];
    if (sessionIds.length > 0) {
      for (let i = 0; i < sessionIds.length; i += 50) {
        const chunk = sessionIds.slice(i, i + 50);
        const { data } = await supabaseAdmin
          .from('session_tracking')
          .select('session_id, student_id, presence, participation, discipline, attitude, homework, phone_use, sleeping, cahier_present, mini_eval')
          .in('session_id', chunk);
        if (data) trackingData = trackingData.concat(data);
      }
    }

    // 5. Compute health score per session
    const sessionHealthMap = {};
    const sessionTrackingMap = {};
    sessionIds.forEach(sid => { sessionTrackingMap[sid] = []; });
    trackingData.forEach(t => {
      if (sessionTrackingMap[t.session_id]) sessionTrackingMap[t.session_id].push(t);
    });

    for (const sid of sessionIds) {
      const records = sessionTrackingMap[sid] || [];
      if (records.length === 0) { sessionHealthMap[sid] = null; continue; }

      const total = records.length;
      const present = records.filter(r => ['present', 'late', 'excused'].includes(r.presence)).length;
      const presenceRate = total > 0 ? (present / total) * 100 : 0;

      const withParticipation = records.filter(r => r.participation);
      const participationScore = withParticipation.length > 0
        ? (withParticipation.reduce((sum, r) => {
            const map = { excellent: 5, bien: 4, moyen: 3, faible: 2, null: 0 };
            return sum + (map[r.participation] || 0);
          }, 0) / withParticipation.length) / 5 * 100
        : null;

      const phoneCount = records.filter(r => r.phone_use === true).length;
      const sleepingCount = records.filter(r => r.sleeping === true).length;
      const perturbateurCount = records.filter(r => r.attitude === 'perturbateur').length;
      const incidentRate = total > 0 ? ((phoneCount + sleepingCount + perturbateurCount) / total) * 100 : 0;

      // Health = weighted average: presence 40%, participation 30%, no-incidents 30%
      let health = presenceRate * 0.4;
      if (participationScore !== null) health += participationScore * 0.3;
      else health += presenceRate * 0.3; // fallback
      health += (100 - incidentRate) * 0.3;

      sessionHealthMap[sid] = {
        health: Math.round(health),
        presenceRate: Math.round(presenceRate),
        studentCount: total,
        presentCount: present,
        absentCount: total - present,
        phoneCount,
        sleepingCount,
        perturbateurCount,
        participationScore: participationScore !== null ? Math.round(participationScore) : null
      };
    }

    // 6. Build enriched slots: match timetable slots with sessions
    const enrichedSlots = (timetableSlots || []).map(slot => {
      // Find matching session for this slot (same class, overlapping time)
      const matchingSession = (sessions || []).find(s =>
        s.class_id === slot.class_id && s.start_time === slot.start_time
      ) || (sessions || []).find(s =>
        s.class_id === slot.class_id
        && s.start_time >= slot.start_time && s.start_time < slot.end_time
      );

      return {
        ...slot,
        tracked: !!matchingSession,
        sessionId: matchingSession?.id || null,
        sessionTopic: matchingSession?.topic || null,
        sessionType: matchingSession?.type || null,
        health: matchingSession ? sessionHealthMap[matchingSession.id] : null
      };
    });

    // 7. Build per-class summary
    const classSummaries = classes.map(cls => {
      const classSlots = enrichedSlots.filter(s => s.class_id === cls.id);
      const trackedSlots = classSlots.filter(s => s.tracked);
      const untrackedSlots = classSlots.filter(s => !s.tracked);

      // Average health across tracked sessions
      const healthScores = trackedSlots.map(s => s.health?.health).filter(h => h != null);
      const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : null;

      return {
        ...cls,
        totalSlots: classSlots.length,
        trackedCount: trackedSlots.length,
        untrackedCount: untrackedSlots.length,
        avgHealth,
        slots: classSlots
      };
    }).filter(c => c.totalSlots > 0); // Only classes with timetable today

    // 8. Get unique time slots for the grid header
    const timeSlots = [...new Map(
      (timetableSlots || []).map(s => [`${s.start_time}-${s.end_time}`, { start: s.start_time, end: s.end_time, order: s.slot_order }])
    ).values()].sort((a, b) => a.order - b.order);

    // 9. Global stats
    const allTracked = enrichedSlots.filter(s => s.tracked);
    const allHealthScores = allTracked.map(s => s.health?.health).filter(h => h != null);
    const globalHealth = allHealthScores.length > 0 ? Math.round(allHealthScores.reduce((a, b) => a + b, 0) / allHealthScores.length) : null;

    res.json({
      date: todayStr,
      dayOfWeek: dbDow,
      dayLabel: { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' }[dbDow] || dbDow,
      timeSlots,
      classes: classSummaries,
      globalStats: {
        totalSlots: enrichedSlots.length,
        trackedSlots: allTracked.length,
        untrackedSlots: enrichedSlots.length - allTracked.length,
        globalHealth,
        classesWithTimetable: classSummaries.length,
        classesFullyTracked: classSummaries.filter(c => c.untrackedCount === 0 && c.totalSlots > 0).length
      }
    });
  } catch (error) {
    console.error('Erreur timetable-today:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Endpoint complet pour le tableau de bord admin
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Récupérer toutes les données en parallèle (filtrées par school_id)
    const schoolId = getSchoolId(req);
    let studentsQ = supabaseAdmin.from('profiles').select('*').eq('role', 'student');
    let teachersQ = supabaseAdmin.from('profiles').select('*').eq('role', 'teacher');
    let classesQ = supabaseAdmin.from('classes').select('*, teacher:profiles!classes_teacher_id_fkey(id, first_name, last_name)');
    let trackingQ = supabaseAdmin.from('session_tracking').select('*, sessions!inner(id, date, class_id, teacher_id, tracking_options, school_id)').eq('sessions.date', today);
    let homeworkQ = supabaseAdmin.from('homework').select('*');
    if (schoolId) {
      studentsQ = studentsQ.eq('school_id', schoolId);
      teachersQ = teachersQ.eq('school_id', schoolId);
      classesQ = classesQ.eq('school_id', schoolId);
      trackingQ = trackingQ.eq('sessions.school_id', schoolId);
      homeworkQ = homeworkQ.eq('school_id', schoolId);
    }
    const [
      studentsRes, teachersRes, classesRes, 
      trackingRes, homeworkRes
    ] = await Promise.all([
      studentsQ, teachersQ, classesQ, trackingQ, homeworkQ
    ]);

    const students = studentsRes.data || [];
    const teachers = teachersRes.data || [];
    const classes = classesRes.data || [];
    const trackingData = trackingRes.data || [];
    const homeworkData = homeworkRes.data || [];
    const isPresentStatus = (status) => ['present', 'excused', 'late'].includes(status);

    // Dédoublonner la présence par élève à partir du tracking du jour
    const attendanceByStudent = new Map();
    trackingData.forEach(record => {
      if (!record.student_id) return;
      const status = record.presence || 'absent';
      const currentStatus = attendanceByStudent.get(record.student_id);

      if (!currentStatus) {
        attendanceByStudent.set(record.student_id, status);
        return;
      }

      if (!isPresentStatus(currentStatus) && isPresentStatus(status)) {
        attendanceByStudent.set(record.student_id, status);
      }
    });

    const attendanceData = Array.from(attendanceByStudent.entries()).map(([student_id, status]) => ({
      student_id,
      status
    }));

    // Calculer le taux de présence élèves (moyenne des séances, puis moyenne par classe)
    const sessionStats = new Map();
    trackingData.forEach(record => {
      const sessionId = record.session_id;
      const classId = record.sessions?.class_id;
      if (!sessionId || !classId) return;

      if (!sessionStats.has(sessionId)) {
        sessionStats.set(sessionId, {
          classId,
          presence: { total: 0, present: 0 },
          phone: { total: 0, count: 0 },
          sleeping: { total: 0, count: 0 },
          discipline: { total: 0, bavarre: 0 },
          attitude: { total: 0, perturbateur: 0 },
          homework: { total: 0, missing: 0 },
          cahier: { total: 0, absent: 0 }
        });
      }

      const stats = sessionStats.get(sessionId);
      const presentOrExcused = isPresentStatus(record.presence);

      if (record.sessions?.tracking_options?.presence !== false) {
        stats.presence.total += 1;
        if (presentOrExcused) stats.presence.present += 1;
      }

      if (!presentOrExcused) return;

      if (record.sessions?.tracking_options?.phone_use !== false) {
        stats.phone.total += 1;
        if (record.phone_use === true) stats.phone.count += 1;
      }

      if (record.sessions?.tracking_options?.sleeping !== false) {
        stats.sleeping.total += 1;
        if (record.sleeping === true) stats.sleeping.count += 1;
      }

      if (record.sessions?.tracking_options?.discipline !== false) {
        stats.discipline.total += 1;
        if (record.discipline === 'bavarre') stats.discipline.bavarre += 1;
      }

      if (record.sessions?.tracking_options?.attitude !== false) {
        stats.attitude.total += 1;
        if (record.attitude === 'perturbateur') stats.attitude.perturbateur += 1;
      }

      if (record.sessions?.tracking_options?.homework !== false) {
        stats.homework.total += 1;
        if (record.homework === false) stats.homework.missing += 1;
      }

      if (record.sessions?.tracking_options?.cahier_present !== false) {
        stats.cahier.total += 1;
        if (record.cahier_present === false) stats.cahier.absent += 1;
      }
    });

    const classRatesMap = new Map();
    sessionStats.forEach((stats) => {
      const { classId } = stats;
      if (!classRatesMap.has(classId)) {
        classRatesMap.set(classId, {
          presence: [],
          phone: [],
          sleeping: [],
          discipline: [],
          attitude: [],
          homework: [],
          cahier: [],
          incidents: []
        });
      }

      const classStats = classRatesMap.get(classId);
      if (stats.presence.total > 0) {
        classStats.presence.push(Math.round((stats.presence.present / stats.presence.total) * 100));
      }
      if (stats.phone.total > 0) classStats.phone.push(stats.phone.count);
      if (stats.sleeping.total > 0) classStats.sleeping.push(stats.sleeping.count);
      if (stats.discipline.total > 0) classStats.discipline.push(stats.discipline.bavarre);
      if (stats.attitude.total > 0) classStats.attitude.push(stats.attitude.perturbateur);
      if (stats.homework.total > 0) classStats.homework.push(stats.homework.missing);
      if (stats.cahier.total > 0) classStats.cahier.push(stats.cahier.absent);

      const incidentCount =
        (stats.phone.count || 0) +
        (stats.sleeping.count || 0) +
        (stats.discipline.bavarre || 0) +
        (stats.attitude.perturbateur || 0);
      classStats.incidents.push(incidentCount);
    });

    const averageArray = (values) =>
      values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

    const classAggregateRates = Array.from(classRatesMap.entries()).map(([classId, values]) => ({
      classId,
      attendanceRate: averageArray(values.presence) ?? 0,
      phoneCount: averageArray(values.phone) ?? 0,
      sleepingCount: averageArray(values.sleeping) ?? 0,
      disciplineCount: averageArray(values.discipline) ?? 0,
      attitudeCount: averageArray(values.attitude) ?? 0,
      homeworkMissingCount: averageArray(values.homework) ?? 0,
      cahierAbsentCount: averageArray(values.cahier) ?? 0,
      incidentCount: averageArray(values.incidents) ?? 0
    }));

    const hasTrackingData = classAggregateRates.length > 0;
    const studentAttendanceRate = hasTrackingData
      ? Math.round(classAggregateRates.reduce((sum, item) => sum + item.attendanceRate, 0) / classAggregateRates.length)
      : null;

    // Élèves absents aujourd'hui
    const absentStudentIds = attendanceData.filter(a => a.status === 'absent').map(a => a.student_id);
    const absentStudents = students.filter(s => absentStudentIds.includes(s.id));

    // Devoirs non corrigés
    const uncorrectedHomework = homeworkData.filter(h => !h.corrected && !h.is_corrected);
    const teachersWithUncorrected = [...new Set(uncorrectedHomework.map(h => h.teacher_id).filter(Boolean))];

    // Alertes comportement - inclure tous les indicateurs négatifs
    const behaviorAlerts = Math.round(classAggregateRates.reduce((sum, item) => sum + item.incidentCount, 0));
    const studentsWithBehaviorIssues = [...new Set(trackingData.filter(t => 
      t.attitude === 'perturbateur' || 
      t.phone_use === true || 
      t.sleeping === true ||
      t.discipline === 'bavarre'
    ).map(t => t.student_id))];
    
    // Détails des incidents par type
    const incidentDetails = {
      perturbateur: trackingData.filter(t => t.attitude === 'perturbateur').length,
      phoneUse: trackingData.filter(t => t.phone_use === true).length,
      sleeping: trackingData.filter(t => t.sleeping === true).length,
      bavarre: trackingData.filter(t => t.discipline === 'bavarre').length,
      homeworkMissing: trackingData.filter(t => t.homework === false || (t.sessions?.tracking_options?.homework && !t.homework)).length,
      cahierAbsent: trackingData.filter(t => t.cahier_present === false).length
    };

    // Build detailed student lists for each incident type
    const getStudentName = (sid) => {
      const s = students.find(st => st.id === sid);
      return s ? `${s.first_name} ${s.last_name}` : sid;
    };
    const getStudentClass = (sid) => {
      const s = students.find(st => st.id === sid);
      const cls = s ? classes.find(c => c.id === s.class_id) : null;
      return cls?.name || '';
    };

    // Students with behavior issues (with details)
    const behaviorStudentMap = new Map();
    trackingData.forEach(t => {
      const issues = [];
      if (t.attitude === 'perturbateur') issues.push('perturbateur');
      if (t.phone_use === true) issues.push('téléphone');
      if (t.sleeping === true) issues.push('dort');
      if (t.discipline === 'bavarre') issues.push('bavardage');
      if (issues.length > 0) {
        const existing = behaviorStudentMap.get(t.student_id);
        if (existing) {
          issues.forEach(i => { if (!existing.issues.includes(i)) existing.issues.push(i); });
        } else {
          behaviorStudentMap.set(t.student_id, {
            id: t.student_id,
            name: getStudentName(t.student_id),
            className: getStudentClass(t.student_id),
            issues
          });
        }
      }
    });
    const behaviorStudentsList = Array.from(behaviorStudentMap.values());

    // Students without cahier
    const cahierAbsentStudentIds = [...new Set(trackingData.filter(t => t.cahier_present === false).map(t => t.student_id))];
    const cahierAbsentStudents = cahierAbsentStudentIds.map(sid => ({
      id: sid,
      name: getStudentName(sid),
      className: getStudentClass(sid)
    }));

    // Students with missing homework
    const homeworkMissingStudentIds = [...new Set(trackingData.filter(t => t.homework === false || (t.sessions?.tracking_options?.homework && !t.homework)).map(t => t.student_id))];
    const homeworkMissingStudents = homeworkMissingStudentIds.map(sid => ({
      id: sid,
      name: getStudentName(sid),
      className: getStudentClass(sid)
    }));

    // Classes sans cours aujourd'hui (simplification)
    const classesWithSessions = [...new Set(trackingData.map(t => t.sessions?.class_id).filter(Boolean))];
    const classesWithoutCourse = classes.filter(c => !classesWithSessions.includes(c.id));

    // Construire les priorités
    const priorities = [];

    if (hasTrackingData && studentAttendanceRate !== null && studentAttendanceRate < 80) {
      priorities.push({
        id: 'low-attendance',
        level: 'critical',
        title: `Taux de présence bas: ${studentAttendanceRate}%`,
        description: `${absentStudents.length} élèves absents aujourd'hui`,
        type: 'attendance'
      });
    }

    if (uncorrectedHomework.length > 10) {
      priorities.push({
        id: 'uncorrected-homework',
        level: 'warning',
        title: `${uncorrectedHomework.length} devoirs non corrigés`,
        description: `${teachersWithUncorrected.length} professeur(s) concerné(s)`,
        type: 'homework'
      });
    }

    if (behaviorAlerts > 0) {
      const details = [];
      if (incidentDetails.perturbateur > 0) details.push(`${incidentDetails.perturbateur} perturbateur(s)`);
      if (incidentDetails.phoneUse > 0) details.push(`${incidentDetails.phoneUse} téléphone(s)`);
      if (incidentDetails.sleeping > 0) details.push(`${incidentDetails.sleeping} endormi(s)`);
      
      priorities.push({
        id: 'behavior-alerts',
        level: behaviorAlerts > 5 ? 'critical' : 'warning',
        title: `${behaviorAlerts} alertes comportement`,
        description: details.length > 0 ? details.join(', ') : `${studentsWithBehaviorIssues.length} élève(s) concerné(s)`,
        type: 'behavior'
      });
    }

    // Alerte devoirs non faits
    if (incidentDetails.homeworkMissing > 5) {
      priorities.push({
        id: 'homework-missing',
        level: incidentDetails.homeworkMissing > 10 ? 'critical' : 'warning',
        title: `${incidentDetails.homeworkMissing} devoirs non faits`,
        description: 'Élèves sans devoirs aujourd\'hui',
        type: 'homework-student'
      });
    }

    // Alerte cahiers absents
    if (incidentDetails.cahierAbsent > 5) {
      priorities.push({
        id: 'cahier-absent',
        level: 'warning',
        title: `${incidentDetails.cahierAbsent} cahiers absents`,
        description: 'Élèves sans cahier aujourd\'hui',
        type: 'cahier'
      });
    }

    if (classesWithoutCourse.length > 0 && classes.length > 0 && hasTrackingData) {
      priorities.push({
        id: 'classes-without-course',
        level: 'warning',
        title: `${classesWithoutCourse.length} classe(s) sans cours`,
        description: 'Classes sans activité prévue aujourd\'hui',
        type: 'schedule'
      });
    }

    // Données des classes enrichies
    const classesData = classes.map(cls => {
      const classStudents = students.filter(s => s.class_id === cls.id);
      const classRateEntry = classAggregateRates.find(rate => rate.classId === cls.id);
      const attendanceRate = classRateEntry
        ? classRateEntry.attendanceRate
        : null;
      const homeworkPending = uncorrectedHomework.filter(h => h.class_id === cls.id).length;

      return {
        id: cls.id,
        name: cls.name,
        level: cls.level,
        studentCount: classStudents.length,
        attendanceRate,
        homeworkPending,
        status: attendanceRate === null ? 'gray' : attendanceRate >= 90 ? 'green' : attendanceRate >= 75 ? 'orange' : 'red',
        teacher: cls.teacher ? `${cls.teacher.first_name} ${cls.teacher.last_name}` : null
      };
    });

    // Données des professeurs enrichies
    const teachersData = teachers.map(teacher => {
      const teacherHomework = uncorrectedHomework.filter(h => h.teacher_id === teacher.id);
      const teacherClasses = classes.filter(c => c.teacher_id === teacher.id);

      return {
        id: teacher.id,
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        email: teacher.email,
        classCount: teacherClasses.length,
        homeworkLate: teacherHomework.length,
        status: teacherHomework.length === 0 ? 'green' : teacherHomework.length < 5 ? 'orange' : 'red'
      };
    });

    // Tendances (7 derniers jours - données réelles)
    const last7Days = [];
    const trendsAttendance = [];
    const trendsHomework = [];
    const trendsIncidents = [];
    const trendsAverages = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      last7Days.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));

      // Récupérer les données de tracking pour ce jour (présence + incidents + devoirs + notes)
      let dayTrackQ = supabaseAdmin
        .from('session_tracking')
        .select('presence, attitude, phone_use, sleeping, homework, mini_eval, sessions!inner(date, school_id)')
        .eq('sessions.date', dateStr);
      if (schoolId) dayTrackQ = dayTrackQ.eq('sessions.school_id', schoolId);
      const { data: dayTracking } = await dayTrackQ;

      const dayRecords = dayTracking || [];

      // Présence from session_tracking
      const dayWithPresence = dayRecords.filter(t => t.presence);
      const dayPresent = dayWithPresence.filter(t => ['present', 'late', 'excused'].includes(t.presence)).length;
      const dayTotal = dayWithPresence.length;
      trendsAttendance.push(dayTotal > 0 ? Math.round((dayPresent / dayTotal) * 100) : 0);

      // Incidents
      const dayIncidents = dayRecords.filter(t => 
        t.attitude === 'perturbateur' || t.phone_use === true || t.sleeping === true
      ).length;
      trendsIncidents.push(dayIncidents);

      // Devoirs non faits
      const dayHomeworkMissing = dayRecords.filter(t => t.homework === false).length;
      trendsHomework.push(dayHomeworkMissing);

      // Moyenne des mini-évaluations
      const evals = dayRecords.filter(t => t.mini_eval != null).map(t => parseFloat(t.mini_eval));
      const avgEval = evals.length > 0 ? Math.round((evals.reduce((a, b) => a + b, 0) / evals.length) * 10) / 10 : 0;
      trendsAverages.push(avgEval);
    }

    res.json({
      kpis: {
        studentAttendance: {
          value: studentAttendanceRate,
          total: students.length,
          absentCount: absentStudents.length,
          absentStudents: absentStudents.map(s => ({
            id: s.id,
            name: `${s.first_name} ${s.last_name}`,
            className: classes.find(c => c.id === s.class_id)?.name || ''
          }))
        },
        teacherAttendance: {
          value: teachers.length > 0 && hasTrackingData ? 100 : null,
          total: teachers.length,
          absentCount: 0
        },
        uncorrectedHomework: {
          value: uncorrectedHomework.length,
          teacherCount: teachersWithUncorrected.length,
          teachers: teachersWithUncorrected.map(tid => {
            const t = teachers.find(te => te.id === tid);
            return { id: tid, name: t ? `${t.first_name} ${t.last_name}` : tid };
          })
        },
        behaviorAlerts: {
          value: behaviorAlerts,
          studentCount: studentsWithBehaviorIssues.length,
          details: incidentDetails,
          students: behaviorStudentsList
        },
        classesWithoutCourse: {
          value: classesWithoutCourse.length,
          classes: classesWithoutCourse.map(c => ({ id: c.id, name: c.name, teacher: c.teacher ? `${c.teacher.first_name} ${c.teacher.last_name}` : null }))
        },
        cahierAbsent: {
          value: incidentDetails.cahierAbsent,
          students: cahierAbsentStudents
        },
        homeworkMissing: {
          value: incidentDetails.homeworkMissing,
          students: homeworkMissingStudents
        }
      },
      priorities,
      classes: classesData,
      teachers: teachersData,
      trends: {
        labels: last7Days,
        attendance: trendsAttendance,
        homework: trendsHomework,
        incidents: trendsIncidents,
        averages: trendsAverages
      },
      meta: {
        generatedAt: new Date().toISOString(),
        date: today
      }
    });
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== CAHIER DE TEXTE (ADMIN) ====================

// Récupérer le cahier de texte pour l'admin (toutes classes / tous profs)
router.get('/cahier-de-texte', async (req, res) => {
  try {
    const { class_id, start_date, end_date, subject_id, teacher_id } = req.query;

    const startDate = start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    let query = supabaseAdmin
      .from('sessions')
      .select('id, date, start_time, end_time, topic, notes, type, subject_id, school_id, subject:subjects(id, name), class:classes!inner(id, name, level, school_type, filiere), teacher:profiles!sessions_teacher_id_fkey(id, first_name, last_name)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    query = applySchoolFilter(query, req);
    // Filtre de scope sur class_id pour pedagogical_manager
    const scopedClassIdsCdt = await getScopedClassIds(req);
    if (scopedClassIdsCdt !== null) {
      if (scopedClassIdsCdt.length === 0) return res.json({ classes: [], totalSessions: 0, period: { startDate, endDate } });
      query = query.in('class_id', scopedClassIdsCdt);
    }

    if (class_id) {
      // Si plusieurs ids séparés par virgule
      const ids = String(class_id).split(',').filter(Boolean);
      if (ids.length === 1) query = query.eq('class_id', ids[0]);
      else if (ids.length > 1) query = query.in('class_id', ids);
    }
    if (subject_id) {
      query = query.eq('subject_id', subject_id);
    }
    if (teacher_id) {
      query = query.eq('teacher_id', teacher_id);
    }

    const { data: sessions, error } = await query;
    if (error) throw error;

    // Grouper par classe pour faciliter l'export multi-classes
    const byClass = {};
    (sessions || []).forEach(s => {
      const cid = s.class?.id || 'unknown';
      if (!byClass[cid]) {
        byClass[cid] = {
          classInfo: s.class,
          sessions: []
        };
      }
      byClass[cid].sessions.push(s);
    });

    res.json({
      classes: Object.values(byClass),
      totalSessions: sessions?.length || 0,
      period: { startDate, endDate }
    });
  } catch (error) {
    console.error('Erreur cahier de texte admin:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════════
//  NOTES DES PROFS — vue admin / direction / responsable pédagogique
//  Consulter, modifier (override) et exporter les notes publiées par les profs.
// ════════════════════════════════════════════════════════════════════════

// Vérifie que la classe est dans le périmètre de l'utilisateur (école + scope manager)
const assertClassInScope = async (req, classId) => {
  const schoolId = getSchoolId(req);
  const { data: cls } = await supabaseAdmin
    .from('classes').select('id, name, level, filiere, academic_year, school_id').eq('id', classId).single();
  if (!cls) return { error: 404, message: 'Classe introuvable' };
  if (schoolId && cls.school_id && cls.school_id !== schoolId) return { error: 403, message: 'Classe hors de votre école' };
  const scoped = await getScopedClassIds(req);
  if (scoped !== null && !scoped.includes(classId)) return { error: 403, message: 'Classe hors de votre périmètre' };
  return { cls };
};

// GET /classes/:classId/controls-overview — synthèse des contrôles d'une classe
router.get('/classes/:classId/controls-overview', async (req, res) => {
  try {
    const { classId } = req.params;
    const check = await assertClassInScope(req, classId);
    if (check.error) return res.status(check.error).json({ error: check.message });

    // Élèves de la classe
    const { data: students } = await supabaseAdmin
      .from('profiles').select('id').eq('class_id', classId).eq('role', 'student');
    const totalStudents = (students || []).length;

    // Contrôles de la classe
    const { data: controls } = await supabaseAdmin
      .from('controls_plan')
      .select('id, name, date, start_time, kind, teacher_id')
      .eq('class_id', classId)
      .order('date', { ascending: false });
    const controlIds = (controls || []).map(c => c.id);

    // Notes de tous ces contrôles (1 requête)
    let notesByControl = {};
    if (controlIds.length) {
      const { data: notes } = await supabaseAdmin
        .from('control_notes').select('control_id, note').in('control_id', controlIds);
      (notes || []).forEach(n => {
        (notesByControl[n.control_id] = notesByControl[n.control_id] || []).push(Number(n.note));
      });
    }

    // Matière + nom du prof (1 requête chacune)
    const teacherIds = [...new Set((controls || []).map(c => c.teacher_id).filter(Boolean))];
    const subjByTeacher = {}, nameByTeacher = {};
    if (teacherIds.length) {
      const { data: ts } = await supabaseAdmin
        .from('teacher_subjects').select('teacher_id, subjects(name)').in('teacher_id', teacherIds);
      (ts || []).forEach(t => { if (!subjByTeacher[t.teacher_id]) subjByTeacher[t.teacher_id] = t.subjects?.name || ''; });
      const { data: profs } = await supabaseAdmin
        .from('profiles').select('id, first_name, last_name').in('id', teacherIds);
      (profs || []).forEach(p => { nameByTeacher[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim(); });
    }

    const overview = (controls || []).map(c => {
      const vals = (notesByControl[c.id] || []).filter(v => !isNaN(v));
      const noted = vals.length;
      const avg = noted ? Math.round((vals.reduce((a, b) => a + b, 0) / noted) * 100) / 100 : null;
      return {
        id: c.id, name: c.name, date: c.date, start_time: c.start_time, kind: c.kind,
        subject: subjByTeacher[c.teacher_id] || '—',
        teacher: nameByTeacher[c.teacher_id] || '—',
        totalStudents, notedStudents: noted, missing: Math.max(0, totalStudents - noted),
        average: avg,
      };
    });

    res.json({ class: check.cls, totalStudents, controls: overview });
  } catch (e) {
    console.error('[Admin] controls-overview error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /controls/:controlId/notes-detail — détail éditable (note + statut couleur)
router.get('/controls/:controlId/notes-detail', async (req, res) => {
  try {
    const { controlId } = req.params;
    const { collectControlReportData, buildControlRows } =
      await import('../services/bulletins/controlReportPdf.js');

    const data = await collectControlReportData(controlId, null); // null = rôle privilégié
    if (!data) return res.status(404).json({ error: 'Contrôle introuvable' });

    const check = await assertClassInScope(req, data.control.class_id);
    if (check.error) return res.status(check.error).json({ error: check.message });

    const rows = buildControlRows(data);
    res.json({
      control: data.control,
      subject: data.subjectName,
      class: data.cls,
      hasTracking: (data.trackingByStudent?.size || 0) > 0,
      rows,
    });
  } catch (e) {
    console.error('[Admin] notes-detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /controls/:controlId/notes — modification (override) des notes par l'admin
router.put('/controls/:controlId/notes', async (req, res) => {
  try {
    const { controlId } = req.params;
    const { notes } = req.body;
    if (!Array.isArray(notes)) return res.status(400).json({ error: 'notes[] requis' });

    const { data: control } = await supabaseAdmin
      .from('controls_plan').select('id, class_id').eq('id', controlId).single();
    if (!control) return res.status(404).json({ error: 'Contrôle introuvable' });
    const check = await assertClassInScope(req, control.class_id);
    if (check.error) return res.status(check.error).json({ error: check.message });

    const rows = notes
      .filter(n => n.student_id && n.note !== '' && n.note != null)
      .map(n => ({
        control_id: controlId,
        student_id: n.student_id,
        note: Math.min(20, Math.max(0, parseFloat(String(n.note).replace(',', '.')))),
        appreciation: n.appreciation || '',
      }))
      .filter(n => !isNaN(n.note));

    // Suppression des notes vidées (note effacée par l'admin)
    const toClear = notes.filter(n => n.student_id && (n.note === '' || n.note == null)).map(n => n.student_id);
    if (toClear.length) {
      await supabaseAdmin.from('control_notes').delete().eq('control_id', controlId).in('student_id', toClear);
    }

    let saved = 0;
    if (rows.length) {
      const { data, error } = await supabaseAdmin
        .from('control_notes').upsert(rows, { onConflict: 'control_id,student_id' }).select();
      if (error) throw error;
      saved = (data || []).length;
    }
    res.json({ saved, cleared: toClear.length });
  } catch (e) {
    console.error('[Admin] update control notes error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
