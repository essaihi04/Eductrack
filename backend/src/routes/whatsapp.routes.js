import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize, getScopedClassIds } from '../middleware/auth.js';
import { processDailyReports, generatePreview, generateComprehensivePreview } from '../services/dailyReports.js';
import { resolveCategoryForSending, allowedCategoriesForRole, canSeePedagogicalReports } from '../utils/whatsappCategory.js';
import {
  sendText, sendImage, sendDocument, sendMediaBuffer,
  startSession, logoutSession, getStatus, getQrDataUrl,
  requestPairingCode,
  getStats as getAntiBanStats,
} from '../services/whatsapp/index.js';
import { generateStudentReportPdf } from '../services/studentReportPdf.js';
import { handleBaileysIncoming } from '../services/whatsapp/chatbot/index.js';
import * as cloud from '../services/whatsapp/cloudApi.js';
import { activeStudentIdSet } from '../utils/enrollmentScope.js';
import { sendPushToUser } from '../services/webPush.js';
import { uploadBuffer, BUCKET_PUBLIC } from '../utils/storage.js';

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

// Vérifie qu'une session WhatsApp est prête pour une école.
// Cloud API : prête dès que l'école est mappée (provider='cloud' + phone_number_id).
// Baileys : prête si le socket est connecté.
const isSessionReady = async (schoolId) => {
  if (!schoolId) return false;
  if (getStatus(schoolId).connected) return true;
  return await cloud.isCloudSchool(schoolId);
};

// Helper d'envoi unifié (texte / image / document)
async function sendUnified(schoolId, phone, { messageType, message, mediaUrl, fileName }) {
  if (messageType === 'image' && mediaUrl) {
    return sendImage(schoolId, phone, mediaUrl, message || '');
  }
  if (messageType === 'document' && mediaUrl) {
    return sendDocument(schoolId, phone, mediaUrl, fileName || 'document.pdf', message || '');
  }
  return sendText(schoolId, phone, message || '');
}

// ==================== RECIPIENTS ====================

