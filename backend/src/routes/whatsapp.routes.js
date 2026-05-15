import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize, getScopedClassIds } from '../middleware/auth.js';
import { processDailyReports, generatePreview, generateComprehensivePreview } from '../services/dailyReports.js';
import { resolveCategoryForSending, allowedCategoriesForRole } from '../utils/whatsappCategory.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'school_admin', 'pedagogical_manager', 'pedagogical_director', 'finance_manager', 'transport_manager'));

const WASENDER_BASE = 'https://www.wasenderapi.com';

// Safe JSON parse — WasenderAPI sometimes returns HTML on errors
const safeJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error('WasenderAPI returned non-JSON:', text.substring(0, 200));
    return { success: false, message: `WasenderAPI error (HTTP ${response.status})` };
  }
};

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

// Global Wasender API key (Personal Access Token) — shared by all schools
const getGlobalApiKey = () => process.env.WASENDER_API_KEY || null;

const getWasenderHeaders = (apiKey) => ({
  'Authorization': `Bearer ${apiKey || getGlobalApiKey()}`,
  'Content-Type': 'application/json'
});

// Get the Wasender session ID mapped to a specific school from our DB
const getSchoolSessionId = async (schoolId) => {
  if (!schoolId) return null;
  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('wasender_session_id')
    .eq('school_id', schoolId)
    .single();
  return data?.wasender_session_id || null;
};

