import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize, getScopedClassIds } from '../middleware/auth.js';
import { generatePreview, generateComprehensivePreview } from '../services/dailyReports.js';
import { resolveCategoryForSending, allowedCategoriesForRole } from '../utils/whatsappCategory.js';
import { sendText, getStatus } from '../services/whatsapp/index.js';
import { sendUtility, sendUtilityMedia, serviceWindowOpen } from '../services/whatsapp/utility.js';
import { TEMPLATES, getTemplate, templateLanguages, definitionFor } from '../services/whatsapp/templates.js';
import { generateStudentReportPdf } from '../services/studentReportPdf.js';
import * as cloud from '../services/whatsapp/cloudApi.js';
import { activeEnrollmentMap, activeStudentIdSet } from '../utils/enrollmentScope.js';
import { archivedStudentIdSet } from '../utils/studentArchive.js';
import { sendPushToUser } from '../services/webPush.js';
import { uploadBuffer, BUCKET_PUBLIC } from '../utils/storage.js';
import { isSessionReady, sendUnified } from '../services/whatsapp/sendHelpers.js';
import { runBulkSend, WHATSAPP_BULK_SEND } from '../services/whatsapp/bulkSend.js';
import { enqueueJob } from '../services/jobs/index.js';
import { whatsappOptedOut } from '../services/notificationRouter.js';
import { prepareVoiceNote } from '../services/whatsapp/voiceNote.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'school_admin', 'pedagogical_manager', 'pedagogical_director', 'finance_manager', 'transport_manager'));

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return null;
  return req.user.school_id || null;
};

// Exécute une requête .in(...) par lots et agrège les résultats. Évite le
// « Bad Request » de PostgREST quand la liste d'IDs est trop longue (URL trop
// longue) — fréquent dès que l'école a beaucoup d'élèves/parents.
// PostgREST (Supabase) plafonne CHAQUE requête à 1 000 lignes, `.limit(3000)`
// compris : au-delà, les lignes excédentaires sont abandonnées sans erreur.
// Cette pagination va chercher la suite page par page, jusqu'à `max`.
const PAGE_SIZE = 1000;
const selectPaged = async (queryFn, max = 3000, label = '') => {
  const out = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, max) - 1;
    const { data, error } = await queryFn().range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < to - from + 1) break;   // dernière page
  }
  if (out.length >= max && label) {
    console.warn(`[${label}] plafond de ${max} lignes atteint — historique tronqué`);
  }
  return out;
};

// whatsapp_incoming_messages.received_at est un TIMESTAMP *sans* fuseau
// (table d'origine du chatbot). PostgREST le renvoie donc « 2026-08-25T10:14:02 »,
// que le navigateur interprète comme une heure LOCALE alors que la valeur est en
// UTC : une heure d'écart au Maroc. Conséquences visibles : réponse d'un parent
// affichée AVANT le message auquel elle répond, et conversation qui ne remonte
// pas en tête. On marque explicitement l'UTC.
// (ADD_WHATSAPP_TIMESTAMPTZ.sql corrige la colonne ; ceci reste sans effet une
// fois la migration passée, la date portant alors déjà son fuseau.)
const asUtc = (value) => {
  if (!value) return value;
  const s = String(value);
  return /(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
};

const selectInChunks = async (ids, queryFn, chunkSize = 200) => {
  const out = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const { data, error } = await queryFn(chunk);
    if (error) throw error;
    if (data) out.push(...data);
  }
  return out;
};

// ==================== READ-ONLY DATA (accessible à tous les rôles autorisés sur ce router) ====================
// Ces endpoints permettent aux finance_manager, transport_manager, pedagogical_manager
// d'accéder aux listes nécessaires (classes, profs, matières) sans toucher à /api/admin/*