// GET /recipients — get parent phone numbers filtered by class, level, school_type
router.get('/recipients', async (req, res) => {
  try {
    const { class_ids, school_type, level } = req.query;
    const schoolId = getSchoolId(req);

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

    const uniqueRecipients = Object.values(uniquePhones);

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
    const students = activeIds ? (allStudents || []).filter(s => activeIds.has(s.id)) : (allStudents || []);
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
    const { message, type, mediaUrl, fileName, filter, category: requestedCategory } = req.body;
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
      (chunk) => supabaseAdmin.from('parent_contacts').select('parent_id, phone_e164, is_primary').in('parent_id', chunk).eq('channel', 'whatsapp').order('is_primary', { ascending: false })
    );

    // Un numéro par parent (préférence au principal)
    const parentPhoneMap = {};
    (contacts || []).forEach(c => {
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
        channels
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

    const { data: insertedRecipients } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .insert(recipientRecords)
      .select('id, parent_id, phone_e164');
    const recipientRowId = new Map((insertedRecipients || []).map(r => [`${r.parent_id || ''}|${r.phone_e164 || ''}`, r.id]));

    // Vérifie session Baileys/Cloud (seulement si le canal WhatsApp est demandé)
    if (wantWa && !(await isSessionReady(schoolId))) {
      await supabaseAdmin.from('whatsapp_messages').update({ status: 'failed' }).eq('id', msgLog.id);
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée. Connectez le numéro de votre école depuis l\'onglet Connexion, ou choisissez le canal Application.' });
    }

    // Nom de l'école pour le titre des notifications in-app
    let schoolName = 'votre école';
    if (wantPush && schoolId) {
      const { data: school } = await supabaseAdmin.from('schools').select('name').eq('id', schoolId).maybeSingle();
      if (school?.name) schoolName = school.name;
    }

    // Répond immédiatement, envoi en arrière-plan
    res.json({
      success: true,
      messageId: msgLog.id,
      totalRecipients: recipients.length,
      status: 'sending'
    });

    // Background: envoi séquentiel — canal app (notification + push) puis
    // WhatsApp via Baileys/Cloud (anti-ban intégré).
    let sentCount = 0;
    let failedCount = 0;

    // Corps de la notification in-app (le média est joint en lien cliquable)
    const notifTitle = `📣 ${schoolName}`;
    let notifBody = message || (messageType === 'image' ? '📷 Image' : '📎 Document');
    if (mediaUrl) notifBody += `\n📎 ${fileName || 'Pièce jointe'} : ${mediaUrl}`;

    // Un même numéro partagé par 2 parents ne reçoit qu'UN WhatsApp,
    // mais chaque parent garde sa notification in-app.
    const waSentPhones = new Set();

    for (const recipient of recipients) {
      const rowId = recipientRowId.get(`${recipient.parent_id || ''}|${recipient.phone_e164 || ''}`);
      const patch = {};
      let waOk = false;
      let appOk = false;
      let errorMsg = null;

      // 1. Canal app : notification in-app (lisible même sans push) + push
      if (wantPush && recipient.parent_id) {
        try {
          const { data: notif, error: notifErr } = await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: recipient.parent_id,
              type: 'message',
              title: notifTitle,
              message: notifBody,
              data: { hub_message_id: msgLog.id, media_url: mediaUrl || null, file_name: fileName || null, message_type: messageType }
            })
            .select('id')
            .single();
          if (notifErr) throw notifErr;
          patch.notification_id = notif.id;
          appOk = true;
          const pushRes = await sendPushToUser(recipient.parent_id, {
            title: notifTitle,
            body: (message || notifBody).slice(0, 140),
            url: '/parent/notifications',
            tag: `comm-msg-${msgLog.id}`
          });
          patch.push_status = pushRes.sent > 0 ? 'sent' : 'no_subscription';
        } catch (pushErr) {
          patch.push_status = 'failed';
          errorMsg = `App: ${pushErr.message || 'erreur'}`;
        }
      }

      // 2. Canal WhatsApp
      if (wantWa && recipient.phone_e164) {
        if (waSentPhones.has(recipient.phone_e164)) {
          waOk = true; // déjà envoyé à ce numéro (parents partageant un téléphone)
        } else {
          try {
            const result = await sendUnified(schoolId, recipient.phone_e164, { messageType, message, mediaUrl, fileName });
            if (result.success) {
              waOk = true;
              waSentPhones.add(recipient.phone_e164);
              patch.provider_msg_id = String(result.data?.msgId || '');
            } else {
              errorMsg = [errorMsg, result.message || 'Erreur WhatsApp'].filter(Boolean).join(' | ');
            }
          } catch (sendErr) {
            errorMsg = [errorMsg, sendErr.message || 'Erreur réseau'].filter(Boolean).join(' | ');
          }
        }
      }

      const reached = waOk || appOk;
      if (reached) sentCount++; else failedCount++;
      patch.status = reached ? 'sent' : 'failed';
      if (reached) patch.sent_at = new Date().toISOString();
      if (errorMsg) patch.error_message = errorMsg;

      if (rowId) {
        await supabaseAdmin.from('whatsapp_message_recipients').update(patch).eq('id', rowId);
      }

      // Update progress
      await supabaseAdmin
        .from('whatsapp_messages')
        .update({ sent_count: sentCount, failed_count: failedCount, updated_at: new Date().toISOString() })
        .eq('id', msgLog.id);
      // Pas besoin de waitWasenderInterval : sendText/sendImage intègrent déjà le délai humain anti-ban.
    }

    // Final status
    await supabaseAdmin
      .from('whatsapp_messages')
      .update({
        status: failedCount === recipients.length ? 'failed' : 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', msgLog.id);

  } catch (error) {
    console.error('Erreur envoi WhatsApp:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SEND DIRECT (to a specific phone) ====================

// POST /send-direct — send a message to a specific phone number
router.post('/send-direct', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { phone, message, type, mediaUrl, fileName, parentId, category: requestedCategory } = req.body;
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

    // Envoi via Baileys
    const result = await sendUnified(schoolId, phone, { messageType, message, mediaUrl, fileName });

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

    const [msgRes, recipientsRes] = await Promise.all([
      supabaseAdmin
        .from('whatsapp_messages')
        .select('*, sender:profiles!whatsapp_messages_sent_by_fkey(first_name, last_name)')
        .eq('id', messageId)
        .single(),
      supabaseAdmin
        .from('whatsapp_message_recipients')
        .select('*, parent:profiles(first_name, last_name)')
        .eq('message_id', messageId)
        .order('created_at', { ascending: true })
    ]);

    if (msgRes.error) throw msgRes.error;

    res.json({
      message: msgRes.data,
      recipients: recipientsRes.data || []
    });
  } catch (error) {
    console.error('Erreur détails message:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== INBOX / MESSAGE LOGS ====================

// GET /message-logs — journaux des messages envoyés, depuis la base locale
// (Baileys écrit dans whatsapp_messages / whatsapp_message_recipients).
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

    const { data: messages, error: msgError } = await msgQuery;
    if (msgError) throw msgError;

    // Get all recipients
    const messageIds = (messages || []).map(m => m.id);
    let allRecipients = [];
    if (messageIds.length > 0) {
      // Batch in chunks of 50 to avoid query limits
      for (let i = 0; i < messageIds.length; i += 50) {
        const chunk = messageIds.slice(i, i + 50);
        const { data: recs } = await supabaseAdmin
          .from('whatsapp_message_recipients')
          .select('id, message_id, parent_id, phone_e164, status, error_message, sent_at')
          .in('message_id', chunk);
        if (recs) allRecipients = allRecipients.concat(recs);
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
    allRecipients.forEach(r => {
      const phone = r.phone_e164;
      if (!conversationMap[phone]) {
        const parent = parentMap[r.parent_id];
        conversationMap[phone] = {
          phone,
          parentName: parent ? `${parent.first_name} ${parent.last_name}` : null,
          parentId: r.parent_id,
          messages: [],
          lastMessageAt: null,
          totalSent: 0,
          totalFailed: 0
        };
      }

      const msg = messages.find(m => m.id === r.message_id);
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
          createdAt: msg.created_at,
          senderName: isCompReport ? `📊 Rapport complet` : (msg.sender ? `${msg.sender.first_name} ${msg.sender.last_name}` : null),
          studentName: isCompReport ? (msg.recipient_filter?.student_name || '') : undefined,
          direction: 'outgoing',
          isComprehensiveReport: isCompReport
        });
      }

      if (r.status === 'sent') conversationMap[phone].totalSent++;
      if (r.status === 'failed') conversationMap[phone].totalFailed++;
    });

    // Also fetch daily AI reports that were sent — uniquement pour les rôles pédagogiques + admin
    let dailyReports = [];
    if (canSeePedagogicalReports(req.user?.role)) {
      let dailyReportsQuery = supabaseAdmin
        .from('daily_reports')
        .select('id, student_id, parent_id, phone_e164, report_date, report_content_fr, report_content_ar, status, sent_at, created_at')
        .in('status', ['sent', 'failed'])
        .order('created_at', { ascending: false })
        .limit(500);

      if (schoolId) dailyReportsQuery = dailyReportsQuery.eq('school_id', schoolId);
      // Restreindre aux parents du périmètre pour pedagogical_manager
      if (allowedParentIds !== null) {
        dailyReportsQuery = dailyReportsQuery.in('parent_id', Array.from(allowedParentIds));
      }

      const { data } = await dailyReportsQuery;
      dailyReports = data || [];
    }

    // Get student names for daily reports
    const reportStudentIds = [...new Set((dailyReports || []).map(r => r.student_id).filter(Boolean))];
    let studentNameMap = {};
    if (reportStudentIds.length > 0) {
      const { data: students } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', reportStudentIds);
      (students || []).forEach(s => { studentNameMap[s.id] = `${s.first_name} ${s.last_name}`; });
    }

    // Merge daily reports into conversations
    (dailyReports || []).forEach(report => {
      const phone = report.phone_e164;
      if (!phone) return;

      if (!conversationMap[phone]) {
        // Check if we have parent info from the report
        const reportParent = parentMap[report.parent_id];
        conversationMap[phone] = {
          phone,
          parentName: reportParent ? `${reportParent.first_name} ${reportParent.last_name}` : null,
          parentId: report.parent_id,
          messages: [],
          lastMessageAt: null,
          totalSent: 0,
          totalFailed: 0
        };
      }

      // Build the report message content
      let content = '';
      if (report.report_content_fr) content += report.report_content_fr;
      if (report.report_content_fr && report.report_content_ar) content += '\n\n━━━━━━━━━━━━━━━\n\n';
      if (report.report_content_ar) content += report.report_content_ar;

      const studentName = studentNameMap[report.student_id] || '';

      conversationMap[phone].messages.push({
        id: `report-${report.id}`,
        messageId: report.id,
        content: content || `[Rapport IA - ${report.report_date}]`,
        messageType: 'text',
        mediaUrl: null,
        fileName: null,
        status: report.status,
        errorMessage: null,
        sentAt: report.sent_at,
        createdAt: report.created_at,
        senderName: `🤖 Rapport IA`,
        studentName: studentName,
        direction: 'outgoing',
        isAiReport: true,
        reportDate: report.report_date
      });

      if (report.status === 'sent') conversationMap[phone].totalSent++;
      if (report.status === 'failed') conversationMap[phone].totalFailed++;
    });

    // Also fetch parent names for report-only conversations
    const reportParentIds = [...new Set((dailyReports || []).map(r => r.parent_id).filter(Boolean))].filter(id => !parentMap[id]);
    if (reportParentIds.length > 0) {
      const { data: reportParents } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', reportParentIds);
      (reportParents || []).forEach(p => {
        // Update conversation parentName if missing
        Object.values(conversationMap).forEach(conv => {
          if (conv.parentId === p.id && !conv.parentName) {
            conv.parentName = `${p.first_name} ${p.last_name}`;
          }
        });
      });
    }

    // Sort messages within each conversation and set lastMessageAt
    const conversations = Object.values(conversationMap).map(conv => {
      conv.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      conv.lastMessageAt = conv.messages.length > 0 ? conv.messages[conv.messages.length - 1].createdAt : null;
      conv.messageCount = conv.messages.length;
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
        .select('message_id, parent_id, phone_e164, status, push_status, notification_id, provider_msg_id, delivered_at, read_at, read_channel, responded_at, sent_at, created_at')
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
    let parentsTotal = 0, parentsWithApp = 0, parentsOptedOut = 0, parentsWithWhatsapp = 0;
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
        const withWa = new Set(); const opted = new Set();
        (waContacts || []).forEach(c => {
          withWa.add(c.parent_id);
          if (c.consent_status === 'opted_out') opted.add(c.parent_id);
        });
        parentsWithWhatsapp = withWa.size;
        parentsOptedOut = opted.size;
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
      coverage: { parentsTotal, parentsWithApp, parentsOptedOut, parentsWithWhatsapp },
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

// GET /session-status — état de la session Baileys de cette école
router.get('/session-status', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ connected: false, status: 'no_school' });

    const status = getStatus(schoolId);

    // Métadonnées DB (numéro, warm-up, quotas, provider)
    const { data: row } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .select('phone_number, phone_number_id, provider, session_name, warmup_started_at, last_connected_at, status')
      .eq('school_id', schoolId)
      .maybeSingle();

    // École en mode Cloud API : pas de socket Baileys, l'état vient de la DB.
    if (row?.provider === 'cloud') {
      const cloudConnected = row.status === 'connected';
      return res.json({
        connected: cloudConnected,
        status: row.status || 'pending_verification',
        provider: 'cloud',
        session: {
          id: schoolId,
          name: row.session_name || null,
          phone: row.phone_number || null,
          phone_number_id: row.phone_number_id || null,
          status: row.status || 'pending_verification',
          last_connected_at: row.last_connected_at || null,
        },
      });
    }

    // Aucun socket en mémoire ET aucune ligne DB → pas de session du tout
    if (!status.connected && status.status === 'disconnected' && !row) {
      return res.json({ connected: false, status: 'no_session', session: null, provider: 'baileys' });
    }

    let antiBan = null;
    try { antiBan = await getAntiBanStats(schoolId); } catch {}

    res.json({
      connected: status.connected,
      status: status.status,
      provider: 'baileys',
      session: {
        id: schoolId, // sert d'identifiant logique (utilisé pour DELETE)
        name: row?.session_name || null,
        phone: status.phone || row?.phone_number || null,
        status: status.status,
        last_error: status.last_error || null,
        last_connected_at: row?.last_connected_at || null,
        warmup_started_at: row?.warmup_started_at || null,
      },
      anti_ban: antiBan,
    });
  } catch (error) {
    console.error('Erreur statut session:', error);
    res.json({ connected: false, error: error.message });
  }
});

// GET /session-qr — récupère le QR code Baileys pour appairage
router.get('/session-qr', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    // Démarre la session si pas déjà active.
    // On déclenche un (re)start sur tous les états "non actifs" : disconnected,
    // logged_out, needs_reconnect (auth conservé après 6 échecs 401). Sinon
    // l'utilisateur restait bloqué sans pouvoir relancer le QR.
    const status = getStatus(schoolId);
    if (status.connected) {
      return res.json({ success: false, error: 'Session déjà connectée, pas besoin de QR code', connected: true });
    }
    if (['disconnected', 'logged_out', 'needs_reconnect'].includes(status.status)) {
      await startSession(schoolId, { onIncoming: handleBaileysIncoming });
    }

    // Polling : attend max 15s qu'un QR soit généré
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const qr = getQrDataUrl(schoolId);
      if (qr) {
        return res.json({ success: true, qrDataUrl: qr });
      }
      const s = getStatus(schoolId);
      if (s.connected) {
        return res.json({ success: false, error: 'Session connectée entre-temps', connected: true });
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    res.json({ success: false, error: 'QR code non disponible. Réessayez dans quelques secondes.' });
  } catch (error) {
    console.error('Erreur QR code:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// POST /session-pairing-code — connexion par CODE (alternative au QR).
// Body : { phone }. Renvoie un code à 8 caractères à saisir dans WhatsApp →
// Appareils connectés → « Lier avec numéro de téléphone ».
router.post('/session-pairing-code', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    let { phone } = req.body || {};
    // Repli : numéro enregistré sur la session si non fourni
    if (!phone) {
      const { data: row } = await supabaseAdmin
        .from('whatsapp_school_sessions')
        .select('phone_number')
        .eq('school_id', schoolId)
        .maybeSingle();
      phone = row?.phone_number || null;
    }
    if (!phone) {
      return res.status(400).json({ error: 'Numéro de téléphone requis (format international, ex : +212600000000)' });
    }

    const code = await requestPairingCode(schoolId, phone, { onIncoming: handleBaileysIncoming });
    res.json({ success: true, code });
  } catch (error) {
    console.error('Erreur code appairage:', error);
    res.status(400).json({ success: false, error: error.message || 'Impossible de générer le code' });
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

// ==================== SESSION MANAGEMENT ====================

// POST /sessions — crée (initialise) une session Baileys pour cette école.
// Avec Baileys self-hosted, il n'y a plus de création distante : on démarre
// le socket localement, qui génère un QR code que le frontend récupère via
// /session-qr puis affiche pour appairage WhatsApp.
router.post('/sessions', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const { name, phone_number } = req.body || {};
    // (name et phone_number sont juste méta-info, le vrai numéro est déterminé
    // au scan du QR par WhatsApp)

    // Si une session précédente existait avec auth corrompu (status
    // needs_reconnect, logged_out ou banned), on purge tout pour repartir
    // propre — sinon on restait coincé en boucle 401 sur creds périmés.
    const existing = getStatus(schoolId);
    const needsClean = ['needs_reconnect', 'logged_out', 'banned'].includes(existing.status);
    if (needsClean) {
      console.log(`[whatsapp] POST /sessions : purge auth (status=${existing.status})`);
      try { await logoutSession(schoolId); } catch (e) { console.warn('purge logout:', e.message); }
    }

    // Crée/maj le mapping en DB. On NE laisse PAS l'erreur silencieuse : si la
    // colonne héritée wasender_session_id est encore NOT NULL (ou autre souci
    // de schéma), l'INSERT échoue et le nom/numéro « disparaissent » au scan.
    const { error: upErr } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .upsert({
        school_id: schoolId,
        session_name: name || 'WhatsApp École',
        phone_number: phone_number || null,
        provider: 'baileys',
        status: 'connecting',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'school_id' });
    if (upErr) {
      console.error('[whatsapp] upsert session échoué:', upErr.message);
      return res.status(500).json({
        error: 'Impossible d\'enregistrer la session. Vérifiez la migration de la table whatsapp_school_sessions (wasender_session_id doit être nullable).',
        details: upErr.message,
      });
    }

    // Démarre la session Baileys (callback chatbot pour les messages entrants)
    await startSession(schoolId, { onIncoming: handleBaileysIncoming });

    res.json({
      success: true,
      session: {
        school_id: schoolId,
        name: name || 'WhatsApp École',
        status: 'connecting',
        provider: 'baileys',
      },
      message: 'Session initialisée. Récupérez le QR code via GET /session-qr et scannez-le avec WhatsApp.',
    });
  } catch (error) {
    console.error('Erreur création session:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// PUT /sessions/:sessionId/webhook — déprécié (Baileys n'utilise pas de webhook).
// Conservé pour rester compatible avec d'anciens frontends.
router.put('/sessions/:sessionId/webhook', async (req, res) => {
  res.json({
    success: true,
    deprecated: true,
    message: 'Avec Baileys self-hosted, les messages entrants sont reçus en direct via WebSocket. Aucun webhook à configurer.',
  });
});

// DELETE /sessions/:sessionId — déconnecte la session Baileys et purge l'auth.
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    await logoutSession(schoolId);
    await supabaseAdmin.from('whatsapp_school_sessions').delete().eq('school_id', schoolId);
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression session:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ==================== DAILY AI REPORTS ====================

// GET /daily-reports/settings — get settings for current school
router.get('/daily-reports/settings', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ settings: null });

    const { data, error } = await supabaseAdmin
      .from('daily_report_settings')
      .select('*')
      .eq('school_id', schoolId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ settings: data || null });
  } catch (error) {
    console.error('Erreur settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /daily-reports/settings — create or update settings
router.post('/daily-reports/settings', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const { enabled, send_time, language, include_recommendations, include_chapter_info, include_homework_status, include_behavior, include_grades } = req.body;

    // Validation horaire : anti-ban WhatsApp interdit l'envoi hors 07:00 → 22:59 (Africa/Casablanca).
    // Refuser dès la configuration évite des échecs silencieux quotidiens.
    if (send_time) {
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(send_time))) {
        return res.status(400).json({ error: '"send_time" doit être au format HH:MM' });
      }
      const [hh, mm] = String(send_time).split(':').map((n) => parseInt(n, 10));
      const minutes = hh * 60 + mm;
      if (minutes < 7 * 60 || minutes > 22 * 60 + 59) {
        return res.status(400).json({
          error: "L'heure d'envoi doit être comprise entre 07:00 et 22:59 (heure du Maroc). Les envois WhatsApp sont bloqués par l'anti-ban en dehors de ce créneau.",
        });
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('daily_report_settings')
      .select('id')
      .eq('school_id', schoolId)
      .single();

    let result;
    const payload = {
      school_id: schoolId,
      enabled: enabled ?? false,
      send_time: send_time || '18:00',
      language: language || 'both',
      include_recommendations: include_recommendations ?? true,
      include_chapter_info: include_chapter_info ?? true,
      include_homework_status: include_homework_status ?? true,
      include_behavior: include_behavior ?? true,
      include_grades: include_grades ?? false,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      result = await supabaseAdmin
        .from('daily_report_settings')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      result = await supabaseAdmin
        .from('daily_report_settings')
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) throw result.error;
    res.json({ success: true, settings: result.data });
  } catch (error) {
    console.error('Erreur save settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /daily-reports/trigger — manually trigger daily reports for this school
router.post('/daily-reports/trigger', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    // Restriction de scope pour pedagogical_manager
    const scopedClassIds = await getScopedClassIds(req);
    if (scopedClassIds !== null && scopedClassIds.length === 0) {
      return res.status(400).json({ error: 'Aucune classe assignée à votre périmètre' });
    }

    res.json({ success: true, message: 'Génération des rapports lancée en arrière-plan.' });

    processDailyReports(schoolId, scopedClassIds).then(result => {
      console.log('[DailyReports] Manual trigger result:', result);
    }).catch(err => {
      console.error('[DailyReports] Manual trigger error:', err);
    });
  } catch (error) {
    console.error('Erreur trigger:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

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

    // 6. Envoi via Baileys (PDF buffer)
    let sent = 0, failed = 0;
    const errors = new Set();
    for (const contact of contacts) {
      const result = await sendMediaBuffer(schoolId, contact.phone_e164, out.pdfBuffer, {
        type: 'document', fileName: out.fileName, mimetype: 'application/pdf', caption,
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

    // Vérifie session Baileys connectée
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
      for (let i = 0; i < textChunks.length; i++) {
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

    // Surface la vraie cause d'échec (anti-ban hors créneau, session déconnectée, etc.)
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

// GET /daily-reports/history — get report history
router.get('/daily-reports/history', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { page = 1, limit = 20, date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabaseAdmin
      .from('daily_reports')
      .select('id, student_id, parent_id, phone_e164, report_date, status, error_message, sent_at, created_at, report_content_fr, report_content_ar', { count: 'exact' });

    if (schoolId) query = query.eq('school_id', schoolId);
    if (date) query = query.eq('report_date', date);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    // Enrich with student names
    const studentIds = [...new Set((data || []).map(r => r.student_id))];
    let studentNames = {};
    if (studentIds.length > 0) {
      const { data: students } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', studentIds);
      (students || []).forEach(s => { studentNames[s.id] = `${s.first_name} ${s.last_name}`; });
    }

    const enriched = (data || []).map(r => ({
      ...r,
      studentName: studentNames[r.student_id] || 'Inconnu'
    }));

    res.json({ reports: enriched, total: count || 0 });
  } catch (error) {
    console.error('Erreur history:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /daily-reports/retry — retry sending a single failed report
router.post('/daily-reports/retry', async (req, res) => {
  try {
    const { reportId } = req.body;
    if (!reportId) return res.status(400).json({ error: 'reportId requis' });

    const { data: report } = await supabaseAdmin
      .from('daily_reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (!report) return res.status(404).json({ error: 'Rapport non trouvé' });
    if (!report.phone_e164) return res.json({ success: false, error: 'Pas de numéro de téléphone' });

    const retrySchoolId = report.school_id || getSchoolId(req);
    if (!(await isSessionReady(retrySchoolId))) {
      return res.json({ success: false, error: 'Aucune session WhatsApp connectée pour cette école' });
    }

    // Build message text
    let text = '';
    if (report.report_content_fr) text += report.report_content_fr;
    if (report.report_content_fr && report.report_content_ar) text += '\n\n━━━━━━━━━━━━━━━\n\n';
    if (report.report_content_ar) text += report.report_content_ar;

    if (!text) return res.json({ success: false, error: 'Rapport vide' });

    const sendData = await sendText(retrySchoolId, report.phone_e164, text);

    if (sendData.success) {
      await supabaseAdmin.from('daily_reports').update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null }).eq('id', reportId);
      res.json({ success: true });
    } else {
      await supabaseAdmin.from('daily_reports').update({ error_message: sendData.message || 'Erreur envoi' }).eq('id', reportId);
      res.json({ success: false, error: sendData.message || 'Erreur envoi' });
    }
  } catch (error) {
    console.error('Erreur retry:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /daily-reports/retry-all-failed — retry all failed reports
router.post('/daily-reports/retry-all-failed', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    let query = supabaseAdmin.from('daily_reports').select('*').eq('status', 'failed');
    if (schoolId) query = query.eq('school_id', schoolId);
    const { data: failedReports } = await query;

    if (!failedReports?.length) return res.json({ success: true, sent: 0, failed: 0, total: 0, message: 'Aucun rapport échoué' });

    if (!(await isSessionReady(schoolId))) {
      return res.json({ success: false, error: 'Aucune session WhatsApp connectée pour cette école' });
    }

    let sent = 0, failed = 0;
    for (const report of failedReports) {
      if (!report.phone_e164) { failed++; continue; }

      let txt = '';
      if (report.report_content_fr) txt += report.report_content_fr;
      if (report.report_content_fr && report.report_content_ar) txt += '\n\n━━━━━━━━━━━━━━━\n\n';
      if (report.report_content_ar) txt += report.report_content_ar;
      if (!txt) { failed++; continue; }

      try {
        const sendData = await sendText(schoolId, report.phone_e164, txt);
        if (sendData.success) {
          await supabaseAdmin.from('daily_reports').update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null }).eq('id', report.id);
          sent++;
        } else {
          await supabaseAdmin.from('daily_reports').update({ error_message: sendData.message || 'Erreur envoi' }).eq('id', report.id);
          failed++;
        }
      } catch { failed++; }
    }

    res.json({ success: true, sent, failed, total: failedReports.length });
  } catch (error) {
    console.error('Erreur retry-all:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /daily-reports/students — get students list for preview selection
router.get('/daily-reports/students', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let query = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id, classes!fk_profiles_class(name)')
      .eq('role', 'student')
      .order('last_name');

    if (schoolId) query = query.eq('school_id', schoolId);

    // Filtre de scope pour pedagogical_manager
    const scopedIds = await getScopedClassIds(req);
    if (scopedIds !== null) {
      if (scopedIds.length === 0) return res.json([]);
      query = query.in('class_id', scopedIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur students:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