// Get the session API key (needed for send-message) for a school's mapped session
const getSessionApiKey = async (schoolId) => {
  const globalKey = getGlobalApiKey();
  if (!globalKey) return null;

  const mappedSessionId = await getSchoolSessionId(schoolId);
  if (!mappedSessionId) return null;

  // Fetch session detail to get its api_key
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
// Helper: delay between messages to respect rate limits
const waitWasenderInterval = () => new Promise(resolve => setTimeout(resolve, WASENDER_MIN_INTERVAL_MS));

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

    // Fetch session API key for sending messages
    const sessionApiKey = await getSessionApiKey(schoolId);
    if (!sessionApiKey) {
      // Update message status to failed
      await supabaseAdmin.from('whatsapp_messages').update({ status: 'failed' }).eq('id', msgLog.id);
      return res.status(400).json({ error: 'Aucune session WhatsApp connectée. Configurez la clé API Wasender de votre école et connectez une session.' });
    }

    // Respond immediately with message ID, send in background
    res.json({
      success: true,
      messageId: msgLog.id,
      totalRecipients: recipients.length,
      status: 'sending'
    });

    // Background: send messages sequentially
    let sentCount = 0;
    let failedCount = 0;

    const sendHeaders = {
      'Authorization': `Bearer ${sessionApiKey}`,
      'Content-Type': 'application/json'
    };

    for (const recipient of recipients) {
      try {
        // Build WasenderAPI payload
        const payload = { to: recipient.phone_e164 };

        if (messageType === 'image' && mediaUrl) {
          payload.imageUrl = mediaUrl;
          if (message) payload.text = message;
        } else if (messageType === 'document' && mediaUrl) {
          payload.documentUrl = mediaUrl;
          if (fileName) payload.fileName = fileName;
          if (message) payload.text = message;
        } else {
          payload.text = message;
        }

        console.log('Sending to:', recipient.phone_e164, 'payload:', JSON.stringify(payload));

        const waRes = await fetch(`${WASENDER_BASE}/api/send-message`, {
          method: 'POST',
          headers: sendHeaders,
          body: JSON.stringify(payload)
        });

        const waData = await safeJson(waRes);
        console.log('WasenderAPI send response:', JSON.stringify(waData));

        if (waData.success) {
          sentCount++;
          await supabaseAdmin
            .from('whatsapp_message_recipients')
            .update({
              status: 'sent',
              wasender_msg_id: String(waData.data?.msgId || ''),
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
              error_message: waData.message || waData.error || 'Erreur inconnue'
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

      // Rate limit delay (Wasender account protection: 1 message / 5 seconds)
      await waitWasenderInterval();
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

    const sessionApiKey = await getSessionApiKey(schoolId);
    if (!sessionApiKey) {
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

    // Build WasenderAPI payload
    const payload = { to: phone };
    if (messageType === 'image' && mediaUrl) {
      payload.imageUrl = mediaUrl;
      if (message) payload.text = message;
    } else if (messageType === 'document' && mediaUrl) {
      payload.documentUrl = mediaUrl;
      if (fileName) payload.fileName = fileName;
      if (message) payload.text = message;
    } else {
      payload.text = message;
    }

    const waRes = await fetch(`${WASENDER_BASE}/api/send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const waData = await safeJson(waRes);

    if (waData.success) {
      await supabaseAdmin.from('whatsapp_message_recipients').update({
        status: 'sent',
        wasender_msg_id: String(waData.data?.msgId || ''),
        sent_at: new Date().toISOString()
      }).eq('message_id', msgLog.id).eq('phone_e164', phone);

      await supabaseAdmin.from('whatsapp_messages').update({
        status: 'completed', sent_count: 1, failed_count: 0, updated_at: new Date().toISOString()
      }).eq('id', msgLog.id);

      res.json({ success: true, messageId: msgLog.id, status: 'sent' });
    } else {
      await supabaseAdmin.from('whatsapp_message_recipients').update({
        status: 'failed',
        error_message: waData.message || waData.error || 'Erreur inconnue'
      }).eq('message_id', msgLog.id).eq('phone_e164', phone);

      await supabaseAdmin.from('whatsapp_messages').update({
        status: 'failed', sent_count: 0, failed_count: 1, updated_at: new Date().toISOString()
      }).eq('id', msgLog.id);

      res.json({ success: false, error: waData.message || 'Erreur envoi', messageId: msgLog.id });
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

    // Also fetch daily AI reports that were sent
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

    const { data: dailyReports } = await dailyReportsQuery;

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

// POST /upload — proxy upload to WasenderAPI
router.post('/upload', async (req, res) => {
  try {
    const { base64, mimetype } = req.body;

    if (!base64) {
      return res.status(400).json({ error: 'Fichier base64 requis' });
    }

    const globalKey = getGlobalApiKey();
    if (!globalKey) return res.status(400).json({ error: 'Clé API non configurée' });

    const payload = { base64 };
    if (mimetype) payload.mimetype = mimetype;

    const waRes = await fetch(`${WASENDER_BASE}/api/upload`, {
      method: 'POST',
      headers: getWasenderHeaders(globalKey),
      body: JSON.stringify(payload)
    });

    const waData = await safeJson(waRes);

    if (waData.success && waData.publicUrl) {
      res.json({ success: true, publicUrl: waData.publicUrl });
    } else {
      res.status(400).json({ error: waData.message || 'Erreur upload' });
    }
  } catch (error) {
    console.error('Erreur upload média:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SESSION STATUS ====================

// GET /session-status — check WasenderAPI session status for THIS school
router.get('/session-status', async (req, res) => {
  try {
    const globalKey = getGlobalApiKey();
    if (!globalKey) {
      return res.json({ connected: false, error: 'Clé API Wasender non configurée sur le serveur.' });
    }

    const schoolId = getSchoolId(req);
    const mappedSessionId = await getSchoolSessionId(schoolId);

    if (!mappedSessionId) {
      return res.json({ connected: false, status: 'no_session', session: null });
    }

    // Fetch this school's specific session from Wasender
    const detailRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${mappedSessionId}`, {
      headers: { 'Authorization': `Bearer ${globalKey}` }
    });
    const detailData = await safeJson(detailRes);

    if (!detailData.success || !detailData.data) {
      // Session may have been deleted on Wasender side — clean up local mapping
      await supabaseAdmin.from('whatsapp_school_sessions').delete().eq('school_id', schoolId);
      return res.json({ connected: false, status: 'no_session', session: null });
    }

    const session = detailData.data;
    res.json({
      connected: session.status === 'connected',
      status: session.status,
      session: {
        id: session.id,
        name: session.name,
        phone: session.phone || session.phone_number || session.phoneNumber || session.number || null,
        status: session.status
      }
    });
  } catch (error) {
    console.error('Erreur statut session:', error);
    res.json({ connected: false, error: error.message });
  }
});

// GET /session-qr — connect session + get QR code for THIS school's session
router.get('/session-qr', async (req, res) => {
  try {
    const globalKey = getGlobalApiKey();
    if (!globalKey) return res.status(400).json({ error: 'Clé API non configurée' });

    const schoolId = getSchoolId(req);
    const mappedSessionId = await getSchoolSessionId(schoolId);
    if (!mappedSessionId) {
      return res.status(404).json({ error: 'Aucune session trouvée. Créez une session depuis cette page.' });
    }

    // Fetch session detail
    const detailRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${mappedSessionId}`, {
      headers: { 'Authorization': `Bearer ${globalKey}` }
    });
    const detailData = await safeJson(detailRes);
    if (!detailData.success || !detailData.data) {
      return res.status(404).json({ error: 'Session introuvable sur Wasender.' });
    }

    const sessionStatus = detailData.data.status;

    if (sessionStatus !== 'connected') {
      // Call connect to initiate the session
      const connectRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${mappedSessionId}/connect`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${globalKey}`, 'Content-Type': 'application/json' }
      });
      const connectData = await safeJson(connectRes);
      console.log('WasenderAPI connect response:', JSON.stringify(connectData));

      if (connectData.success && connectData.data?.qrCode) {
        return res.json({ success: true, qrString: connectData.data.qrCode });
      }

      // Try the qrcode endpoint
      const qrRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${mappedSessionId}/qrcode`, {
        headers: { 'Authorization': `Bearer ${globalKey}` }
      });
      const qrData = await safeJson(qrRes);

      if (qrData.success && qrData.data?.qrCode) {
        return res.json({ success: true, qrString: qrData.data.qrCode });
      }

      return res.json({ success: false, error: qrData.message || connectData.message || 'QR non disponible' });
    }

    res.json({ success: false, error: 'Session déjà connectée, pas besoin de QR code' });
  } catch (error) {
    console.error('Erreur QR code:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SESSION MANAGEMENT ====================

// POST /sessions — create a new WhatsApp session for THIS school
router.post('/sessions', async (req, res) => {
  try {
    const globalKey = getGlobalApiKey();
    if (!globalKey) return res.status(400).json({ error: 'Clé API non configurée sur le serveur' });

    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    // Check if school already has a session
    const existingSessionId = await getSchoolSessionId(schoolId);
    if (existingSessionId) {
      return res.status(400).json({ error: 'Votre école a déjà une session WhatsApp. Supprimez-la d\'abord pour en créer une nouvelle.' });
    }

    const { name, phone_number } = req.body;
    if (!name || !phone_number) {
      return res.status(400).json({ error: 'Nom et numéro de téléphone requis' });
    }

    // Générer un secret webhook unique pour cette session
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const webhookUrl = process.env.WEBHOOK_BASE_URL || 'https://etrack.ma';
    const fullWebhookUrl = `${webhookUrl}/api/webhooks/whatsapp/incoming`;

    // Détecter si on est en localhost (webhook ne fonctionnera pas)
    const isLocalhost = webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1');
    const webhookEnabled = !isLocalhost;

    if (isLocalhost) {
      console.warn('[WhatsApp] ⚠️  ATTENTION: Webhook désactivé car environnement localhost');
      console.warn('[WhatsApp] 💡 Pour activer le webhook en dev, utilisez ngrok:');
      console.warn('[WhatsApp]    1. ngrok http 3000');
      console.warn('[WhatsApp]    2. Ajoutez WEBHOOK_BASE_URL=https://xxx.ngrok.io dans .env');
      console.warn('[WhatsApp]    3. Redémarrez le serveur');
    }

    const sessionPayload = {
      name,
      phone_number,
      account_protection: true,
      log_messages: true,
      read_incoming_messages: false,
      webhook_url: webhookEnabled ? fullWebhookUrl : undefined,
      webhook_enabled: webhookEnabled,
      webhook_events: webhookEnabled ? ['messages.received', 'messages.update'] : undefined
    };

    console.log('[WhatsApp] 🔧 Création session avec payload:', JSON.stringify(sessionPayload, null, 2));

    // Create session on Wasender with webhook configuration
    const waRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${globalKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionPayload)
    });

    const waData = await safeJson(waRes);
    console.log('[WhatsApp] 📥 Réponse WasenderAPI:', JSON.stringify(waData, null, 2));

    if (waData.success && waData.data) {
      // Save the mapping: school_id → wasender session id with webhook info
      const { error: mapError } = await supabaseAdmin
        .from('whatsapp_school_sessions')
        .upsert({
          school_id: schoolId,
          wasender_session_id: waData.data.id,
          session_name: name,
          phone_number: phone_number,
          webhook_url: fullWebhookUrl,
          webhook_secret: webhookSecret,
          webhook_enabled: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'school_id' });

      if (mapError) console.error('[WhatsApp] ❌ Error saving session mapping:', mapError);

      console.log(`[WhatsApp] ✅ Session créée`);
      console.log(`[WhatsApp] 📍 Webhook URL: ${webhookEnabled ? fullWebhookUrl : 'Désactivé (localhost)'}`);
      console.log(`[WhatsApp] 🔑 Webhook dans réponse: ${waData.data.webhook_enabled ? 'OUI' : 'NON'}`);
      
      res.json({ 
        success: true, 
        session: waData.data, 
        webhook_configured: waData.data.webhook_enabled || false,
        webhook_url: webhookEnabled ? fullWebhookUrl : null,
        localhost_warning: isLocalhost ? 'Le chatbot IA ne fonctionnera qu\'après déploiement en production ou avec ngrok' : null
      });
    } else {
      console.error('[WhatsApp] ❌ Erreur création session:', waData.message);
      res.status(400).json({ error: waData.message || 'Erreur création session' });
    }
  } catch (error) {
    console.error('Erreur création session:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /sessions/:sessionId/webhook — update webhook configuration for existing session
router.put('/sessions/:sessionId/webhook', async (req, res) => {
  try {
    const globalKey = getGlobalApiKey();
    if (!globalKey) return res.status(400).json({ error: 'Clé API non configurée' });

    const schoolId = getSchoolId(req);
    const { sessionId } = req.params;

    // Verify this session belongs to this school
    const mappedSessionId = await getSchoolSessionId(schoolId);
    if (String(mappedSessionId) !== String(sessionId)) {
      return res.status(403).json({ error: 'Cette session ne vous appartient pas.' });
    }

    // Generate webhook configuration
    const webhookUrl = process.env.WEBHOOK_BASE_URL || 'https://etrack.ma';
    const fullWebhookUrl = `${webhookUrl}/api/webhooks/whatsapp/incoming`;

    // Update session on WasenderAPI
    const waRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${globalKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_url: fullWebhookUrl,
        webhook_enabled: true,
        webhook_events: ['messages.received', 'messages.update']
      })
    });

    const waData = await safeJson(waRes);

    if (waData.success) {
      // Update our database
      await supabaseAdmin
        .from('whatsapp_school_sessions')
        .update({
          webhook_url: fullWebhookUrl,
          webhook_enabled: true,
          updated_at: new Date().toISOString()
        })
        .eq('school_id', schoolId);

      console.log(`[WhatsApp] Webhook activé pour session ${sessionId}: ${fullWebhookUrl}`);
      res.json({ 
        success: true, 
        message: 'Webhook activé avec succès',
        webhook_url: fullWebhookUrl,
        webhook_secret: waData.data?.webhook_secret
      });
    } else {
      res.status(400).json({ error: waData.message || 'Erreur mise à jour webhook' });
    }
  } catch (error) {
    console.error('Erreur mise à jour webhook:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /sessions/:sessionId — delete a WhatsApp session and remove school mapping
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const globalKey = getGlobalApiKey();
    if (!globalKey) return res.status(400).json({ error: 'Clé API non configurée' });

    const schoolId = getSchoolId(req);
    const { sessionId } = req.params;

    // Verify this session belongs to this school
    const mappedSessionId = await getSchoolSessionId(schoolId);
    if (String(mappedSessionId) !== String(sessionId)) {
      return res.status(403).json({ error: 'Cette session ne vous appartient pas.' });
    }

    const waRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${globalKey}`, 'Content-Type': 'application/json' }
    });

    // 204 No Content = success
    if (waRes.status === 204 || waRes.ok) {
      // Remove the mapping from our DB
      await supabaseAdmin.from('whatsapp_school_sessions').delete().eq('school_id', schoolId);
      return res.json({ success: true });
    }

    const waData = await safeJson(waRes);
    if (waData.success) {
      await supabaseAdmin.from('whatsapp_school_sessions').delete().eq('school_id', schoolId);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: waData.message || 'Erreur suppression session' });
    }
  } catch (error) {
    console.error('Erreur suppression session:', error);
    res.status(500).json({ error: 'Erreur serveur' });
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

    // Get session API key for this school
    const sessionApiKey = await getSessionApiKey(schoolId);
    if (!sessionApiKey) {
      if (msgLog) await supabaseAdmin.from('whatsapp_messages').update({ status: 'failed' }).eq('id', msgLog.id);
      return res.json({ success: false, error: 'Aucune session WhatsApp connectée pour cette école.' });
    }

    // Split text into chunks of ≤4000 chars at paragraph boundaries (Wasender limit is 4096)
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
          const sendRes = await fetch(`${WASENDER_BASE}/api/send-message`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sessionApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: contact.phone_e164, text: textChunks[i] })
          });
          const sendText = await sendRes.text();
          let sendData;
          try { sendData = JSON.parse(sendText); } catch { sendData = { success: false, error: sendText }; }
          if (!sendData.success) { console.log(`[SendReport] Send failed:`, sendData); contactSuccess = false; break; }
        } catch (err) { console.error(`[SendReport] Send exception:`, err.message); contactSuccess = false; break; }
        if (i < textChunks.length - 1) await waitWasenderInterval();
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
      if (contacts.indexOf(contact) < contacts.length - 1) await waitWasenderInterval();
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

    // Get session API key using school from report
    const retrySchoolId = report.school_id || getSchoolId(req);
    const sessionApiKey = await getSessionApiKey(retrySchoolId);
    if (!sessionApiKey) return res.json({ success: false, error: 'Aucune session WhatsApp connectée pour cette école' });

    // Build message text
    let text = '';
    if (report.report_content_fr) text += report.report_content_fr;
    if (report.report_content_fr && report.report_content_ar) text += '\n\n━━━━━━━━━━━━━━━\n\n';
    if (report.report_content_ar) text += report.report_content_ar;

    if (!text) return res.json({ success: false, error: 'Rapport vide' });

    const sendRes = await fetch(`${WASENDER_BASE}/api/send-message`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: report.phone_e164, text })
    });
    const sendData = await sendRes.json();

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

    // Get session API key for this school
    const sessionApiKey = await getSessionApiKey(schoolId);
    if (!sessionApiKey) return res.json({ success: false, error: 'Aucune session WhatsApp connectée pour cette école' });

    let sent = 0, failed = 0;
    for (const report of failedReports) {
      if (!report.phone_e164) { failed++; continue; }

      let text = '';
      if (report.report_content_fr) text += report.report_content_fr;
      if (report.report_content_fr && report.report_content_ar) text += '\n\n━━━━━━━━━━━━━━━\n\n';
      if (report.report_content_ar) text += report.report_content_ar;
      if (!text) { failed++; continue; }

      try {
        const sendRes = await fetch(`${WASENDER_BASE}/api/send-message`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${sessionApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: report.phone_e164, text })
        });
        const sendData = await sendRes.json();
        if (sendData.success) {
          await supabaseAdmin.from('daily_reports').update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null }).eq('id', report.id);
          sent++;
        } else {
          await supabaseAdmin.from('daily_reports').update({ error_message: sendData.message || 'Erreur envoi' }).eq('id', report.id);
          failed++;
        }
      } catch { failed++; }
      await waitWasenderInterval();
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