router.get('/classes', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let query = supabaseAdmin.from('classes').select('*').order('name');
    if (schoolId) query = query.eq('school_id', schoolId);
    // Année active fournie → seules les classes de cette année (sinon le
    // sélecteur de classes proposerait aussi celles des années passées).
    if (req.query.academic_year) query = query.eq('academic_year', req.query.academic_year);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur classes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/teachers', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let query = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email, phone')
      .eq('role', 'teacher')
      .order('first_name');
    if (schoolId) query = query.eq('school_id', schoolId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur teachers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/subjects', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let query = supabaseAdmin.from('subjects').select('*').order('name');
    if (schoolId) query = query.eq('school_id', schoolId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur subjects:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/teachers/:teacherId/subjects', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { data, error } = await supabaseAdmin
      .from('teacher_subjects')
      .select('subject_id, subjects(*)')
      .eq('teacher_id', teacherId);
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur teacher subjects:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifie qu'une école peut envoyer : son numéro doit être rattaché à l'API
// Cloud officielle (phone_number_id renseigné).
// isSessionReady / sendUnified vivent désormais dans services/whatsapp/sendHelpers.js :
// le job d'envoi de masse en a besoin aussi (voir import en tête de fichier).

// ==================== MODÈLES META ====================

/**
 * Colonnes de template à joindre à une campagne, ou rien du tout.
 *
 * Une clé inconnue du registre, ou un template pas encore approuvé, ne doit
 * PAS bloquer l'envoi : on l'ignore et la campagne repart sur le
 * comportement habituel (texte libre dans la fenêtre, annonce en dehors).
 */
function templateColumns(templateKey, templateParams, templateLang) {
  const tpl = templateKey ? getTemplate(templateKey) : null;
  if (!tpl) return {};
  // Une langue non déclarée pour ce template ferait échouer l'envoi chez Meta :
  // on l'ignore et la campagne repart sur la langue de chaque destinataire.
  const langue = templateLanguages(tpl).includes(templateLang) ? templateLang : null;
  return {
    template_key: templateKey,
    template_params: Array.isArray(templateParams) ? templateParams : [],
    template_lang: langue,
  };
}

/**
 * GET /templates — modèles approuvés utilisables pour un envoi.
 *
 * L'école y choisit un message dont le corps est déjà validé par Meta : il
 * part EN ENTIER même hors fenêtre de 24 h, là où un texte libre serait
 * seulement annoncé. Les templates d'annonce sont exclus de la liste — les
 * proposer n'aurait aucun intérêt, c'est déjà le repli automatique.
 */
router.get('/templates', async (req, res) => {
  try {
    const dispo = Object.entries(TEMPLATES)
      .filter(([, tpl]) => tpl.name && !tpl.announce)
      .map(([key, tpl]) => ({
        key,
        name: tpl.name,
        params: tpl.params || [],
        category: tpl.definition.category,
        languages: templateLanguages(tpl),
        // Corps de chaque langue : l'interface montre à l'école le message
        // exact que le parent recevra, variables comprises.
        bodies: Object.fromEntries(
          templateLanguages(tpl).map((lang) => [lang, definitionFor(tpl, lang).body]),
        ),
        example: tpl.definition.example || [],
      }));
    res.json(dispo);
  } catch (error) {
    console.error('Erreur GET /templates:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== SEGMENT « EN ATTENTE DE LIVRAISON » ====================

/**
 * Numéros dont au moins un message reste au statut « annoncé ».
 *
 * Hors fenêtre de 24 h, seule l'annonce part : le contenu attend la réponse du
 * destinataire. Ces numéros forment donc le segment de relance le plus utile —
 * ce sont eux, et eux seuls, qui n'ont rien reçu. La ligne repasse à « envoyé »
 * dès la livraison, le segment se vide donc tout seul.
 *
 * @returns {Promise<Set<string>>} numéros E.164
 */
async function phonesAwaitingDelivery(schoolId) {
  let q = supabaseAdmin
    .from('whatsapp_message_recipients')
    .select('phone_e164, whatsapp_messages!inner(school_id)')
    .eq('status', 'announced');
  if (schoolId) q = q.eq('whatsapp_messages.school_id', schoolId);
  const { data, error } = await q;
  if (error) {
    console.warn('[whatsapp] segment en attente de livraison:', error.message);
    return new Set();
  }
  return new Set((data || []).map((r) => r.phone_e164).filter(Boolean));
}

// ==================== RECIPIENTS ====================

// GET /recipients — get parent phone numbers filtered by class, level, school_type
router.get('/recipients', async (req, res) => {
  try {
    const { class_ids, school_type, level, pending_delivery } = req.query;
    const schoolId = getSchoolId(req);
    const attenteSeule = pending_delivery === '1' || pending_delivery === 'true';

    // Build student query to get class-filtered student IDs
    let studentQuery = supabaseAdmin
      .from('profiles')
      .select('id, class_id, classes!fk_profiles_class(id, name, level, school_type)')
      .eq('role', 'student');

    if (schoolId) {
      studentQuery = studentQuery.eq('school_id', schoolId);
    }

    const { data: students, error: studentsError } = await studentQuery;
    if (studentsError) throw studentsError;

    // Filter students by class criteria
    let filteredStudents = students || [];
    // Élèves archivés exclus des destinataires.
    const archivedRecipIds = await archivedStudentIdSet(schoolId);
    if (archivedRecipIds) filteredStudents = filteredStudents.filter(s => !archivedRecipIds.has(s.id));

    // Filtre de scope pour pedagogical_manager
    const scopedIds = await getScopedClassIds(req);
    if (scopedIds !== null) {
      if (scopedIds.length === 0) return res.json({ recipients: [], stats: { total: 0, withParents: 0 } });
      filteredStudents = filteredStudents.filter(s => scopedIds.includes(s.class_id));
    }

    if (class_ids) {
      const ids = class_ids.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length > 0) {
        filteredStudents = filteredStudents.filter(s => ids.includes(s.class_id));
      }
    }

    if (school_type) {
      filteredStudents = filteredStudents.filter(s => s.classes?.school_type === school_type);
    }

    if (level) {
      filteredStudents = filteredStudents.filter(s => s.classes?.level === level);
    }

    // Année active fournie → seuls les élèves inscrits (RI/NI) cette année-là.
    // Sans ce filtre, les parents des élèves non réinscrits recevaient encore
    // les messages WhatsApp après le passage à la nouvelle année.
    const activeIds = await activeStudentIdSet(schoolId, req.query.academic_year);
    if (activeIds) filteredStudents = filteredStudents.filter(s => activeIds.has(s.id));

    const studentIds = filteredStudents.map(s => s.id);

    if (studentIds.length === 0) {
      return res.json({ count: 0, recipients: [] });
    }

    // Get parent IDs linked to these students (par lots : un .in() avec trop
    // d'UUID dépasse la limite de longueur d'URL de PostgREST → « Bad Request »).
    const parentLinks = await selectInChunks(
      studentIds,
      (chunk) => supabaseAdmin.from('parent_students').select('parent_id, student_id').in('student_id', chunk)
    );

    const parentIds = [...new Set((parentLinks || []).map(l => l.parent_id))];

    if (parentIds.length === 0) {
      return res.json({ count: 0, recipients: [] });
    }

    // Get parent contacts (WhatsApp phones)
    const contacts = await selectInChunks(
      parentIds,
      (chunk) => supabaseAdmin.from('parent_contacts').select('parent_id, phone_e164, is_primary, consent_status').in('parent_id', chunk).eq('channel', 'whatsapp').order('is_primary', { ascending: false })
    );

    // Deduplicate: one phone per parent (prefer primary)
    const parentPhoneMap = {};
    (contacts || []).forEach(c => {
      if (!parentPhoneMap[c.parent_id]) {
        parentPhoneMap[c.parent_id] = c;
      }
    });

    const recipients = Object.values(parentPhoneMap).map(c => ({
      parent_id: c.parent_id,
      phone_e164: c.phone_e164,
      consent_status: c.consent_status
    }));

    // Deduplicate by phone number (same phone may be linked to multiple parents)
    const uniquePhones = {};
    recipients.forEach(r => {
      if (!uniquePhones[r.phone_e164]) {
        uniquePhones[r.phone_e164] = r;
      }
    });

    let uniqueRecipients = Object.values(uniquePhones);

    // Segment de relance : uniquement ceux dont un message attend sa livraison.
    if (attenteSeule) {
      const enAttente = await phonesAwaitingDelivery(schoolId);
      uniqueRecipients = uniqueRecipients.filter((r) => enAttente.has(r.phone_e164));
      return res.json({
        count: uniqueRecipients.length,
        parentCount: uniqueRecipients.length,
        recipients: uniqueRecipients,
      });
    }

    // count = numéros WhatsApp uniques ; parentCount = parents ciblés (canal app,
    // joignables même sans numéro WhatsApp via la notification in-app).
    res.json({ count: uniqueRecipients.length, parentCount: parentIds.length, recipients: uniqueRecipients });
  } catch (error) {
    console.error('Erreur récupération destinataires:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== RECIPIENTS LIST (detailed) ====================

// GET /recipients-list — get detailed parent list with names and children.
// Sans class_ids → tous les parents de l'école (même logique que /recipients :
// on ne filtre pas sur profiles.class_id, qui peut être périmé après une
// promotion d'année ; on se fie aux inscriptions actives student_enrollments).
router.get('/recipients-list', async (req, res) => {
  try {
    const { class_ids } = req.query;
    const schoolId = getSchoolId(req);

    // Liste de classes demandée (vide = toutes les classes de l'école)
    let ids = class_ids ? class_ids.split(',').map(id => id.trim()).filter(Boolean) : [];

    // Filtre de scope pour pedagogical_manager : restreindre aux classes assignées
    const scopedIds = await getScopedClassIds(req);
    if (scopedIds !== null) {
      // Sans sélection explicite → on se limite aux classes du périmètre.
      ids = ids.length ? ids.filter(id => scopedIds.includes(id)) : scopedIds;
      if (ids.length === 0) return res.json({ parents: [] });
    }

    // Get students (dans les classes demandées, ou toute l'école si aucune)
    let studentQuery = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id, classes!fk_profiles_class(id, name)')
      .eq('role', 'student');
    if (ids.length) studentQuery = studentQuery.in('class_id', ids);
    if (schoolId) studentQuery = studentQuery.eq('school_id', schoolId);

    const { data: allStudents, error: studentsError } = await studentQuery;
    if (studentsError) throw studentsError;

    // Année active fournie → seuls les élèves inscrits (RI/NI) cette année-là.
    const activeIds = await activeStudentIdSet(schoolId, req.query.academic_year);
    let students = activeIds ? (allStudents || []).filter(s => activeIds.has(s.id)) : (allStudents || []);
    // Les familles des élèves archivés ne doivent plus rien recevoir.
    const archivedIds = await archivedStudentIdSet(schoolId);
    if (archivedIds) students = students.filter(s => !archivedIds.has(s.id));
    if (students.length === 0) return res.json({ parents: [] });

    const studentIds = students.map(s => s.id);

    // Get parent-student links (par lots : évite le « Bad Request » PostgREST
    // quand la liste d'UUID est trop longue — écoles à plusieurs centaines d'élèves).
    const parentLinks = await selectInChunks(
      studentIds,
      (chunk) => supabaseAdmin.from('parent_students').select('parent_id, student_id').in('student_id', chunk)
    );

    if (!parentLinks || parentLinks.length === 0) return res.json({ parents: [] });

    const parentIds = [...new Set(parentLinks.map(l => l.parent_id))];

    // Get parent profiles
    const parentProfiles = await selectInChunks(
      parentIds,
      (chunk) => supabaseAdmin.from('profiles').select('id, first_name, last_name, phone').in('id', chunk)
    );

    // Get parent WhatsApp contacts
    const contacts = await selectInChunks(
      parentIds,
      (chunk) => supabaseAdmin.from('parent_contacts').select('parent_id, phone_e164, is_primary').in('parent_id', chunk).eq('channel', 'whatsapp').order('is_primary', { ascending: false })
    );

    // Build parent map with children and phone
    const parentMap = {};
    (parentProfiles || []).forEach(p => {
      parentMap[p.id] = {
        parent_id: p.id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Parent',
        phone_profile: p.phone,
        phone_whatsapp: null,
        children: []
      };
    });

    // Assign WhatsApp phone (prefer primary from parent_contacts)
    (contacts || []).forEach(c => {
      if (parentMap[c.parent_id] && !parentMap[c.parent_id].phone_whatsapp) {
        parentMap[c.parent_id].phone_whatsapp = c.phone_e164;
      }
    });

    // Fallback: use profiles.phone for parents without parent_contacts entry
    Object.values(parentMap).forEach(p => {
      if (!p.phone_whatsapp && p.phone_profile) {
        // Normalize phone: ensure it starts with country code
        let phone = p.phone_profile.replace(/[\s\-\(\)]/g, '');
        if (phone.startsWith('0')) phone = '+212' + phone.substring(1);
        if (!phone.startsWith('+')) phone = '+' + phone;
        p.phone_whatsapp = phone;
      }
    });

    // Assign children
    (parentLinks || []).forEach(link => {
      const student = students.find(s => s.id === link.student_id);
      if (student && parentMap[link.parent_id]) {
        parentMap[link.parent_id].children.push({
          id: student.id,
          name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
          class_name: student.classes?.name || ''
        });
      }
    });

    // App installée ? (au moins un abonnement push) — affiché dans le sélecteur
    // et utile pour choisir le canal.
    const subs = await selectInChunks(
      parentIds,
      (chunk) => supabaseAdmin.from('push_subscriptions').select('user_id').in('user_id', chunk)
    );
    const appParentIds = new Set((subs || []).map(s => s.user_id));
    Object.values(parentMap).forEach(p => { p.has_app = appParentIds.has(p.parent_id); });

    // On garde aussi les parents SANS numéro WhatsApp : ils restent joignables
    // par le canal app (notification in-app / push).
    const parents = Object.values(parentMap)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ parents, total: parents.length });
  } catch (error) {
    console.error('Erreur récupération liste parents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SEND MESSAGE ====================

// POST /send — send WhatsApp message to filtered parents
router.post('/send', async (req, res) => {
  try {
    const { message, type, mediaUrl, fileName, filter, category: requestedCategory, templateKey, templateParams, templateLang } = req.body;
    const schoolId = getSchoolId(req);
    const category = resolveCategoryForSending(requestedCategory, req.user?.role);
    // Canal(aux) d'envoi : 'whatsapp' (défaut, historique), 'push' (app), 'both'
    const channels = ['whatsapp', 'push', 'both'].includes(req.body.channels) ? req.body.channels : 'whatsapp';
    const wantWa = channels !== 'push';
    const wantPush = channels !== 'whatsapp';

    if (!message && !mediaUrl) {
      return res.status(400).json({ error: 'Message ou média requis' });
    }

    // First get recipients using same logic
    let studentQuery = supabaseAdmin
      .from('profiles')
      .select('id, class_id, classes!fk_profiles_class(id, name, level, school_type)')
      .eq('role', 'student');

    if (schoolId) {
      studentQuery = studentQuery.eq('school_id', schoolId);
    }

    const { data: students, error: studentsError } = await studentQuery;
    if (studentsError) throw studentsError;

    let filteredStudents = students || [];
    // Élèves archivés exclus des envois.
    const archivedSendIds = await archivedStudentIdSet(schoolId);
    if (archivedSendIds) filteredStudents = filteredStudents.filter(s => !archivedSendIds.has(s.id));

    if (filter?.class_ids?.length > 0) {
      filteredStudents = filteredStudents.filter(s => filter.class_ids.includes(s.class_id));
    }
    if (filter?.school_type) {
      filteredStudents = filteredStudents.filter(s => s.classes?.school_type === filter.school_type);
    }
    if (filter?.level) {
      filteredStudents = filteredStudents.filter(s => s.classes?.level === filter.level);
    }

    // Année active fournie → seuls les élèves inscrits (RI/NI) cette année-là.
    // Les parents des élèves non réinscrits ne reçoivent plus les envois.
    const activeIds = await activeStudentIdSet(schoolId, filter?.academic_year || req.body.academic_year);
    if (activeIds) filteredStudents = filteredStudents.filter(s => activeIds.has(s.id));

    const studentIds = filteredStudents.map(s => s.id);

    if (studentIds.length === 0) {
      return res.status(400).json({ error: 'Aucun destinataire trouvé' });
    }

    const { data: parentLinks } = await supabaseAdmin
      .from('parent_students')
      .select('parent_id, student_id')
      .in('student_id', studentIds);

    const parentIds = [...new Set((parentLinks || []).map(l => l.parent_id))];

    if (parentIds.length === 0) {
      return res.status(400).json({ error: 'Aucun parent trouvé pour ces élèves' });
    }

    const contacts = await selectInChunks(
      parentIds,
      (chunk) => supabaseAdmin.from('parent_contacts').select('parent_id, phone_e164, is_primary, consent_status').in('parent_id', chunk).eq('channel', 'whatsapp').order('is_primary', { ascending: false })
    );

    // Parents désabonnés (STOP) : plus AUCUN WhatsApp, quel que soit le canal
    // demandé. Ils gardent la notification dans l'app — le contenu reste donc
    // consultable, c'est ce que promet le message de confirmation du STOP.
    const optedOutParents = new Set(
      (contacts || []).filter((c) => c.consent_status === 'opted_out').map((c) => c.parent_id)
    );

    // Un numéro par parent (préférence au principal)
    const parentPhoneMap = {};
    (contacts || []).forEach(c => {
      if (optedOutParents.has(c.parent_id)) return;
      if (!parentPhoneMap[c.parent_id]) {
        parentPhoneMap[c.parent_id] = c.phone_e164;
      }
    });

    // Base destinataires = 1 ligne par parent (téléphone nullable : un parent
    // sans WhatsApp reste joignable via le canal app/push).
    let recipients = parentIds.map(pid => ({ parent_id: pid, phone_e164: parentPhoneMap[pid] || null }));

    // Sélection explicite de parents (mode « choisir les parents »)
    if (filter?.parent_ids?.length > 0) {
      const targetIds = new Set(filter.parent_ids);
      recipients = recipients.filter(r => targetIds.has(r.parent_id));
    } else if (filter?.parent_phones?.length > 0) {
      // Rétro-compatibilité : sélection par numéro
      const targetPhones = new Set(filter.parent_phones);
      recipients = recipients.filter(r => r.phone_e164 && targetPhones.has(r.phone_e164));
    }

    // Segment « en attente de livraison » : la relance ne vise que les numéros
    // dont un contenu n'est jamais parti. Appliqué APRÈS les filtres de classe
    // pour qu'on puisse relancer une seule classe si besoin.
    if (filter?.pending_delivery) {
      const enAttente = await phonesAwaitingDelivery(schoolId);
      recipients = recipients.filter((r) => r.phone_e164 && enAttente.has(r.phone_e164));
    }

    if (!wantPush) {
      // WhatsApp uniquement : il faut un numéro, dédupliqué (un même numéro
      // peut être partagé par plusieurs parents).
      const seenPhones = new Set();
      recipients = recipients.filter(r => {
        if (!r.phone_e164 || seenPhones.has(r.phone_e164)) return false;
        seenPhones.add(r.phone_e164);
        return true;
      });
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: wantPush ? 'Aucun destinataire trouvé' : 'Aucun numéro WhatsApp trouvé' });
    }

    // Create message log
    const messageType = type || 'text';
    const { data: msgLog, error: logError } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        school_id: schoolId,
        sent_by: req.user.id,
        message_type: messageType,
        content: message || null,
        media_url: mediaUrl || null,
        file_name: fileName || null,
        recipient_filter: filter || {},
        total_recipients: recipients.length,
        status: 'sending',
        category,
        channels,
        ...templateColumns(templateKey, templateParams, templateLang),
      })
      .select()
      .single();

    if (logError) throw logError;

    // Insert recipient records (phone_e164 peut être null en mode push)
    const recipientRecords = recipients.map(r => ({
      message_id: msgLog.id,
      parent_id: r.parent_id,
      phone_e164: r.phone_e164 || '',
      status: 'pending'
    }));

    const { error: recipientsError } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .insert(recipientRecords);
    if (recipientsError) throw recipientsError;

    // Vérifie le numéro Cloud API (seulement si le canal WhatsApp est demandé)
    if (wantWa && !(await isSessionReady(schoolId))) {
      await supabaseAdmin.from('whatsapp_messages').update({ status: 'failed' }).eq('id', msgLog.id);
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée. Connectez le numéro de votre école depuis l\'onglet Connexion, ou choisissez le canal Application.' });
    }

    // L'envoi part en job persistant : il survit à un redémarrage (déploiement,
    // crash) et REPREND là où il s'était arrêté, au lieu de vivre en mémoire du
    // process et d'être perdu. Le job ne transporte que messageId — tout le
    // reste se relit depuis whatsapp_messages / _recipients.
    let queued = true;
    try {
      await enqueueJob({
        type: WHATSAPP_BULK_SEND,
        payload: { message_id: msgLog.id },
        schoolId,
        createdBy: req.user.id,
        // Le seul refus temporaire qui subsiste est « numéro Cloud API non
        // rattaché » : avec les 3 tentatives par défaut le job serait
        // abandonné en trois minutes. Le délai entre tentatives croît (1 min,
        // 2 min, 3 min…) : 10 tentatives laissent ~1 h pour rebrancher le
        // numéro avant d'abandonner.
        maxAttempts: 10,
      });
    } catch (queueError) {
      // Table jobs absente (ADD_JOBS_QUEUE.sql pas encore exécuté) : on garde le
      // comportement d'avant plutôt que de bloquer l'envoi.
      queued = false;
      console.warn('[whatsapp] file indisponible, envoi en direct :', queueError.message);
    }

    res.json({
      success: true,
      messageId: msgLog.id,
      totalRecipients: recipients.length,
      status: 'sending',
      queued,
    });

    if (!queued) {
      runBulkSend({ message_id: msgLog.id }).catch((e) =>
        console.error('[whatsapp] envoi direct en échec :', e.message)
      );
    }

  } catch (error) {
    console.error('Erreur envoi WhatsApp:', error);
    // La réponse est déjà partie avant la boucle d'envoi (envoi en arrière-plan) :
    // sans ce garde, une erreur pendant la boucle faisait lever ERR_HTTP_HEADERS_SENT
    // ici même → rejet non géré → Node tue le process, donc PM2 redémarre et TOUS
    // les envois en cours sont perdus. Même garde que /send-direct.
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SEND DIRECT (to a specific phone) ====================

// POST /send-direct — send a message to a specific phone number
router.post('/send-direct', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { phone, message, type, mediaUrl, fileName, parentId, category: requestedCategory, templateKey, templateParams, templateLang } = req.body;
    const category = resolveCategoryForSending(requestedCategory, req.user?.role);

    if (!phone) {
      return res.status(400).json({ error: 'Numéro de téléphone requis' });
    }
    if (!message && !mediaUrl) {
      return res.status(400).json({ error: 'Message ou média requis' });
    }

    if (!(await isSessionReady(schoolId))) {
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée.' });
    }

    // Parent désabonné (STOP) : on refuse d'écrire le premier. En revanche, si
    // la fenêtre de service est ouverte (le parent vient d'écrire), c'est une
    // RÉPONSE dans une conversation qu'il a lui-même ouverte — la bloquer
    // laisserait sa question sans réponse.
    if (parentId && (await whatsappOptedOut(parentId)) && !(await serviceWindowOpen(phone))) {
      return res.status(400).json({
        error: "Ce parent s'est désabonné de WhatsApp (STOP). Il reste joignable par notification dans l'application.",
      });
    }

    const messageType = type || 'text';

    // Create message log
    const { data: msgLog, error: logError } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        school_id: schoolId,
        sent_by: req.user.id,
        message_type: messageType,
        content: message || null,
        media_url: mediaUrl || null,
        file_name: fileName || null,
        recipient_filter: { direct: true, phone },
        total_recipients: 1,
        status: 'sending',
        category
      })
      .select()
      .single();

    if (logError) throw logError;

    // Insert recipient record
    await supabaseAdmin.from('whatsapp_message_recipients').insert({
      message_id: msgLog.id,
      parent_id: parentId || null,
      phone_e164: phone,
      status: 'pending'
    });

    // Envoi via l'API Cloud
    const result = await sendUnified(schoolId, phone, {
      messageType, message, mediaUrl, fileName,
      templateKey: templateKey || null,
      templateParams: Array.isArray(templateParams) ? templateParams : [],
      templateLang: templateLang || null,
    });

    if (result.success) {
      await supabaseAdmin.from('whatsapp_message_recipients').update({
        status: 'sent',
        provider_msg_id: String(result.data?.msgId || ''),
        sent_at: new Date().toISOString()
      }).eq('message_id', msgLog.id).eq('phone_e164', phone);

      await supabaseAdmin.from('whatsapp_messages').update({
        status: 'completed', sent_count: 1, failed_count: 0, updated_at: new Date().toISOString()
      }).eq('id', msgLog.id);

      res.json({ success: true, messageId: msgLog.id, status: 'sent' });
    } else {
      await supabaseAdmin.from('whatsapp_message_recipients').update({
        status: 'failed',
        error_message: result.message || 'Erreur inconnue'
      }).eq('message_id', msgLog.id).eq('phone_e164', phone);

      await supabaseAdmin.from('whatsapp_messages').update({
        status: 'failed', sent_count: 0, failed_count: 1, updated_at: new Date().toISOString()
      }).eq('id', msgLog.id);

      res.json({ success: false, error: result.message || 'Erreur envoi', messageId: msgLog.id });
    }
  } catch (error) {
    console.error('Erreur envoi direct:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SEND PROGRESS ====================

// GET /messages/:messageId/progress — get send progress
router.get('/messages/:messageId/progress', async (req, res) => {
  try {
    const { messageId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('id, status, total_recipients, sent_count, failed_count, updated_at')
      .eq('id', messageId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Message non trouvé' });

    res.json(data);
  } catch (error) {
    console.error('Erreur progression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== HISTORY ====================

// GET /history — message history
router.get('/history', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { page = 1, limit = 20, category: categoryFilter } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabaseAdmin
      .from('whatsapp_messages')
      .select('*, sender:profiles!whatsapp_messages_sent_by_fkey(first_name, last_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (schoolId) {
      query = query.eq('school_id', schoolId);
    }

    // Filtre par catégorie (rôle ou query param)
    const allowedCats = allowedCategoriesForRole(req.user?.role);
    if (categoryFilter && allowedCats && !allowedCats.includes(categoryFilter)) {
      return res.status(403).json({ error: 'Catégorie non autorisée pour ce rôle' });
    }
    if (categoryFilter) {
      query = query.eq('category', categoryFilter);
    } else if (allowedCats) {
      query = query.in('category', allowedCats);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const messages = data || [];

    // Métriques de suivi par message : vus (par canal) et réponses
    const msgIds = messages.map(m => m.id);
    if (msgIds.length) {
      const metricsByMsg = new Map();
      const recs = await selectInChunks(
        msgIds,
        (chunk) => supabaseAdmin
          .from('whatsapp_message_recipients')
          .select('message_id, status, read_at, read_channel, responded_at')
          .in('message_id', chunk)
      );
      recs.forEach(r => {
        if (!metricsByMsg.has(r.message_id)) {
          metricsByMsg.set(r.message_id, { targeted: 0, sent: 0, read: 0, readApp: 0, readWa: 0, responded: 0 });
        }
        const m = metricsByMsg.get(r.message_id);
        m.targeted++;
        if (r.status === 'sent') m.sent++;
        if (r.read_at) { m.read++; if (r.read_channel === 'app') m.readApp++; else m.readWa++; }
        if (r.responded_at) m.responded++;
      });
      messages.forEach(m => { m.metrics = metricsByMsg.get(m.id) || null; });
    }

    res.json({ messages, total: count || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Erreur historique:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /messages/:messageId/details — get message with recipient details
router.get('/messages/:messageId/details', async (req, res) => {
  try {
    const { messageId } = req.params;

    const schoolId = getSchoolId(req);

    let msgQ = supabaseAdmin
      .from('whatsapp_messages')
      .select('*, sender:profiles!whatsapp_messages_sent_by_fkey(first_name, last_name)')
      .eq('id', messageId);
    if (schoolId) msgQ = msgQ.eq('school_id', schoolId);   // pas d'accès inter-écoles

    const [msgRes, recipientsRes] = await Promise.all([
      msgQ.single(),
      supabaseAdmin
        .from('whatsapp_message_recipients')
        .select('*, parent:profiles(first_name, last_name)')
        .eq('message_id', messageId)
        .order('created_at', { ascending: true })
    ]);

    if (msgRes.error) throw msgRes.error;
    const recipients = recipientsRes.data || [];

    // Classe de chaque destinataire : un nom de parent seul ne dit pas à qui on
    // a écrit. « Mme Alaoui (6ème A) » se relit d'un coup d'œil, et permet de
    // vérifier qu'une campagne a bien visé les bonnes classes.
    const parentIds = [...new Set(recipients.map(r => r.parent_id).filter(Boolean))];
    if (parentIds.length) {
      const links = await selectInChunks(parentIds, (chunk) =>
        supabaseAdmin.from('parent_students').select('parent_id, student_id').in('parent_id', chunk));

      const studentIds = [...new Set((links || []).map(l => l.student_id).filter(Boolean))];
      const students = studentIds.length
        ? await selectInChunks(studentIds, (chunk) =>
            supabaseAdmin
              .from('profiles')
              .select('id, first_name, last_name, level, class_id, classes!fk_profiles_class(name, level)')
              .in('id', chunk))
        : [];

      const studentById = new Map((students || []).map(st => [st.id, st]));
      const childrenByParent = new Map();
      for (const l of links || []) {
        const st = studentById.get(l.student_id);
        if (!st) continue;
        const list = childrenByParent.get(l.parent_id) || [];
        list.push({
          id: st.id,
          name: `${st.first_name || ''} ${st.last_name || ''}`.trim(),
          className: st.classes?.name || null,
          // Niveau de la classe, ou à défaut celui porté par l'élève : sur une
          // campagne large, c'est le niveau qui parle (« tout le 1BAC »), pas
          // la liste des classes une par une.
          classLevel: st.classes?.level || st.level || null,
        });
        childrenByParent.set(l.parent_id, list);
      }

      recipients.forEach(r => {
        const children = childrenByParent.get(r.parent_id) || [];
        r.children = children;
        // Une famille peut avoir plusieurs enfants dans l'école : on liste les
        // classes distinctes, sans répétition.
        r.classNames = [...new Set(children.map(c => c.className).filter(Boolean))];
        r.classLevels = [...new Set(children.map(c => c.classLevel).filter(Boolean))];
      });
    }

    res.json({
      message: msgRes.data,
      recipients,
    });
  } catch (error) {
    console.error('Erreur détails message:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /messages/:messageId/resend — renvoyer le même message à un sous-ensemble
// des destinataires d'origine (non vus / non répondus / non distribués) via le
// canal choisi (app | whatsapp | both). Crée une NOUVELLE entrée « relance »
// pour ne pas écraser le suivi de l'envoi initial.
router.post('/messages/:messageId/resend', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { messageId } = req.params;
    // 'wa_not_sent' : le WhatsApp n'est jamais parti (session tombée en cours
    // de campagne). Distinct de 'undelivered', qui se fie à `status` — lequel
    // passe à 'sent' dès que la notification in-app est créée et masque donc
    // l'échec WhatsApp. C'est le critère à utiliser pour reprendre un envoi
    // interrompu sans redoubler ceux qui ont déjà reçu le message.
    const allowed = ['unread', 'unresponded', 'undelivered', 'wa_not_sent'];
    const criteria = (Array.isArray(req.body?.criteria) ? req.body.criteria : [])
      .filter((c) => allowed.includes(c));
    if (!criteria.length) criteria.push('unread');
    const channel = ['whatsapp', 'app', 'both'].includes(req.body?.channel) ? req.body.channel : 'app';
    // Salutation nominative : une relance nommait jusqu'ici personne, alors que
    // les communications planifiées savaient déjà s'adresser au parent.
    const personalize = req.body?.personalize === true;
    // Planification : ISO, ou null pour un envoi immédiat.
    const scheduledAt = req.body?.scheduled_at && !Number.isNaN(Date.parse(req.body.scheduled_at))
      ? new Date(req.body.scheduled_at)
      : null;
    // Une date déjà passée partait AUSSITÔT, sans rien dire : l'utilisateur
    // croyait avoir programmé un envoi et le voyait partir sous ses yeux. On
    // refuse plutôt, en indiquant l'heure du serveur (un poste mal réglé est
    // la cause la plus fréquente d'un décalage).
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({
        error: `Date de planification déjà passée (${scheduledAt.toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}). `
          + `Il est ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })} au Maroc. `
          + `Choisissez une date future, ou laissez le champ vide pour envoyer maintenant.`,
      });
    }
    const runAfter = scheduledAt ? scheduledAt.toISOString() : null;
    const wantWa = channel !== 'app';
    const wantPush = channel !== 'whatsapp';

    // 1. Message original (scoping école)
    let mq = supabaseAdmin
      .from('whatsapp_messages')
      .select('id, school_id, content, media_url, file_name, message_type, category')
      .eq('id', messageId);
    if (schoolId) mq = mq.eq('school_id', schoolId);
    const { data: orig, error: oErr } = await mq.single();
    if (oErr || !orig) return res.status(404).json({ error: 'Message introuvable' });

    // 2. Destinataires d'origine + filtrage. Priorité à une sélection explicite
    // (cases cochées côté UI) ; sinon union des critères non vus/répondus/échec.
    const { data: recs, error: rErr } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .select('id, parent_id, phone_e164, status, wa_status, read_at, responded_at')
      .eq('message_id', messageId);
    if (rErr) throw rErr;
    const explicitIds = Array.isArray(req.body?.recipient_ids)
      ? req.body.recipient_ids.map(String).filter(Boolean)
      : null;
    let targets;
    if (explicitIds && explicitIds.length) {
      const idSet = new Set(explicitIds);
      targets = (recs || []).filter((r) => idSet.has(String(r.id)));
    } else {
      const match = (r) => criteria.some((c) =>
        c === 'unread' ? !r.read_at
          : c === 'unresponded' ? !r.responded_at
          : c === 'undelivered' ? r.status !== 'sent'
          : c === 'wa_not_sent' ? (!!r.phone_e164 && r.wa_status !== 'sent')
          : false);
      targets = (recs || []).filter(match);
    }
    if (!wantWa) targets = targets.filter((r) => r.parent_id);        // app seul → besoin d'un parent
    if (!wantPush) {                                                   // WhatsApp seul → numéro unique
      const seen = new Set();
      targets = targets.filter((r) => {
        if (!r.phone_e164 || seen.has(r.phone_e164)) return false;
        seen.add(r.phone_e164);
        return true;
      });
    }
    if (!targets.length) return res.status(400).json({ error: 'Aucun destinataire ne correspond aux critères pour ce canal.' });

    // 3. Session WhatsApp requise pour un envoi IMMÉDIAT seulement : une
    //    relance planifiée pour demain n'a pas à exiger une session connectée
    //    maintenant, et le job attendra de toute façon qu'elle revienne.
    if (wantWa && !runAfter && !(await isSessionReady(schoolId))) {
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée. Choisissez le canal Application, planifiez la relance, ou connectez WhatsApp.' });
    }

    // 4. Nouvelle entrée « relance » + destinataires
    const channelsCol = channel === 'app' ? 'push' : channel === 'whatsapp' ? 'whatsapp' : 'both';
    const messageType = orig.message_type || 'text';

    const insertPayload = {
      school_id: orig.school_id,
      sent_by: req.user.id,
      message_type: messageType,
      content: orig.content,
      media_url: orig.media_url,
      file_name: orig.file_name,
      recipient_filter: { resend_of: messageId, criteria },
      total_recipients: targets.length,
      status: runAfter ? 'pending' : 'sending',
      category: orig.category || 'general',
      channels: channelsCol,
      resend_of: messageId,
      personalize,
      scheduled_at: runAfter,
    };
    let { data: msgLog, error: logErr } = await supabaseAdmin
      .from('whatsapp_messages').insert(insertPayload).select('id').single();
    // Migration ADD_RESEND_SCHEDULING.sql pas encore jouée : on retombe sur les
    // colonnes historiques plutôt que de refuser la relance.
    if (logErr && /column|resend_of|personalize|scheduled_at/i.test(logErr.message || '')) {
      console.warn('[resend] colonnes de personnalisation absentes — exécutez ADD_RESEND_SCHEDULING.sql');
      ['resend_of', 'personalize', 'scheduled_at'].forEach((k) => delete insertPayload[k]);
      insertPayload.status = 'sending';
      ({ data: msgLog, error: logErr } = await supabaseAdmin
        .from('whatsapp_messages').insert(insertPayload).select('id').single());
    }
    if (logErr) throw logErr;

    await supabaseAdmin
      .from('whatsapp_message_recipients')
      .insert(targets.map((t) => ({
        message_id: msgLog.id,
        parent_id: t.parent_id,
        phone_e164: t.phone_e164 || '',
        status: 'pending',
      })));

    // L'envoi passe par la FILE DE TRAVAUX, comme un envoi de masse ordinaire.
    //
    // Il tournait auparavant dans une boucle lancée après res.json(), vivant en
    // mémoire du process : un redémarrage pm2 en cours de relance perdait tout
    // le reste sans trace. Passer par le job apporte trois choses d'un coup :
    // la reprise après coupure, la planification (run_after), et la logique
    // par canal déjà écrite dans runBulkSend (personnalisation, répercussion
    // sur le message d'origine).
    let queued = true;
    try {
      await enqueueJob({
        type: WHATSAPP_BULK_SEND,
        payload: { message_id: msgLog.id },
        schoolId: orig.school_id,
        createdBy: req.user.id,
        runAfter,
        // Le seul refus temporaire qui subsiste est « numéro Cloud API non
        // rattaché ». Le délai entre tentatives croît (1 min, 2 min, 3 min…) :
        // 10 tentatives laissent ~1 h pour rebrancher le numéro.
        maxAttempts: 10,
      });
    } catch (queueError) {
      queued = false;
      console.error('[resend] file de travaux indisponible:', queueError.message);
    }

    if (!queued) {
      await supabaseAdmin
        .from('whatsapp_messages')
        .update({ status: 'failed' })
        .eq('id', msgLog.id);
      return res.status(500).json({
        error: "File de travaux indisponible : exécutez ADD_JOBS_QUEUE.sql, la relance n'a pas été lancée.",
      });
    }

    res.json({
      success: true,
      messageId: msgLog.id,
      totalRecipients: targets.length,
      personalize,
      scheduledAt: runAfter,
    });
  } catch (error) {
    console.error('Erreur renvoi message:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== INBOX / MESSAGE LOGS ====================

// GET /message-logs — journaux des messages envoyés, depuis la base locale
// (l'envoi écrit dans whatsapp_messages / whatsapp_message_recipients).
router.get('/message-logs', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, parseInt(req.query.per_page, 10) || 50);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let q = supabaseAdmin
      .from('whatsapp_messages')
      .select('id, content, message_type, status, created_at, total_recipients', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data: msgs, count, error } = await q;
    if (error) throw error;

    // Destinataires (par lots pour éviter la limite d'URL des .in()).
    const ids = (msgs || []).map(m => m.id);
    const recipientsByMsg = new Map();
    if (ids.length > 0) {
      const recs = await selectInChunks(
        ids,
        (chunk) => supabaseAdmin.from('whatsapp_message_recipients').select('message_id, phone_e164, status, error_message, sent_at').in('message_id', chunk)
      );
      recs.forEach(r => {
        if (!recipientsByMsg.has(r.message_id)) recipientsByMsg.set(r.message_id, []);
        recipientsByMsg.get(r.message_id).push(r);
      });
    }

    const messages = (msgs || []).map(m => {
      const recs = recipientsByMsg.get(m.id) || [];
      const to = recs.length === 1 ? recs[0].phone_e164 : `${recs.length || m.total_recipients || 0} destinataire(s)`;
      const failed = recs.find(r => r.status === 'failed');
      let content = m.content;
      if (typeof content !== 'string') { try { content = JSON.stringify(content); } catch { content = ''; } }
      return {
        id: m.id,
        to,
        content,
        rawContent: m.content,
        status: m.status,
        failed_reason: failed?.error_message || null,
        created_at: m.created_at,
        updated_at: m.created_at,
        direction: 'outgoing',
      };
    });

    const lastPage = count ? Math.max(1, Math.ceil(count / perPage)) : 1;
    res.json({ success: true, messages, total: count || 0, currentPage: page, lastPage });
  } catch (error) {
    console.error('Erreur message logs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /conversations — group sent messages by phone number from local DB
router.get('/conversations', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    // Pour pedagogical_manager : pré-calculer les parent_ids autorisés (parents des élèves dans les classes assignées)
    const scopedClassIds = await getScopedClassIds(req);
    let allowedParentIds = null; // null = pas de restriction
    if (scopedClassIds !== null) {
      if (scopedClassIds.length === 0) return res.json({ conversations: [] });
      const { data: scopedStudents } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'student')
        .in('class_id', scopedClassIds);
      const sIds = (scopedStudents || []).map(s => s.id);
      if (sIds.length === 0) return res.json({ conversations: [] });
      const { data: ps } = await supabaseAdmin
        .from('parent_students')
        .select('parent_id')
        .in('student_id', sIds);
      allowedParentIds = new Set((ps || []).map(p => p.parent_id));
      if (allowedParentIds.size === 0) return res.json({ conversations: [] });
    }

    // Get all message recipients with message info, grouped by phone
    let msgQuery = supabaseAdmin
      .from('whatsapp_messages')
      .select('id, content, message_type, media_url, file_name, status, sent_count, failed_count, total_recipients, recipient_filter, created_at, updated_at, category, sender:profiles!whatsapp_messages_sent_by_fkey(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (schoolId) {
      msgQuery = msgQuery.eq('school_id', schoolId);
    }

    // Filtre par catégorie selon le rôle
    const allowedCatsConv = allowedCategoriesForRole(req.user?.role);
    if (allowedCatsConv) {
      msgQuery = msgQuery.in('category', allowedCatsConv);
    }

    // Les 400 campagnes les plus récentes : la boîte est une vue de
    // conversations, pas une archive (l'onglet Historique, lui, remonte tout).
    // Sans cette borne, la requête est de toute façon coupée à 1 000 par
    // PostgREST, mais en silence.
    const { data: messages, error: msgError } = await msgQuery.limit(400);
    if (msgError) throw msgError;

    // Get all recipients
    const messageIds = (messages || []).map(m => m.id);
    let allRecipients = [];
    if (messageIds.length > 0) {
      // Par lots de 50 messages, ET page par page : un seul envoi de masse
      // dépasse à lui seul le millier de destinataires. Sans pagination, les
      // lignes en trop étaient perdues sans bruit — l'envoi partait bien, mais
      // n'apparaissait jamais dans la boîte, et la conversation ne remontait
      // pas en tête de liste.
      for (let i = 0; i < messageIds.length; i += 50) {
        const chunk = messageIds.slice(i, i + 50);
        const recs = await selectPaged(
          () => supabaseAdmin
            .from('whatsapp_message_recipients')
            .select('id, message_id, parent_id, phone_e164, status, error_message, sent_at')
            .in('message_id', chunk)
            .order('id', { ascending: true }),   // ordre stable = pages fiables
          20000,
          'conversations/destinataires',
        );
        allRecipients = allRecipients.concat(recs);
      }
    }

    // Filtre de scope : ne garder que les recipients dont le parent est dans le périmètre
    if (allowedParentIds !== null) {
      allRecipients = allRecipients.filter(r => r.parent_id && allowedParentIds.has(r.parent_id));
    }

    // Les envois « app uniquement » (sans numéro WhatsApp) n'apparaissent pas
    // dans les conversations WhatsApp.
    allRecipients = allRecipients.filter(r => r.phone_e164);

    // Get parent names
    const parentIds = [...new Set(allRecipients.map(r => r.parent_id).filter(Boolean))];
    let parentMap = {};
    if (parentIds.length > 0) {
      const { data: parents } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', parentIds);
      (parents || []).forEach(p => { parentMap[p.id] = p; });
    }

    // Group by phone number to create conversations
    const conversationMap = {};
    const ensureConv = (phone, parentId) => {
      if (!conversationMap[phone]) {
        const parent = parentMap[parentId];
        conversationMap[phone] = {
          phone,
          parentName: parent ? `${parent.first_name} ${parent.last_name}` : null,
          parentId: parentId || null,
          contactRole: parentId ? 'parent' : null,
          messages: [],
          lastMessageAt: null,
          lastIncomingAt: null,
          totalSent: 0,
          // « Annoncés » : envoyés hors fenêtre de 24 h sous forme de simple
          // annonce — le contenu attend la réponse du destinataire.
          totalAnnounced: 0,
          totalFailed: 0,
          totalReceived: 0,
          // Dates du dernier succès et du dernier échec vers ce numéro :
          // elles disent si un échec a depuis été rattrapé par un renvoi.
          lastSentOkAt: null,
          lastFailedAt: null
        };
      } else if (!conversationMap[phone].parentId && parentId) {
        const parent = parentMap[parentId];
        conversationMap[phone].parentId = parentId;
        if (parent) {
          conversationMap[phone].parentName = `${parent.first_name} ${parent.last_name}`;
          conversationMap[phone].contactRole = 'parent';
        }
      }
      return conversationMap[phone];
    };

    // Index par id : avec la pagination, la liste des destinataires peut
    // compter des dizaines de milliers de lignes — une recherche linéaire par
    // ligne rendrait la boîte lente à ouvrir.
    const messageById = new Map((messages || []).map(m => [m.id, m]));

    allRecipients.forEach(r => {
      const phone = r.phone_e164;
      ensureConv(phone, r.parent_id);

      const msg = messageById.get(r.message_id);
      if (msg) {
        const isCompReport = msg.recipient_filter?.type === 'comprehensive_report';
        conversationMap[phone].messages.push({
          id: r.id,
          messageId: r.message_id,
          content: msg.content,
          messageType: msg.message_type,
          mediaUrl: msg.media_url,
          fileName: msg.file_name,
          status: r.status,
          errorMessage: r.error_message,
          sentAt: r.sent_at,
          // Le fil suit la date d'ENVOI, pas celle de création du message.
          // Une relance programmée est créée au moment du clic (1 h du matin)
          // mais ne part qu'à l'heure prévue (9 h 33) : afficher la création
          // datait le message de la nuit et empêchait la conversation de
          // remonter en tête alors que l'envoi venait de partir.
          // Repli sur created_at pour un envoi encore en attente ou échoué,
          // qui n'a pas de date d'envoi.
          createdAt: r.sent_at || msg.created_at,
          senderName: isCompReport ? `📊 Rapport complet` : (msg.sender ? `${msg.sender.first_name} ${msg.sender.last_name}` : null),
          studentName: isCompReport ? (msg.recipient_filter?.student_name || '') : undefined,
          direction: 'outgoing',
          isComprehensiveReport: isCompReport
        });
      }

      const conv = conversationMap[phone];
      const at = r.sent_at || msg?.created_at || null;
      if (r.status === 'sent') {
        conv.totalSent++;
        if (at && (!conv.lastSentOkAt || new Date(at) > new Date(conv.lastSentOkAt))) conv.lastSentOkAt = at;
      }
      if (r.status === 'announced') conv.totalAnnounced++;
      if (r.status === 'failed') {
        conv.totalFailed++;
        if (at && (!conv.lastFailedAt || new Date(at) > new Date(conv.lastFailedAt))) conv.lastFailedAt = at;
      }
    });

    // ── Messages ENTRANTS (réponses des parents, des professeurs, visiteurs) ──
    // whatsapp_incoming_messages porte le message reçu ET, le cas échéant, la
    // réponse automatique du chatbot (ai_response_text) : les deux sont
    // réinjectés dans le fil pour que l'école voie la conversation complète.
    // Les colonnes media_* n'existent qu'après ADD_WHATSAPP_INBOX.sql. Les
    // demander sans repli faisait tomber TOUTE la boîte de réception en 500
    // tant que la migration n'était pas jouée : on réessaie sans elles.
    const INCOMING_BASE = 'id, phone_e164, parent_id, message_text, ai_response_text, ai_response_sent, received_at, category';
    const INCOMING_MEDIA = ', media_path, media_type, media_mimetype, media_filename';

    const incomingQuery = (columns) => () => {
      let q = supabaseAdmin
        .from('whatsapp_incoming_messages')
        .select(columns)
        .order('received_at', { ascending: false });
      if (schoolId) q = q.eq('school_id', schoolId);
      if (allowedCatsConv) q = q.in('category', allowedCatsConv);
      return q;
    };

    let incomingRows = [];
    try {
      incomingRows = await selectPaged(incomingQuery(INCOMING_BASE + INCOMING_MEDIA), 3000, 'conversations/entrants');
    } catch (incError) {
      if (!/media_(path|type|mimetype|filename)|column/i.test(incError.message || '')) throw incError;
      console.warn('[conversations] colonnes média absentes — exécutez ADD_WHATSAPP_INBOX.sql');
      incomingRows = await selectPaged(incomingQuery(INCOMING_BASE), 3000, 'conversations/entrants');
    }

    let incoming = incomingRows || [];
    // Périmètre pédagogique restreint : on ne montre que les parents autorisés
    // (les entrants sans parent identifié — profs, inconnus — sont masqués).
    if (allowedParentIds !== null) {
      incoming = incoming.filter(r => r.parent_id && allowedParentIds.has(r.parent_id));
    }

    // Noms des parents qui n'apparaissaient que côté entrant
    const newParentIds = [...new Set(
      incoming.map(r => r.parent_id).filter(id => id && !parentMap[id])
    )];
    if (newParentIds.length > 0) {
      const extraParents = await selectInChunks(newParentIds, (chunk) =>
        supabaseAdmin.from('profiles').select('id, first_name, last_name').in('id', chunk)
      );
      extraParents.forEach(p => { parentMap[p.id] = p; });
    }

    incoming.forEach(r => {
      const phone = r.phone_e164;
      if (!phone) return;
      const conv = ensureConv(phone, r.parent_id);
      conv.messages.push({
        id: `in-${r.id}`,
        content: r.message_text || '',
        // Le binaire vit dans le bucket PRIVE : on ne renvoie pas d'URL ici,
        // seulement de quoi en demander une signee a l'ouverture du fil.
        messageType: r.media_type || 'text',
        mediaMessageId: r.media_path ? r.id : null,
        mediaType: r.media_type || null,
        mediaMimetype: r.media_mimetype || null,
        fileName: r.media_filename || null,
        status: 'received',
        createdAt: asUtc(r.received_at),
        direction: 'incoming'
      });
      conv.totalReceived++;
      const receivedAt = asUtc(r.received_at);
      if (!conv.lastIncomingAt || new Date(receivedAt) > new Date(conv.lastIncomingAt)) {
        conv.lastIncomingAt = receivedAt;
      }
      if (r.ai_response_text) {
        conv.messages.push({
          id: `bot-${r.id}`,
          content: r.ai_response_text,
          messageType: 'text',
          status: r.ai_response_sent ? 'sent' : 'pending',
          // +1 s pour que la réponse du bot se place après la question
          createdAt: new Date(new Date(asUtc(r.received_at)).getTime() + 1000).toISOString(),
          senderName: '🤖 Chatbot',
          direction: 'outgoing',
          isBot: true
        });
      }
    });

    // ── Réponses du CHATBOT (journal des envois automatiques) ────────────────
    // Sans elles, l'école voit la question du parent puis un blanc, alors que
    // le robot a repondu menu, PDF ou confirmation. On se limite aux fils deja
    // constitues : un envoi n'existe jamais sans conversation.
    if (Object.keys(conversationMap).length > 0) {
      const logQuery = () => {
        let q = supabaseAdmin
          .from('whatsapp_outgoing_log')
          .select('id, phone_e164, body, message_type, media_url, file_name, status, error_message, created_at, source')
          .order('created_at', { ascending: false });
        if (schoolId) q = q.eq('school_id', schoolId);
        return q;
      };
      let outLog = [];
      let outErr = null;
      try {
        outLog = await selectPaged(logQuery, 4000, 'conversations/journal');
      } catch (e) {
        outErr = e;
      }

      // Table absente (ADD_WHATSAPP_INBOX.sql pas encore joue) : on continue
      // sans ces messages plutot que de casser toute la boite de reception.
      if (outErr) {
        console.warn('[conversations] journal des envois indisponible:', outErr.message);
      } else {
        (outLog || []).forEach((o) => {
          const conv = conversationMap[o.phone_e164];
          if (!conv) return;
          conv.messages.push({
            id: `bot-log-${o.id}`,
            content: o.body || '',
            messageType: o.message_type || 'text',
            mediaUrl: o.media_url || null,
            fileName: o.file_name || null,
            status: o.status,
            errorMessage: o.error_message,
            createdAt: o.created_at,
            sentAt: o.created_at,
            senderName: '🤖 Chatbot',
            direction: 'outgoing',
            isBot: true,
          });
        });
      }
    }

    // ── Identité des numéros sans parent rattaché (professeurs, personnel) ────
    const unknownPhones = Object.values(conversationMap)
      .filter(c => !c.parentName)
      .map(c => c.phone);
    if (unknownPhones.length > 0) {
      let staffQuery = supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, phone, role')
        .not('phone', 'is', null)
        .in('role', ['teacher', 'admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager', 'finance_manager', 'transport_manager', 'driver']);
      if (schoolId) staffQuery = staffQuery.eq('school_id', schoolId);
      const { data: staff } = await staffQuery;
      // Rapprochement sur les 9 derniers chiffres : les numéros sont saisis
      // avec ou sans indicatif (0612…, +212612…, 212612…).
      const tail = (p) => (p || '').replace(/\D/g, '').slice(-9);
      const staffByTail = {};
      (staff || []).forEach(s => { const t = tail(s.phone); if (t.length === 9 && !staffByTail[t]) staffByTail[t] = s; });
      unknownPhones.forEach(phone => {
        const match = staffByTail[tail(phone)];
        if (match) {
          conversationMap[phone].parentName = `${match.first_name} ${match.last_name}`;
          conversationMap[phone].contactRole = match.role;
        }
      });
    }

    // Sort messages within each conversation and set lastMessageAt
    const conversations = Object.values(conversationMap).map(conv => {
      // Anti-doublon : la reponse du chatbot etait deja recopiee sur le message
      // entrant (ai_response_text). Depuis le journal des envois, elle arrive
      // aussi par sa propre ligne — on garde celle du journal, plus complete.
      const logged = conv.messages.filter((m) => String(m.id).startsWith('bot-log-'));
      if (logged.length) {
        conv.messages = conv.messages.filter((m) => {
          if (!String(m.id).startsWith('bot-') || String(m.id).startsWith('bot-log-')) return true;
          const body = String(m.content || '').trim();
          const t = new Date(m.createdAt).getTime();
          return !logged.some((l) =>
            String(l.content || '').trim() === body &&
            Math.abs(new Date(l.createdAt).getTime() - t) < 120000);
        });
      }
      // Un échec suivi d'un envoi réussi vers le MÊME numéro n'est plus un
      // problème : c'est le cas de tous les échecs hérités de l'ancien
      // fournisseur, renvoyés depuis avec l'API Cloud. Les garder dans le
      // filtre « Échoués » noierait les vrais échecs à traiter.
      conv.hasUnresolvedFailure = !!conv.lastFailedAt &&
        (!conv.lastSentOkAt || new Date(conv.lastFailedAt) > new Date(conv.lastSentOkAt));

      conv.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const last = conv.messages[conv.messages.length - 1];
      conv.lastMessageAt = last ? last.createdAt : null;
      conv.messageCount = conv.messages.length;
      // « À traiter » : le dernier message du fil vient du contact et aucune
      // réponse (humaine ou chatbot) n'a suivi.
      conv.awaitingReply = !!last && last.direction === 'incoming';
      if (!conv.contactRole) conv.contactRole = 'inconnu';
      return conv;
    });

    // Sort conversations by last message date
    conversations.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

    res.json({ success: true, conversations });
  } catch (error) {
    console.error('Erreur conversations:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== MEDIA UPLOAD ====================

// ==================== ENGAGEMENT (dashboard parents) ====================

// Récupère messages + destinataires du hub sur une fenêtre glissante,
// avec le filtre de catégories du rôle (même logique que /history).
async function fetchEngagementRows(req, days) {
  const schoolId = getSchoolId(req);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  let msgQuery = supabaseAdmin
    .from('whatsapp_messages')
    .select('id, channels, category, message_type, created_at, total_recipients')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (schoolId) msgQuery = msgQuery.eq('school_id', schoolId);
  const allowedCats = allowedCategoriesForRole(req.user?.role);
  if (allowedCats) msgQuery = msgQuery.in('category', allowedCats);
  const { data: messages, error } = await msgQuery;
  if (error) throw error;

  const msgIds = (messages || []).map(m => m.id);
  let recipients = [];
  if (msgIds.length) {
    recipients = await selectInChunks(
      msgIds,
      (chunk) => supabaseAdmin
        .from('whatsapp_message_recipients')
        .select('message_id, parent_id, phone_e164, status, wa_status, push_status, notification_id, provider_msg_id, delivered_at, read_at, read_channel, responded_at, sent_at, created_at')
        .in('message_id', chunk)
    );
  }
  return { schoolId, messages: messages || [], recipients };
}

// GET /engagement/summary?days=30 — métriques globales du hub communication
router.get('/engagement/summary', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const { schoolId, messages, recipients } = await fetchEngagementRows(req, days);

    // Totaux par canal
    let reached = 0, failed = 0, waSent = 0, waDelivered = 0, pushSent = 0, appInbox = 0;
    let readTotal = 0, readApp = 0, readWa = 0, responded = 0;
    const byDayMap = new Map(); // 'YYYY-MM-DD' -> { sent, read, responded }
    const dayKey = (iso) => String(iso).slice(0, 10);
    const bump = (iso, field) => {
      if (!iso) return;
      const k = dayKey(iso);
      if (!byDayMap.has(k)) byDayMap.set(k, { date: k, sent: 0, read: 0, responded: 0 });
      byDayMap.get(k)[field]++;
    };

    for (const r of recipients) {
      if (r.status === 'sent') { reached++; bump(r.sent_at || r.created_at, 'sent'); }
      else if (r.status === 'failed') failed++;
      if (r.provider_msg_id) waSent++;
      if (r.delivered_at) waDelivered++;
      if (r.push_status === 'sent') pushSent++;
      if (r.notification_id) appInbox++;
      if (r.read_at) {
        readTotal++;
        bump(r.read_at, 'read');
        if (r.read_channel === 'app') readApp++; else readWa++;
      }
      if (r.responded_at) { responded++; bump(r.responded_at, 'responded'); }
    }

    // Couverture école : parents, app installée, opt-out, numéro WhatsApp
    let parentsTotal = 0, parentsWithApp = 0, parentsOptedOut = 0, parentsWithWhatsapp = 0, parentsOptedIn = 0;
    if (schoolId) {
      const { data: parentProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'parent')
        .eq('school_id', schoolId);
      const pIds = (parentProfiles || []).map(p => p.id);
      parentsTotal = pIds.length;
      if (pIds.length) {
        const subs = await selectInChunks(pIds, (chunk) =>
          supabaseAdmin.from('push_subscriptions').select('user_id').in('user_id', chunk));
        parentsWithApp = new Set((subs || []).map(s => s.user_id)).size;
        const waContacts = await selectInChunks(pIds, (chunk) =>
          supabaseAdmin.from('parent_contacts').select('parent_id, consent_status').eq('channel', 'whatsapp').in('parent_id', chunk));
        // Un parent compte une fois, au statut le plus fort qu'il porte : un
        // refus l'emporte sur un accord, sinon ajouter un second numéro
        // suffirait à effacer un STOP.
        const withWa = new Set();
        const rank = { opted_out: 3, opted_in: 2, pending: 1 };
        const statusByParent = new Map();
        (waContacts || []).forEach(c => {
          withWa.add(c.parent_id);
          const st = c.consent_status || 'pending';
          const cur = statusByParent.get(c.parent_id);
          if (!cur || (rank[st] || 0) > (rank[cur] || 0)) statusByParent.set(c.parent_id, st);
        });
        parentsWithWhatsapp = withWa.size;
        for (const st of statusByParent.values()) {
          if (st === 'opted_out') parentsOptedOut++;
          else if (st === 'opted_in') parentsOptedIn++;
        }
      }
    }

    // Timeline complète (jours sans activité inclus) — bornée à 90 points
    const byDay = [];
    const nDays = Math.min(days, 90);
    for (let i = nDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const k = d.toISOString().slice(0, 10);
      byDay.push(byDayMap.get(k) || { date: k, sent: 0, read: 0, responded: 0 });
    }

    res.json({
      days,
      totals: {
        messages: messages.length,
        recipients: recipients.length,
        reached, failed,
        readTotal, readApp, readWa, responded,
        readRate: reached ? Math.round((readTotal / reached) * 100) : 0,
        responseRate: reached ? Math.round((responded / reached) * 100) : 0,
      },
      channels: { waSent, waDelivered, pushSent, appInbox },
      coverage: {
        parentsTotal, parentsWithApp, parentsOptedOut, parentsWithWhatsapp, parentsOptedIn,
        // Taux de consentement tracé, sur les parents joignables par WhatsApp.
        consentRate: parentsWithWhatsapp ? Math.round((parentsOptedIn / parentsWithWhatsapp) * 100) : 0,
      },
      byDay,
    });
  } catch (error) {
    console.error('Erreur engagement summary:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /engagement/parents?days=90 — engagement par parent (qui lit, qui répond, par quel canal)
router.get('/engagement/parents', async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 90));
    const { recipients } = await fetchEngagementRows(req, days);

    // Agrégation par parent
    const byParent = new Map();
    for (const r of recipients) {
      if (!r.parent_id) continue;
      if (!byParent.has(r.parent_id)) {
        byParent.set(r.parent_id, {
          parent_id: r.parent_id,
          phone: r.phone_e164 || null,
          sent: 0, reached: 0, failed: 0,
          waSent: 0, pushSent: 0,
          read: 0, readApp: 0, readWa: 0,
          responded: 0,
          lastReadAt: null, lastRespondedAt: null, lastSentAt: null,
        });
      }
      const p = byParent.get(r.parent_id);
      p.sent++;
      if (r.status === 'sent') p.reached++;
      if (r.status === 'failed') p.failed++;
      if (r.provider_msg_id) p.waSent++;
      if (r.push_status === 'sent') p.pushSent++;
      if (r.read_at) {
        p.read++;
        if (r.read_channel === 'app') p.readApp++; else p.readWa++;
        if (!p.lastReadAt || r.read_at > p.lastReadAt) p.lastReadAt = r.read_at;
      }
      if (r.responded_at) {
        p.responded++;
        if (!p.lastRespondedAt || r.responded_at > p.lastRespondedAt) p.lastRespondedAt = r.responded_at;
      }
      if (r.sent_at && (!p.lastSentAt || r.sent_at > p.lastSentAt)) p.lastSentAt = r.sent_at;
    }

    const parentIds = [...byParent.keys()];
    if (parentIds.length) {
      // Noms
      const profiles = await selectInChunks(parentIds, (chunk) =>
        supabaseAdmin.from('profiles').select('id, first_name, last_name').in('id', chunk));
      (profiles || []).forEach(pr => {
        const p = byParent.get(pr.id);
        if (p) p.name = `${pr.first_name || ''} ${pr.last_name || ''}`.trim() || 'Parent';
      });
      // App installée
      const subs = await selectInChunks(parentIds, (chunk) =>
        supabaseAdmin.from('push_subscriptions').select('user_id').in('user_id', chunk));
      const appIds = new Set((subs || []).map(s => s.user_id));
      // Opt-out WhatsApp
      const optContacts = await selectInChunks(parentIds, (chunk) =>
        supabaseAdmin.from('parent_contacts').select('parent_id, consent_status').eq('channel', 'whatsapp').in('parent_id', chunk));
      const optedIds = new Set((optContacts || []).filter(c => c.consent_status === 'opted_out').map(c => c.parent_id));

      for (const p of byParent.values()) {
        p.hasApp = appIds.has(p.parent_id);
        p.optedOut = optedIds.has(p.parent_id);
        // Canal dominant de lecture
        p.preferredChannel = p.readApp > p.readWa ? 'app' : (p.readWa > 0 ? 'whatsapp' : (p.hasApp ? 'app' : 'whatsapp'));
        // Segment d'engagement
        if (p.reached === 0) p.segment = 'injoignable';
        else if (p.responded > 0) p.segment = 'reactif';
        else if (p.read > 0) p.segment = 'lecteur';
        else p.segment = 'silencieux';
      }
    }

    const parents = [...byParent.values()].sort((a, b) => (b.responded - a.responded) || (b.read - a.read) || (b.sent - a.sent));
    res.json({ days, parents, total: parents.length });
  } catch (error) {
    console.error('Erreur engagement parents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /upload — upload d'un média (base64) vers le bucket public partagé.
// Passe par uploadBuffer (utils/storage.js) qui garantit l'existence du bucket
// (ensureBuckets) → fini l'erreur « Bucket not found » du bucket whatsapp-media
// jamais créé. Sert l'onglet Parents ET le planificateur.
router.post('/upload', async (req, res) => {
  try {
    const { base64, mimetype } = req.body;
    if (!base64) return res.status(400).json({ error: 'Fichier base64 requis' });

    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const ext = (mimetype || '').split('/')[1] || 'bin';
    const file = {
      buffer,
      mimetype: mimetype || 'application/octet-stream',
      originalname: `wa-media.${ext}`,
    };

    const { publicUrl } = await uploadBuffer({ bucket: BUCKET_PUBLIC, folder: 'whatsapp-media', file, prefix: 'wa' });
    res.json({ success: true, publicUrl });
  } catch (error) {
    console.error('Erreur upload média:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== SESSION STATUS ====================

// GET /session-status — état du numéro Cloud API de cette école
router.get('/session-status', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ connected: false, status: 'no_school', provider: 'cloud' });

    const { data: row } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .select('phone_number, phone_number_id, session_name, last_connected_at, status')
      .eq('school_id', schoolId)
      .maybeSingle();

    // Aucun numéro déclaré : l'école doit passer par l'onboarding Cloud API.
    if (!row?.phone_number_id) {
      return res.json({ connected: false, status: 'no_session', session: null, provider: 'cloud' });
    }

    res.json({
      connected: row.status === 'connected',
      status: row.status || 'pending_verification',
      provider: 'cloud',
      session: {
        id: schoolId, // identifiant logique (utilisé pour DELETE)
        name: row.session_name || null,
        phone: row.phone_number || null,
        phone_number_id: row.phone_number_id,
        status: row.status || 'pending_verification',
        last_connected_at: row.last_connected_at || null,
      },
    });
  } catch (error) {
    console.error('Erreur statut session:', error);
    res.json({ connected: false, error: error.message });
  }
});

// GET /demo-parent-qr — QR du mode démo commercial (école principale).
// Renvoie le lien wa.me (numéro WhatsApp de l'école + mot-clé pré-rempli) et son
// QR : un prospect le scanne → envoie « DEMO PARENT » → devient parent d'un
// élève de la classe démo. 404 si l'école n'a pas de config démo activée.
router.get('/demo-parent-qr', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const { data: cfg } = await supabaseAdmin
      .from('demo_parent_configs')
      .select('class_id, keyword, enabled')
      .eq('school_id', schoolId)
      .eq('enabled', true)
      .maybeSingle();
    if (!cfg) return res.status(404).json({ error: 'Mode démo non activé pour cette école (exécuter SEED_CLASSE_DEMO.sql)' });

    // Numéro WhatsApp de l'école : état Cloud API, sinon table de mapping
    const status = await getStatus(schoolId);
    let phone = status?.phone || null;
    if (!phone) {
      const { data: row } = await supabaseAdmin
        .from('whatsapp_school_sessions')
        .select('phone_number, status')
        .eq('school_id', schoolId)
        .maybeSingle();
      phone = row?.phone_number || null;
    }
    if (!phone) {
      return res.json({ success: false, error: 'Session WhatsApp non connectée : connectez d\'abord le numéro de l\'école (onglet Connexion).' });
    }

    const digits = String(phone).replace(/[^0-9]/g, '');
    const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(cfg.keyword || 'DEMO PARENT')}`;
    const QRCode = (await import('qrcode')).default;
    const qrDataUrl = await QRCode.toDataURL(waLink, { width: 512, margin: 2 });

    const { demoRemainingCount } = await import('../services/whatsapp/chatbot/demoParent.js');
    const counts = await demoRemainingCount(cfg.class_id);

    res.json({
      success: true,
      waLink,
      qrDataUrl,
      keyword: cfg.keyword || 'DEMO PARENT',
      phone: `+${digits}`,
      total: counts.total,
      remaining: counts.remaining,
    });
  } catch (error) {
    console.error('Erreur demo-parent-qr:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== CLOUD API ONBOARDING ====================

// POST /cloud/add-number — déclare le numéro de l'école sous le WABA central
// et déclenche l'envoi du code de vérification (SMS/appel).
// Body : { cc?, phone, verified_name, code_method? }
router.post('/cloud/add-number', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const { cc = '212', phone, verified_name, code_method = 'SMS' } = req.body || {};
    if (!phone || !verified_name) {
      return res.status(400).json({ error: 'Numéro et nom affiché requis' });
    }
    const cleanPhone = String(phone).replace(/[^\d]/g, '');

    const add = await cloud.addPhoneNumber({ cc, phone: cleanPhone, verifiedName: verified_name });
    if (!add.success) return res.status(400).json({ error: add.message });

    // Enregistre le mapping (en attente de vérification)
    const { error: upErr } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .upsert({
        school_id: schoolId,
        provider: 'cloud',
        phone_number_id: add.phoneNumberId,
        session_name: verified_name,
        phone_number: `+${cc}${cleanPhone}`,
        status: 'pending_verification',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'school_id' });
    if (upErr) return res.status(500).json({ error: upErr.message });
    cloud.invalidateCache(schoolId);

    const rc = await cloud.requestCode(add.phoneNumberId, code_method, 'fr');
    if (!rc.success) {
      return res.status(400).json({ error: rc.message, phone_number_id: add.phoneNumberId });
    }
    res.json({ success: true, phone_number_id: add.phoneNumberId, code_method });
  } catch (error) {
    console.error('Erreur cloud add-number:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// POST /cloud/verify — vérifie le code reçu et active le numéro pour Cloud API.
// Body : { code }
router.post('/cloud/verify', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Code de vérification requis' });

    const { data: row } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .select('phone_number_id')
      .eq('school_id', schoolId)
      .maybeSingle();
    const pnid = row?.phone_number_id;
    if (!pnid) return res.status(400).json({ error: 'Aucun numéro en attente. Recommencez l\'ajout.' });

    const vc = await cloud.verifyCode(pnid, code);
    if (!vc.success) return res.status(400).json({ error: vc.message });

    // Active le numéro pour la messagerie Cloud API (PIN 2FA généré).
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const reg = await cloud.registerNumber(pnid, pin);

    await supabaseAdmin
      .from('whatsapp_school_sessions')
      .update({ status: 'connected', last_connected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('school_id', schoolId);
    cloud.invalidateCache(schoolId);

    res.json({
      success: true,
      registered: reg.success,
      // Le PIN n'est utile que pour une future ré-inscription — on le renvoie une fois.
      pin: reg.success ? pin : null,
      warning: reg.success ? null : `Numéro vérifié mais activation Cloud API : ${reg.message}`,
    });
  } catch (error) {
    console.error('Erreur cloud verify:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// POST /inbox/voice — note vocale enregistree au micro depuis l'application.
// Body : { phone, base64, mimetype, parentId? }
//
// L'enregistrement arrive dans le format du navigateur (WebM sur Chrome, Ogg
// sur Firefox, MP4 sur Safari) ; voiceNote.js le remet au format attendu par
// l'API Cloud avant l'envoi.
router.post('/inbox/voice', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { phone, base64, mimetype, parentId } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Numéro de téléphone requis' });
    if (!base64) return res.status(400).json({ error: 'Enregistrement vide' });

    if (!(await isSessionReady(schoolId))) {
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée.' });
    }

    // Même règle que pour un message écrit : on n'écrit pas le premier à un
    // parent désabonné, sauf s'il vient d'ouvrir la conversation.
    if (parentId && (await whatsappOptedOut(parentId)) && !(await serviceWindowOpen(phone))) {
      return res.status(400).json({
        error: "Ce parent s'est désabonné de WhatsApp (STOP). Il reste joignable par notification dans l'application.",
      });
    }

    const raw = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!raw.length) return res.status(400).json({ error: 'Enregistrement illisible' });
    if (raw.length > 16 * 1024 * 1024) {
      return res.status(400).json({ error: 'Note vocale trop longue (16 Mo maximum).' });
    }

    let audio;
    try {
      audio = await prepareVoiceNote(raw, mimetype);
    } catch (e) {
      // ffmpeg absent : le message doit être explicite, sinon l'école croit à
      // une panne alors qu'il manque un paquet sur le serveur.
      const missing = /introuvable|ENOENT/i.test(e.message || '');
      return res.status(400).json({
        error: missing
          ? "Conversion audio indisponible sur le serveur : installez ffmpeg (apt install ffmpeg), ou enregistrez depuis Firefox ou Safari."
          : `Conversion de l'enregistrement impossible : ${e.message}`,
      });
    }

    // Trace dans l'historique, comme un envoi direct : la note apparaît dans le
    // fil de la conversation et dans les journaux de l'école.
    const { data: msgLog } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        school_id: schoolId,
        sent_by: req.user.id,
        message_type: 'audio',
        content: '🎤 Note vocale',
        file_name: audio.fileName,
        recipient_filter: { direct: true, phone, voice: true },
        total_recipients: 1,
        status: 'sending',
        category: resolveCategoryForSending(null, req.user?.role),
      })
      .select()
      .single();

    if (msgLog) {
      await supabaseAdmin.from('whatsapp_message_recipients').insert({
        message_id: msgLog.id, parent_id: parentId || null, phone_e164: phone, status: 'pending',
      });
    }

    const result = await sendMediaBuffer(schoolId, phone, audio.buffer, {
      type: 'audio', fileName: audio.fileName, mimetype: audio.mimetype,
    });

    if (msgLog) {
      await supabaseAdmin.from('whatsapp_message_recipients').update(
        result.success
          ? { status: 'sent', provider_msg_id: String(result.data?.msgId || ''), sent_at: new Date().toISOString() }
          : { status: 'failed', error_message: result.message || 'Erreur envoi' },
      ).eq('message_id', msgLog.id).eq('phone_e164', phone);

      await supabaseAdmin.from('whatsapp_messages').update({
        status: result.success ? 'completed' : 'failed',
        sent_count: result.success ? 1 : 0,
        failed_count: result.success ? 0 : 1,
        updated_at: new Date().toISOString(),
      }).eq('id', msgLog.id);
    }

    if (!result.success) return res.status(400).json({ error: result.message || 'Envoi refusé par WhatsApp' });
    res.json({ success: true, messageId: msgLog?.id || null });
  } catch (error) {
    console.error('Erreur note vocale:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /inbox/media-urls — URL signées des pièces jointes d'un fil.
// Les binaires reçus (notes vocales surtout) vivent dans le bucket PRIVÉ : rien
// ne doit être servi par une URL devinable. Le front demande donc des liens
// courts au moment d'ouvrir une conversation, et seulement pour celle-ci.
router.post('/inbox/media-urls', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean).slice(0, 100) : [];
    if (!ids.length) return res.json({ urls: {} });

    let q = supabaseAdmin
      .from('whatsapp_incoming_messages')
      .select('id, media_path, school_id')
      .in('id', ids);
    if (schoolId) q = q.eq('school_id', schoolId);   // scope école
    const { data: rows, error } = await q;
    // Migration pas encore jouée : aucune pièce jointe n'existe, on renvoie
    // une liste vide plutôt qu'une erreur qui casserait l'ouverture du fil.
    if (error && /media_path|column/i.test(error.message || '')) {
      console.warn('[inbox] colonnes média absentes — exécutez ADD_WHATSAPP_INBOX.sql');
      return res.json({ urls: {} });
    }
    if (error) throw error;

    const { signedUrl } = await import('../utils/storage.js');
    const urls = {};
    for (const row of rows || []) {
      if (!row.media_path) continue;
      const url = await signedUrl(row.media_path, 3600);
      if (url) urls[row.id] = url;
    }
    res.json({ urls });
  } catch (error) {
    console.error('Erreur inbox media-urls:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /consent-stats — répartition du consentement WhatsApp des parents de
// l'école. Meta demande de pouvoir prouver l'accord de chaque destinataire :
// ce taux dit où en est l'école, à côté de la qualité du numéro.
router.get('/consent-stats', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    // Parents de l'école, puis leurs contacts WhatsApp (par lots : un .in()
    // avec trop d'IDs dépasse la longueur d'URL de PostgREST).
    const { data: parents } = await supabaseAdmin
      .from('profiles').select('id').eq('role', 'parent').eq('school_id', schoolId);
    const parentIds = (parents || []).map((p) => p.id);
    if (!parentIds.length) {
      return res.json({ success: true, stats: { total: 0, opted_in: 0, pending: 0, opted_out: 0, rate: 0 } });
    }

    const contacts = await selectInChunks(parentIds, (chunk) =>
      supabaseAdmin.from('parent_contacts')
        .select('parent_id, consent_status')
        .in('parent_id', chunk)
        .eq('channel', 'whatsapp'));

    // Un parent compte une seule fois, au statut le plus fort qu'il porte :
    // un refus l'emporte sur un accord, sinon il suffirait d'ajouter un
    // second numéro pour effacer un STOP.
    const byParent = new Map();
    const rank = { opted_out: 3, opted_in: 2, pending: 1 };
    for (const c of contacts || []) {
      const status = c.consent_status || 'pending';
      const current = byParent.get(c.parent_id);
      if (!current || (rank[status] || 0) > (rank[current] || 0)) byParent.set(c.parent_id, status);
    }

    const stats = { total: byParent.size, opted_in: 0, pending: 0, opted_out: 0, rate: 0 };
    for (const status of byParent.values()) {
      if (status === 'opted_in') stats.opted_in++;
      else if (status === 'opted_out') stats.opted_out++;
      else stats.pending++;
    }
    stats.rate = stats.total ? Math.round((stats.opted_in / stats.total) * 100) : 0;

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Erreur consent-stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ÉTAT ET NOM AFFICHÉ DU NUMÉRO ====================

// GET /cloud/number-status — ce que Meta sait du numéro : nom affiché et son
// examen, vérification, qualité, palier d'envoi. C'est ici que l'école voit si
// son nom s'affichera chez les parents qui n'ont pas enregistré le contact.
router.get('/cloud/number-status', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const result = await cloud.getNumberInfo(schoolId);
    if (!result.success) return res.status(400).json({ error: result.message });
    res.json({ success: true, number: result.number });
  } catch (error) {
    console.error('Erreur cloud number-status:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// POST /cloud/display-name — demande l'examen d'un nouveau nom affiché.
// Body : { name }
router.post('/cloud/display-name', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const name = String(req.body?.name || '').trim();
    if (name.length < 3) return res.status(400).json({ error: 'Nom affiché trop court.' });

    const result = await cloud.requestDisplayName(schoolId, name);
    if (!result.success) return res.status(400).json({ error: result.message });

    // Le nom local suit la demande : c'est celui que l'école vient de choisir,
    // même si Meta ne l'appliquera qu'après examen.
    await supabaseAdmin
      .from('whatsapp_school_sessions')
      .update({ session_name: name, updated_at: new Date().toISOString() })
      .eq('school_id', schoolId);
    cloud.invalidateCache(schoolId);

    const refreshed = await cloud.getNumberInfo(schoolId);
    res.json({ success: true, number: refreshed.success ? refreshed.number : null });
  } catch (error) {
    console.error('Erreur cloud display-name:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== PROFIL DU NUMÉRO (Cloud API) ====================
//
// Un numéro rattaché à l'API Cloud ne s'ouvre plus dans l'application
// WhatsApp : sa photo de profil et sa fiche entreprise ne peuvent plus être
// changées depuis le téléphone. Ces deux routes rendent la main à l'école.

// Catégories d'activité acceptées par Meta pour la fiche entreprise.
const WA_VERTICALS = [
  'OTHER', 'AUTO', 'BEAUTY', 'APPAREL', 'EDU', 'ENTERTAIN', 'EVENT_PLAN',
  'FINANCE', 'GROCERY', 'GOVT', 'HOTEL', 'HEALTH', 'NONPROFIT',
  'PROF_SERVICES', 'RETAIL', 'TRAVEL', 'RESTAURANT', 'ALCOHOL',
  'ONLINE_GAMBLING', 'PHYSICAL_GAMBLING', 'OTC_DRUGS', 'MATRIMONY_SERVICE',
];

// Photo de profil WhatsApp : carrée, JPEG. Meta refuse en dessous de 192 px et
// recadre tout ce qui ne l'est pas — on normalise donc avant l'envoi.
const toWhatsAppAvatar = async (buffer) => {
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .resize(640, 640, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 90 })
    .toBuffer();
};

// GET /cloud/profile — fiche entreprise actuelle du numéro de l'école
router.get('/cloud/profile', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const result = await cloud.getBusinessProfile(schoolId);
    if (!result.success) return res.status(400).json({ error: result.message });
    res.json({ success: true, profile: result.profile });
  } catch (error) {
    console.error('Erreur cloud profile GET:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// POST /cloud/profile — met à jour la fiche et/ou la photo de profil.
// Body : { about, description, email, address, websites[], vertical,
//          photo_base64, mimetype, use_school_logo }
router.post('/cloud/profile', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const {
      about, description, email, address, websites, vertical,
      photo_base64: photoBase64, use_school_logo: useSchoolLogo,
    } = req.body || {};

    // 1. Photo : fichier envoyé par l'admin, ou logo déjà enregistré de l'école
    let photoBuffer = null;
    if (photoBase64) {
      photoBuffer = Buffer.from(String(photoBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
    } else if (useSchoolLogo) {
      const { data: school } = await supabaseAdmin
        .from('schools').select('logo_url').eq('id', schoolId).maybeSingle();
      if (!school?.logo_url) {
        return res.status(400).json({ error: "Cette école n'a pas encore de logo enregistré." });
      }
      const { fetchSchoolLogoBuffer } = await import('../services/schoolLogo.js');
      photoBuffer = await fetchSchoolLogoBuffer(school.logo_url);
      if (!photoBuffer) return res.status(400).json({ error: 'Logo de l\'école illisible.' });
    }

    let photoUpdated = false;
    if (photoBuffer) {
      let avatar;
      try {
        avatar = await toWhatsAppAvatar(photoBuffer);
      } catch (e) {
        return res.status(400).json({ error: `Image illisible (${e.message}). Utilisez un JPEG ou un PNG.` });
      }
      const pic = await cloud.setProfilePicture(schoolId, avatar, 'image/jpeg', 'profile.jpg');
      if (!pic.success) return res.status(400).json({ error: pic.message });
      photoUpdated = true;
    }

    // 2. Champs texte (facultatifs, indépendants de la photo)
    // Catégorie d'activité : Meta n'accepte que son énumération, et renvoie
    // « UNDEFINED » quand rien n'est défini. Renvoyer ce placeholder fait
    // échouer toute la mise à jour (erreur #100) — on l'écarte, comme toute
    // valeur inconnue, plutôt que de perdre les autres champs au passage.
    const safeVertical = WA_VERTICALS.includes(vertical) ? vertical : undefined;
    const fields = { about, description, email, address, vertical: safeVertical };
    if (Array.isArray(websites) && websites.length) fields.websites = websites.filter(Boolean);
    const hasFields = Object.values(fields).some((v) => v !== undefined && v !== null && v !== '');

    if (hasFields) {
      const upd = await cloud.updateBusinessProfile(schoolId, fields);
      if (!upd.success) {
        return res.status(400).json({
          error: upd.message,
          // La photo est déjà passée : le dire évite un second envoi inutile.
          photo_updated: photoUpdated,
        });
      }
    }

    if (!photoUpdated && !hasFields) {
      return res.status(400).json({ error: 'Rien à mettre à jour.' });
    }

    const refreshed = await cloud.getBusinessProfile(schoolId);
    res.json({
      success: true,
      photo_updated: photoUpdated,
      profile: refreshed.success ? refreshed.profile : null,
    });
  } catch (error) {
    console.error('Erreur cloud profile POST:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== SESSION MANAGEMENT ====================

// DELETE /sessions/:sessionId — détache le numéro Cloud API de cette école.
// Le numéro reste déclaré côté Meta (WABA central) ; seul le rattachement à
// l'école est supprimé, ce qui coupe immédiatement tout envoi.
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    await supabaseAdmin.from('whatsapp_school_sessions').delete().eq('school_id', schoolId);
    cloud.invalidateCache(schoolId);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression session:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== DAILY AI REPORTS ====================

// POST /daily-reports/preview — generate a preview report for one student
router.post('/daily-reports/preview', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId requis' });

    const result = await generatePreview(studentId, schoolId);
    res.json(result);
  } catch (error) {
    console.error('Erreur preview:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /daily-reports/comprehensive-preview — generate comprehensive period report
router.post('/daily-reports/comprehensive-preview', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { studentId, startDate, endDate } = req.body;
    if (!studentId || !startDate || !endDate) return res.status(400).json({ error: 'studentId, startDate et endDate requis' });

    const result = await generateComprehensivePreview(studentId, schoolId, startDate, endDate);
    res.json(result);
  } catch (error) {
    console.error('Erreur comprehensive preview:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Helpers PDF rapport élève
// ─────────────────────────────────────────────────────────────────────────

async function buildStudentReportPdf({ schoolId, studentId, startDate, endDate }) {
  const result = await generateComprehensivePreview(studentId, schoolId, startDate, endDate);
  if (result?.error) return { error: result.error };
  if (!result?.periodData) return { error: 'Données indisponibles' };
  const pdfBuffer = await generateStudentReportPdf({
    periodData: result.periodData,
    aiReport: result.report,
  });
  const st = result.periodData.student;
  const safeName = `${st.lastName || 'eleve'}_${st.firstName || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'eleve';
  const fileName = `rapport_${safeName}_${startDate}_${endDate}.pdf`;
  return { pdfBuffer, fileName, periodData: result.periodData, report: result.report };
}

// POST /daily-reports/pdf — télécharger le PDF moderne (charts, KPIs, IA)
router.post('/daily-reports/pdf', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { studentId, startDate, endDate } = req.body;
    if (!studentId || !startDate || !endDate) {
      return res.status(400).json({ error: 'studentId, startDate, endDate requis' });
    }
    const out = await buildStudentReportPdf({ schoolId, studentId, startDate, endDate });
    if (out.error) return res.status(400).json({ error: out.error });

    res.setHeader('Content-Type', 'application/pdf');
    // RFC 5987 pour gérer les noms Unicode (ex : Bénjelloun)
    const encodedName = encodeURIComponent(out.fileName);
    res.setHeader('Content-Disposition', `attachment; filename="report.pdf"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Length', out.pdfBuffer.length);
    res.send(out.pdfBuffer);
  } catch (e) {
    console.error('[ReportPdf] erreur:', e);
    res.status(500).json({ error: e.message || 'Erreur PDF' });
  }
});

// POST /daily-reports/send-pdf-report — envoie le PDF aux parents via WhatsApp (doc)
router.post('/daily-reports/send-pdf-report', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { studentId, startDate, endDate } = req.body;
    if (!studentId || !startDate || !endDate) {
      return res.status(400).json({ error: 'studentId, startDate, endDate requis' });
    }

    // 1. Génère le PDF
    const out = await buildStudentReportPdf({ schoolId, studentId, startDate, endDate });
    if (out.error) return res.status(400).json({ error: out.error });

    // 2. Récupère les parents + téléphones WhatsApp
    const { data: links } = await supabaseAdmin
      .from('parent_students')
      .select('parent_id')
      .eq('student_id', studentId);
    if (!links?.length) return res.json({ success: false, error: 'Aucun parent lié à cet élève.' });

    const parentIds = links.map(l => l.parent_id);
    const { data: contacts } = await supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164, is_primary')
      .in('parent_id', parentIds)
      .eq('channel', 'whatsapp')
      .order('is_primary', { ascending: false });
    if (!contacts?.length) return res.json({ success: false, error: 'Aucun numéro WhatsApp trouvé pour les parents.' });

    // 3. Vérifie la session WhatsApp
    const status = await getStatus(schoolId);
    if (!status?.connected) {
      return res.json({ success: false, error: 'Session WhatsApp non connectée pour cette école. Connectez-la dans l\'onglet Sessions.' });
    }

    // 4. Caption courte (les détails sont dans le PDF)
    const st = out.periodData.student;
    const fmtDate = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };
    const caption = `📊 *Rapport pédagogique*\n` +
      `👤 ${st.firstName} ${st.lastName}\n` +
      `🎓 ${st.className || ''}\n` +
      `🗓️ Période : ${fmtDate(startDate)} → ${fmtDate(endDate)}\n\n` +
      `📎 Veuillez consulter le PDF ci-joint pour le détail complet.`;

    // 5. Log message
    const studentName = `${st.firstName} ${st.lastName}`;
    const { data: msgLog } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        school_id: schoolId,
        sent_by: req.user.id,
        message_type: 'document',
        content: caption,
        file_name: out.fileName,
        recipient_filter: { type: 'comprehensive_report_pdf', student_id: studentId, student_name: studentName },
        total_recipients: contacts.length,
        status: 'sending',
        category: 'pedagogical',
      })
      .select()
      .single();

    if (msgLog) {
      await supabaseAdmin.from('whatsapp_message_recipients').insert(
        contacts.map(c => ({ message_id: msgLog.id, parent_id: c.parent_id, phone_e164: c.phone_e164, status: 'pending' }))
      );
    }

    // 6. Envoi via l'API Cloud (PDF buffer)
    let sent = 0, failed = 0;
    const errors = new Set();
    for (const contact of contacts) {
      // Hors fenêtre 24 h, Meta refuse le PDF : on envoie le template
      // d'annonce, et le document part dès que le parent répond.
      const result = await sendUtilityMedia(schoolId, contact.phone_e164, {
        buffer: out.pdfBuffer,
        template: 'document',
        params: [studentName, 'rapport pédagogique de suivi'],
        fileName: out.fileName, mimetype: 'application/pdf', caption,
      });
      const ok = result?.success;
      if (!ok && result?.message) errors.add(result.reason || result.message);

      if (msgLog) {
        await supabaseAdmin.from('whatsapp_message_recipients').update({
          status: ok ? 'sent' : 'failed',
          sent_at: ok ? new Date().toISOString() : null,
          error_message: ok ? null : (result?.message || 'Échec envoi PDF'),
        }).eq('message_id', msgLog.id).eq('phone_e164', contact.phone_e164);
      }
      if (ok) sent++; else failed++;
    }

    if (msgLog) {
      await supabaseAdmin.from('whatsapp_messages').update({
        status: failed === contacts.length ? 'failed' : 'completed',
        sent_count: sent,
        failed_count: failed,
        updated_at: new Date().toISOString(),
      }).eq('id', msgLog.id);
    }

    res.json({
      success: sent > 0,
      sent, failed, total: contacts.length,
      error: failed > 0 && sent === 0 ? [...errors].join(' · ') : undefined,
    });
  } catch (e) {
    console.error('[SendPdfReport] erreur:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// POST /daily-reports/send-report — send a generated report via WhatsApp to parent
router.post('/daily-reports/send-report', async (req, res) => {
  try {
    const { studentId, reportText } = req.body;
    const schoolId = getSchoolId(req);
    console.log(`[SendReport] studentId=${studentId}, textLength=${reportText?.length}`);
    if (!studentId || !reportText) return res.status(400).json({ error: 'studentId et reportText requis' });

    // Get student name for the message label
    const { data: studentProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', studentId)
      .single();
    const studentName = studentProfile ? `${studentProfile.first_name} ${studentProfile.last_name}` : 'Élève';

    // Get parent contacts for this student
    const { data: parentLinks } = await supabaseAdmin
      .from('parent_students')
      .select('parent_id')
      .eq('student_id', studentId);

    console.log(`[SendReport] parentLinks: ${JSON.stringify(parentLinks)}`);
    if (!parentLinks?.length) return res.json({ success: false, error: 'Aucun parent lié à cet élève' });

    const parentIds = parentLinks.map(l => l.parent_id);
    const { data: contacts } = await supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164')
      .in('parent_id', parentIds)
      .eq('channel', 'whatsapp');

    console.log(`[SendReport] contacts: ${JSON.stringify(contacts)}`);
    if (!contacts?.length) return res.json({ success: false, error: 'Aucun contact WhatsApp trouvé pour les parents' });

    // Log the comprehensive report into whatsapp_messages for traceability
    const { data: msgLog, error: logError } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        school_id: schoolId,
        sent_by: req.user.id,
        message_type: 'text',
        content: `📊 Rapport complet — ${studentName}\n\n${reportText}`,
        media_url: null,
        file_name: null,
        recipient_filter: { type: 'comprehensive_report', student_id: studentId, student_name: studentName },
        total_recipients: contacts.length,
        status: 'sending',
        category: 'pedagogical'
      })
      .select()
      .single();

    if (logError) {
      console.error('[SendReport] Error logging message:', logError);
      // Continue even if logging fails — don't block the send
    }

    // Insert recipient records for each contact
    if (msgLog) {
      const recipientRecords = contacts.map(c => ({
        message_id: msgLog.id,
        parent_id: c.parent_id,
        phone_e164: c.phone_e164,
        status: 'pending'
      }));
      await supabaseAdmin.from('whatsapp_message_recipients').insert(recipientRecords);
    }

    // Vérifie que le numéro Cloud API est rattaché
    if (!(await isSessionReady(schoolId))) {
      if (msgLog) await supabaseAdmin.from('whatsapp_messages').update({ status: 'failed' }).eq('id', msgLog.id);
      return res.json({ success: false, error: 'Aucune session WhatsApp connectée pour cette école.' });
    }

    // Split text into chunks of ≤4000 chars at paragraph boundaries
    const MAX_CHUNK = 4000;
    const splitTextIntoChunks = (text) => {
      if (text.length <= MAX_CHUNK) return [text];
      const chunks = [];
      let remaining = text;
      while (remaining.length > MAX_CHUNK) {
        let splitIdx = remaining.lastIndexOf('\n\n', MAX_CHUNK);
        if (splitIdx < MAX_CHUNK * 0.3) splitIdx = remaining.lastIndexOf('\n', MAX_CHUNK);
        if (splitIdx < MAX_CHUNK * 0.3) splitIdx = MAX_CHUNK;
        chunks.push(remaining.substring(0, splitIdx).trim());
        remaining = remaining.substring(splitIdx).trim();
      }
      if (remaining.trim()) chunks.push(remaining.trim());
      return chunks;
    };

    const textChunks = splitTextIntoChunks(reportText);
    console.log(`[SendReport] Text split into ${textChunks.length} chunk(s): ${textChunks.map(c => c.length).join(', ')} chars`);

    let sent = 0, failed = 0;
    const errorMessages = new Set();
    for (const contact of contacts) {
      let contactSuccess = true;
      let lastErr = null;
      // Hors fenêtre 24 h, un rapport découpé en plusieurs messages libres est
      // impossible : la boucle ci-dessous ne tourne pas et on envoie à la place
      // une annonce par template (bloc juste après).
      const windowOpen = await serviceWindowOpen(contact.phone_e164);
      for (let i = 0; windowOpen && i < textChunks.length; i++) {
        try {
          const chunkLabel = textChunks.length > 1 ? ` (${i + 1}/${textChunks.length})` : '';
          console.log(`[SendReport] Sending to ${contact.phone_e164}${chunkLabel}, chunkLen=${textChunks[i].length}`);
          const sendData = await sendText(schoolId, contact.phone_e164, textChunks[i]);
          if (!sendData.success) {
            console.log(`[SendReport] Send failed:`, sendData);
            lastErr = sendData.message || sendData.reason || 'Échec envoi';
            errorMessages.add(lastErr);
            contactSuccess = false;
            break;
          }
        } catch (err) {
          console.error(`[SendReport] Send exception:`, err.message);
          lastErr = err.message;
          errorMessages.add(lastErr);
          contactSuccess = false;
          break;
        }
      }

      // Fenêtre fermée : annonce par template. Le rapport complet partira
      // dès que le parent répondra, sa réponse rouvrant la fenêtre 24 h.
      if (!windowOpen) {
        const ann = await sendUtility(schoolId, contact.phone_e164, {
          template: 'document',
          params: [studentName, 'rapport pédagogique complet'],
        });
        contactSuccess = !!ann?.success;
        if (!contactSuccess) {
          lastErr = ann?.message || 'Échec de l\'annonce du rapport';
          errorMessages.add(lastErr);
        }
      }

      // Update recipient status in DB
      if (msgLog) {
        await supabaseAdmin.from('whatsapp_message_recipients').update({
          status: contactSuccess ? 'sent' : 'failed',
          sent_at: contactSuccess ? new Date().toISOString() : null,
          error_message: contactSuccess ? null : (lastErr || 'Échec envoi rapport complet')
        }).eq('message_id', msgLog.id).eq('phone_e164', contact.phone_e164);
      }

      if (contactSuccess) sent++; else failed++;
    }

    // Update final message status
    if (msgLog) {
      await supabaseAdmin.from('whatsapp_messages').update({
        status: failed === contacts.length ? 'failed' : 'completed',
        sent_count: sent,
        failed_count: failed,
        updated_at: new Date().toISOString()
      }).eq('id', msgLog.id);
    }

    // Surface la vraie cause d'échec (numéro non rattaché, refus Meta, etc.)
    res.json({
      success: sent > 0,
      sent, failed, total: contacts.length,
      error: failed > 0 && sent === 0 ? [...errorMessages].join(' · ') : undefined,
    });
  } catch (error) {
    console.error('Erreur send report:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /daily-reports/students — get students list for preview selection
router.get('/daily-reports/students', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const enrollmentMap = await activeEnrollmentMap(schoolId, req.query.academic_year);
    let query = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id, classes!fk_profiles_class(name)')
      .eq('role', 'student')
      .order('last_name');

    if (schoolId) query = query.eq('school_id', schoolId);

    // Filtre de scope pour pedagogical_manager
    const scopedIds = await getScopedClassIds(req);
    if (enrollmentMap) {
      const allowedStudentIds = [...enrollmentMap.entries()]
        .filter(([, enrollment]) => scopedIds === null || scopedIds.includes(enrollment.class_id))
        .map(([studentId]) => studentId);
      if (allowedStudentIds.length === 0) return res.json([]);
      query = query.in('id', allowedStudentIds);
    } else if (scopedIds !== null) {
      if (scopedIds.length === 0) return res.json([]);
      query = query.in('class_id', scopedIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json((data || []).map((student) => {
      const enrollment = enrollmentMap?.get(student.id);
      return enrollment
        ? { ...student, class_id: enrollment.class_id, classes: enrollment.class }
        : student;
    }));
  } catch (error) {
    console.error('Erreur students:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
