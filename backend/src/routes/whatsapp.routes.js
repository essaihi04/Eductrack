import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize, getScopedClassIds } from '../middleware/auth.js';
import { processDailyReports, generatePreview, generateComprehensivePreview } from '../services/dailyReports.js';
import { resolveCategoryForSending, allowedCategoriesForRole, canSeePedagogicalReports } from '../utils/whatsappCategory.js';
import {
  sendText, sendImage, sendDocument,
  startSession, logoutSession, getStatus, getQrDataUrl,
  getStats as getAntiBanStats,
} from '../services/whatsapp/index.js';
import { handleBaileysIncoming } from '../services/whatsapp/chatbot/index.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'school_admin', 'pedagogical_manager', 'pedagogical_director', 'finance_manager', 'transport_manager'));

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return null;
  return req.user.school_id || null;
};

// ==================== READ-ONLY DATA (accessible à tous les rôles autorisés sur ce router) ====================
// Ces endpoints permettent aux finance_manager, transport_manager, pedagogical_manager
// d'accéder aux listes nécessaires (classes, profs, matières) sans toucher à /api/admin/*

router.get('/classes', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let query = supabaseAdmin.from('classes').select('*').order('name');
    if (schoolId) query = query.eq('school_id', schoolId);
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

// Vérifie qu'une session WhatsApp est prête pour une école
const isSessionReady = (schoolId) => {
  if (!schoolId) return false;
  return getStatus(schoolId).connected;
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

    const studentIds = filteredStudents.map(s => s.id);

    if (studentIds.length === 0) {
      return res.json({ count: 0, recipients: [] });
    }

    // Get parent IDs linked to these students
    const { data: parentLinks, error: linksError } = await supabaseAdmin
      .from('parent_students')
      .select('parent_id, student_id')
      .in('student_id', studentIds);

    if (linksError) throw linksError;

    const parentIds = [...new Set((parentLinks || []).map(l => l.parent_id))];

    if (parentIds.length === 0) {
      return res.json({ count: 0, recipients: [] });
    }

    // Get parent contacts (WhatsApp phones)
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164, is_primary, consent_status')
      .in('parent_id', parentIds)
      .eq('channel', 'whatsapp')
      .order('is_primary', { ascending: false });

    if (contactsError) throw contactsError;

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

    res.json({ count: uniqueRecipients.length, recipients: uniqueRecipients });
  } catch (error) {
    console.error('Erreur récupération destinataires:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== RECIPIENTS LIST (detailed) ====================

// GET /recipients-list — get detailed parent list with names and children for a given class
router.get('/recipients-list', async (req, res) => {
  try {
    const { class_ids } = req.query;
    const schoolId = getSchoolId(req);

    if (!class_ids) {
      return res.json({ parents: [] });
    }

    let ids = class_ids.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) return res.json({ parents: [] });

    // Filtre de scope pour pedagogical_manager : restreindre aux classes assignées
    const scopedIds = await getScopedClassIds(req);
    if (scopedIds !== null) {
      ids = ids.filter(id => scopedIds.includes(id));
      if (ids.length === 0) return res.json({ parents: [] });
    }

    // Get students in selected classes
    let studentQuery = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id, classes!fk_profiles_class(id, name)')
      .eq('role', 'student')
      .in('class_id', ids);

    if (schoolId) studentQuery = studentQuery.eq('school_id', schoolId);

    const { data: students, error: studentsError } = await studentQuery;
    if (studentsError) throw studentsError;
    if (!students || students.length === 0) return res.json({ parents: [] });

    const studentIds = students.map(s => s.id);

    // Get parent-student links
    const { data: parentLinks } = await supabaseAdmin
      .from('parent_students')
      .select('parent_id, student_id')
      .in('student_id', studentIds);

    if (!parentLinks || parentLinks.length === 0) return res.json({ parents: [] });

    const parentIds = [...new Set(parentLinks.map(l => l.parent_id))];

    // Get parent profiles
    const { data: parentProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, phone')
      .in('id', parentIds);

    // Get parent WhatsApp contacts
    const { data: contacts } = await supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164, is_primary')
      .in('parent_id', parentIds)
      .eq('channel', 'whatsapp')
      .order('is_primary', { ascending: false });

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

    // Filter only parents that have a WhatsApp phone
    const parents = Object.values(parentMap)
      .filter(p => p.phone_whatsapp)
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

    const { data: contacts } = await supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164, is_primary')
      .in('parent_id', parentIds)
      .eq('channel', 'whatsapp')
      .order('is_primary', { ascending: false });

    // Deduplicate
    const parentPhoneMap = {};
    (contacts || []).forEach(c => {
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
    let recipients = Object.values(uniquePhones);

    // If specific parent phones are provided, filter to only those
    if (filter?.parent_phones?.length > 0) {
      const targetPhones = new Set(filter.parent_phones);
      recipients = recipients.filter(r => targetPhones.has(r.phone_e164));
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'Aucun numéro WhatsApp trouvé' });
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
        category
      })
      .select()
      .single();

    if (logError) throw logError;

    // Insert recipient records
    const recipientRecords = recipients.map(r => ({
      message_id: msgLog.id,
      parent_id: r.parent_id,
      phone_e164: r.phone_e164,
      status: 'pending'
    }));

    await supabaseAdmin.from('whatsapp_message_recipients').insert(recipientRecords);

    // Vérifie session Baileys
    if (!isSessionReady(schoolId)) {
      await supabaseAdmin.from('whatsapp_messages').update({ status: 'failed' }).eq('id', msgLog.id);
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée. Connectez le numéro de votre école depuis cette page.' });
    }

    // Répond immédiatement, envoi en arrière-plan
    res.json({
      success: true,
      messageId: msgLog.id,
      totalRecipients: recipients.length,
      status: 'sending'
    });

    // Background: envoi séquentiel via Baileys (anti-ban intégré)
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        const result = await sendUnified(schoolId, recipient.phone_e164, { messageType, message, mediaUrl, fileName });
        if (result.success) {
          sentCount++;
          await supabaseAdmin
            .from('whatsapp_message_recipients')
            .update({
              status: 'sent',
              provider_msg_id: String(result.data?.msgId || ''),
              sent_at: new Date().toISOString()
            })
            .eq('message_id', msgLog.id)
            .eq('phone_e164', recipient.phone_e164);
        } else {
          failedCount++;
          await supabaseAdmin
            .from('whatsapp_message_recipients')
            .update({
              status: 'failed',
              error_message: result.message || 'Erreur inconnue'
            })
            .eq('message_id', msgLog.id)
            .eq('phone_e164', recipient.phone_e164);
        }
      } catch (sendErr) {
        failedCount++;
        await supabaseAdmin
          .from('whatsapp_message_recipients')
          .update({
            status: 'failed',
            error_message: sendErr.message || 'Erreur réseau'
          })
          .eq('message_id', msgLog.id)
          .eq('phone_e164', recipient.phone_e164);
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

    if (!isSessionReady(schoolId)) {
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

    res.json({ messages: data || [], total: count || 0, page: parseInt(page), limit: parseInt(limit) });
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

// GET /message-logs — fetch message logs from WasenderAPI for THIS school's session
router.get('/message-logs', async (req, res) => {
  try {
    const globalKey = getGlobalApiKey();
    if (!globalKey) return res.status(400).json({ error: 'Clé API non configurée' });

    const schoolId = getSchoolId(req);
    const mappedSessionId = await getSchoolSessionId(schoolId);
    if (!mappedSessionId) {
      return res.json({ success: true, messages: [], total: 0 });
    }

    const { page = 1, per_page = 50 } = req.query;

    const logsRes = await fetch(
      `${WASENDER_BASE}/api/whatsapp-sessions/${mappedSessionId}/message-logs?page=${page}&per_page=${per_page}`,
      { headers: { 'Authorization': `Bearer ${globalKey}` } }
    );
    const logsData = await safeJson(logsRes);

    if (logsData.success && logsData.data) {
      const messages = (logsData.data.data || []).map(m => {
        let content = m.content;
        try { content = JSON.parse(m.content); } catch {}
        return {
          id: m.id,
          to: m.to,
          content: typeof content === 'object' ? content.text || JSON.stringify(content) : content,
          rawContent: m.content,
          status: m.status,
          failed_reason: m.failed_reason,
          created_at: m.created_at,
          updated_at: m.updated_at,
          direction: 'outgoing'
        };
      });

      res.json({
        success: true,
        messages,
        total: logsData.data.total || 0,
        currentPage: logsData.data.current_page || 1,
        lastPage: logsData.data.last_page || 1
      });
    } else {
      res.json({ success: true, messages: [], total: 0 });
    }
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
          .select('id, message_id, parent_id, phone_e164, status, error_message, sent_at, wasender_msg_id')
          .in('message_id', chunk);
        if (recs) allRecipients = allRecipients.concat(recs);
      }
    }

    // Filtre de scope : ne garder que les recipients dont le parent est dans le périmètre
    if (allowedParentIds !== null) {
      allRecipients = allRecipients.filter(r => r.parent_id && allowedParentIds.has(r.parent_id));
    }

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

// POST /upload — upload vers Supabase Storage (bucket whatsapp-media)
// Avec Baileys, on n'a plus besoin du proxy Wasender. Le base64 est uploadé
// dans Supabase Storage et l'URL publique est retournée.
router.post('/upload', async (req, res) => {
  try {
    const { base64, mimetype } = req.body;
    if (!base64) return res.status(400).json({ error: 'Fichier base64 requis' });

    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const ext = (mimetype || '').split('/')[1] || 'bin';
    const filename = `wa-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from('whatsapp-media')
      .upload(filename, buffer, { contentType: mimetype || 'application/octet-stream', upsert: false });

    if (upErr) {
      console.error('Erreur upload Supabase Storage:', upErr);
      return res.status(400).json({ error: upErr.message || 'Erreur upload' });
    }

    const { data: pub } = supabaseAdmin.storage.from('whatsapp-media').getPublicUrl(filename);
    res.json({ success: true, publicUrl: pub.publicUrl });
  } catch (error) {
    console.error('Erreur upload média:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SESSION STATUS ====================

// GET /session-status — état de la session Baileys de cette école
router.get('/session-status', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ connected: false, status: 'no_school' });

    const status = getStatus(schoolId);

    // Métadonnées DB (numéro, warm-up, quotas)
    const { data: row } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .select('phone_number, session_name, warmup_started_at, last_connected_at, status')
      .eq('school_id', schoolId)
      .maybeSingle();

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

    // Démarre la session si pas déjà active
    const status = getStatus(schoolId);
    if (status.status === 'disconnected' || status.status === 'logged_out') {
      await startSession(schoolId, { onIncoming: handleBaileysIncoming });
    } else if (status.connected) {
      return res.json({ success: false, error: 'Session déjà connectée, pas besoin de QR code', connected: true });
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

    // Crée/maj le mapping en DB
    await supabaseAdmin
      .from('whatsapp_school_sessions')
      .upsert({
        school_id: schoolId,
        session_name: name || 'WhatsApp École',
        phone_number: phone_number || null,
        provider: 'baileys',
        status: 'connecting',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'school_id' });

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
    if (!isSessionReady(schoolId)) {
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
    for (const contact of contacts) {
      let contactSuccess = true;
      for (let i = 0; i < textChunks.length; i++) {
        try {
          const chunkLabel = textChunks.length > 1 ? ` (${i + 1}/${textChunks.length})` : '';
          console.log(`[SendReport] Sending to ${contact.phone_e164}${chunkLabel}, chunkLen=${textChunks[i].length}`);
          const sendData = await sendText(schoolId, contact.phone_e164, textChunks[i]);
          if (!sendData.success) { console.log(`[SendReport] Send failed:`, sendData); contactSuccess = false; break; }
        } catch (err) { console.error(`[SendReport] Send exception:`, err.message); contactSuccess = false; break; }
      }

      // Update recipient status in DB
      if (msgLog) {
        await supabaseAdmin.from('whatsapp_message_recipients').update({
          status: contactSuccess ? 'sent' : 'failed',
          sent_at: contactSuccess ? new Date().toISOString() : null,
          error_message: contactSuccess ? null : 'Échec envoi rapport complet'
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

    res.json({ success: true, sent, failed, total: contacts.length });
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
    if (!isSessionReady(retrySchoolId)) {
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

    if (!isSessionReady(schoolId)) {
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
