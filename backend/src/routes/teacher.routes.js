import express from 'express';
import { supabaseAdmin, createAuthenticatedClient } from '../config/supabase.js';
import { authenticate, authorize, isPedagogicalStaff, getTeachingClassIds, canAccessClassAsTeacher } from '../middleware/auth.js';
import multer from 'multer';
import XLSX from 'xlsx';
import { sendWhatsAppResponse } from '../services/whatsappChatbot.js';
import { collectControlReportData, buildControlRows } from '../services/bulletins/controlReportPdf.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

/**
 * Gère l'envoi des notifications WhatsApp de présence/absence aux parents,
 * en couvrant toutes les transitions :
 *  - absent (1re fois dans la séance) → message d'absence (matière + horaire)
 *  - absent re-enregistré absent → rien (déjà notifié)
 *  - absent → présent/retard (même séance) → message de présence (correction)
 *  - absent dans une séance, présent dans une autre du même jour → message présence
 *  - présent depuis le début (jamais signalé absent) → rien
 *  - déjà notifié présent ce jour, encore présent → rien (pas de spam)
 *  - absent séance 1 ET absent séance 2 → 2 messages d'absence (un par séance)
 */
async function handlePresenceNotification({ presence, existing, rowId, sessionId, studentId, senderId }) {
  const { data: sessionInfo } = await supabaseAdmin
    .from('sessions')
    .select('date, topic, start_time, end_time, school_id, subjects(name)')
    .eq('id', sessionId)
    .single();
  if (!sessionInfo) return;

  const { data: studentProfile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', studentId)
    .single();
  const { data: parentLinks } = await supabaseAdmin
    .from('parent_students')
    .select('profiles!parent_id(first_name, phone)')
    .eq('student_id', studentId);
  if (!studentProfile || !parentLinks?.length) return;

  const studentName = `${studentProfile.first_name} ${studentProfile.last_name}`.trim();
  const dateLabel = new Date(sessionInfo.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const subjectName = sessionInfo.subjects?.name || '';
  const lessonTopic = sessionInfo.topic || '';
  const timeSlot = sessionInfo.start_time && sessionInfo.end_time
    ? `${sessionInfo.start_time.slice(0, 5)} - ${sessionInfo.end_time.slice(0, 5)}`
    : (sessionInfo.start_time ? sessionInfo.start_time.slice(0, 5) : '');
  const schoolId = sessionInfo.school_id;

  // `tpl` : template utilitaire employe hors fenetre 24 h. Sans lui, Meta
  // refuserait ces notifications proactives (le parent n'a pas ecrit avant).
  const sendToParents = async (message, event, tpl = { template: 'information' }) => {
    for (const link of parentLinks) {
      const parentPhone = link.profiles?.phone;
      if (!parentPhone) continue;
      const e164Phone = parentPhone.startsWith('+') ? parentPhone : `+${parentPhone}`;
      await sendWhatsAppResponse(e164Phone, message, schoolId, {
        category: 'pedagogical',
        template: tpl.template,
        templateParams: tpl.params || [],
        senderId,
        recipientFilter: { event, student_id: studentId, student_name: studentName, session_id: sessionId, date: sessionInfo.date },
      });
      console.log(`[Tracking] ${event} → parent ${e164Phone} pour ${studentName}`);
    }
  };

  if (presence === 'absent') {
    if (existing?.absence_notified === true) return; // déjà notifié pour cette séance
    let msg = `⚠️ *Absence signalée*\n\nBonjour,\n\nNous vous informons que *${studentName}* a été marqué(e) *absent(e)* lors de la séance du *${dateLabel}*`;
    if (subjectName) msg += `\n📚 Matière: ${subjectName}`;
    if (lessonTopic) msg += `\n📖 Leçon: ${lessonTopic}`;
    if (timeSlot) msg += `\n🕐 Horaire: ${timeSlot}`;
    msg += `\n\n📝 *Pour justifier cette absence*, répondez simplement à ce message en indiquant le motif (maladie, rendez-vous médical, raison familiale…). Votre réponse sera transmise automatiquement à l'établissement.\n\n━━━━━━━━━━━━━━━\n👥 L'équipe pédagogique`;
    await sendToParents(msg, 'absence_notification', {
      template: 'absence',
      params: [studentName, dateLabel, subjectName || timeSlot || 'seance'],
    });
    if (rowId) await supabaseAdmin.from('session_tracking').update({ absence_notified: true }).eq('id', rowId);
    return;
  }

  // presence === 'present' || 'late'
  if (existing?.presence_notified === true) return; // déjà notifié présent (cette séance)

  // L'élève a-t-il été signalé absent (cette séance OU une séance plus tôt le
  // même jour) ? Et un message de présence a-t-il déjà été envoyé aujourd'hui ?
  let wasAbsentNotified = existing?.absence_notified === true;
  let presenceAlreadySentToday = false;
  const { data: todayRows } = await supabaseAdmin
    .from('session_tracking')
    .select('absence_notified, presence_notified, sessions!inner(date)')
    .eq('student_id', studentId)
    .eq('sessions.date', sessionInfo.date);
  for (const r of todayRows || []) {
    if (r.absence_notified) wasAbsentNotified = true;
    if (r.presence_notified) presenceAlreadySentToday = true;
  }

  if (wasAbsentNotified && !presenceAlreadySentToday) {
    const arrivalWord = presence === 'late' ? 'présent(e) (en retard)' : 'présent(e)';
    let msg = `✅ *Présence confirmée*\n\nBonjour,\n\nBonne nouvelle : *${studentName}* est finalement *${arrivalWord}* le *${dateLabel}*`;
    if (subjectName) msg += `\n📚 Matière: ${subjectName}`;
    if (timeSlot) msg += `\n🕐 Horaire: ${timeSlot}`;
    msg += `\n\n━━━━━━━━━━━━━━━\n👥 L'équipe pédagogique`;
    await sendToParents(msg, 'presence_notification');
    if (rowId) await supabaseAdmin.from('session_tracking').update({ presence_notified: true }).eq('id', rowId);
  }
}

// Professeurs + direction pédagogique (directeur / responsable) : la direction
// pédagogique peut enregistrer les séances, suivre les élèves et signaler à la
// place d'un prof qui n'a pas fait son travail (périmètre contrôlé par classe).
router.use(authenticate);
router.use(authorize('teacher', 'pedagogical_director', 'pedagogical_manager'));

// ==================== CLASSES DU PROFESSEUR ====================

// Récupérer les classes assignées au professeur
router.get('/my-classes', async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Direction pédagogique : toutes les classes de son périmètre
    if (isPedagogicalStaff(req.user)) {
      const classIds = await getTeachingClassIds(req);
      if (classIds.length === 0) return res.json([]);
      const { data: classes, error } = await supabaseAdmin
        .from('classes')
        .select('*')
        .in('id', classIds)
        .order('name');
      if (error) throw error;
      return res.json(classes || []);
    }

    const { data, error } = await supabaseAdmin
      .from('class_teachers')
      .select('class_id, classes(*)')
      .eq('teacher_id', teacherId);

    if (error) throw error;

    const classes = data.map(ct => ct.classes);
    res.json(classes);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ÉLÈVES DU PROFESSEUR ====================

// Réinitialiser le mot de passe d'un élève
router.post('/students/:studentId/reset-password', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { newPassword } = req.body;
    const teacherId = req.user.id;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Vérifier que l'élève appartient à une classe du professeur
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .eq('role', 'student')
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: 'Élève non trouvé' });
    }

    if (student.class_id) {
      const allowed = await canAccessClassAsTeacher(req, student.class_id);
      if (!allowed) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    // Mettre à jour le mot de passe dans Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(studentId, {
      password: newPassword
    });

    if (updateError) throw updateError;

    res.json({ message: 'Mot de passe réinitialisé avec succès', password: newPassword });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Récupérer les élèves d'une classe du professeur
router.get('/classes/:classId/students', async (req, res) => {
  try {
    const { classId } = req.params;

    // Vérifier l'accès à cette classe (prof assigné ou direction pédagogique)
    const allowed = await canAccessClassAsTeacher(req, classId);
    if (!allowed) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Récupérer les élèves de la classe
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('class_id', classId)
      .eq('role', 'student');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== MATIÈRES DU PROFESSEUR ====================

// Récupérer les matières du professeur
router.get('/my-subjects', async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Direction pédagogique : toutes les matières de l'école
    if (isPedagogicalStaff(req.user)) {
      let q = supabaseAdmin.from('subjects').select('*').order('name');
      if (req.user.school_id) q = q.eq('school_id', req.user.school_id);
      const { data: subjects, error } = await q;
      if (error) throw error;
      return res.json(subjects || []);
    }

    const { data, error } = await supabaseAdmin
      .from('teacher_subjects')
      .select('subject_id, subjects(*)')
      .eq('teacher_id', teacherId);

    if (error) throw error;
    
    const subjects = data.map(ts => ts.subjects);
    res.json(subjects);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== EMPLOI DU TEMPS ====================

// Récupérer les créneaux de l'emploi du temps d'une classe pour un jour donné
router.get('/classes/:classId/timetable', async (req, res) => {
  try {
    const { classId } = req.params;
    const { day_of_week } = req.query;

    // Map numeric day_of_week to string names (DB stores strings)
    const dayNumToName = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday', 7: 'sunday' };

    let query = supabaseAdmin
      .from('class_timetable')
      .select('id, class_id, teacher_id, day_of_week, slot_order, start_time, end_time, room, subject:subjects(id, name, code), teacher:profiles!class_timetable_teacher_id_fkey(id, first_name, last_name)')
      .eq('class_id', classId)
      .order('slot_order', { ascending: true });

    if (day_of_week) {
      // Support both numeric (1-7) and string ('monday') formats
      const dayStr = dayNumToName[parseInt(day_of_week)] || day_of_week;
      query = query.eq('day_of_week', dayStr);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur timetable teacher:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== PRÉSENCES ====================

// Récupérer les présences d'une classe pour une date
router.get('/classes/:classId/attendance/:date', async (req, res) => {
  try {
    const { classId, date } = req.params;
    const teacherId = req.user.id;

    // Vérifier l'accès à cette classe (prof assigné ou direction pédagogique)
    const allowed = await canAccessClassAsTeacher(req, classId);
    if (!allowed) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Récupérer les présences
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('date', date);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Enregistrer une présence
router.post('/attendance', async (req, res) => {
  try {
    const { studentId, date, status } = req.body;
    const teacherId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .insert({
        student_id: studentId,
        teacher_id: teacherId,
        date,
        status
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

// ==================== SÉANCES ====================

// Créer une séance
router.post('/sessions', async (req, res) => {
  try {
    const { class_id, date, start_time, end_time, topic, notes, subject_id, tracking_options, type, teacher_id: bodyTeacherId } = req.body;
    let teacherId = req.user.id;

    // Direction pédagogique : vérifier que la classe est dans son périmètre.
    // De plus, la séance peut être enregistrée AU NOM du prof concerné (celui
    // du créneau) : ainsi elle apparaît sur le compte du prof et marque son
    // créneau comme fait. On valide que ce prof intervient bien dans la classe.
    if (isPedagogicalStaff(req.user)) {
      const allowed = await canAccessClassAsTeacher(req, class_id);
      if (!allowed) {
        return res.status(403).json({ error: 'Accès refusé à cette classe' });
      }
      if (bodyTeacherId && bodyTeacherId !== req.user.id) {
        const [{ data: ttRow }, { data: ctRow }] = await Promise.all([
          supabaseAdmin.from('class_timetable').select('id').eq('class_id', class_id).eq('teacher_id', bodyTeacherId).limit(1),
          supabaseAdmin.from('class_teachers').select('id').eq('class_id', class_id).eq('teacher_id', bodyTeacherId).limit(1),
        ]);
        if ((ttRow && ttRow.length) || (ctRow && ctRow.length)) {
          teacherId = bodyTeacherId; // prof concerné validé
        }
      }
    }

    // Vérifier si une séance existe déjà avec la même date et horaire
    const { data: existingSession, error: checkError } = await supabaseAdmin
      .from('sessions')
      .select('id, date, start_time')
      .eq('class_id', class_id)
      .eq('date', date)
      .eq('start_time', start_time)
      .single();

    if (existingSession) {
      return res.status(409).json({ 
        error: 'Une séance est déjà enregistrée pour cette date et cet horaire.' 
      });
    }

    // Options de suivi par défaut
    const defaultTrackingOptions = {
      presence: true,
      cahier_present: true,
      sleeping: true,
      homework: false,
      participation: true,
      discipline: true,
      phone_use: true,
      cahier: false,
      attitude: false
    };

    const finalTrackingOptions = tracking_options ? { ...defaultTrackingOptions, ...tracking_options } : defaultTrackingOptions;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({
        class_id,
        teacher_id: teacherId,
        date,
        start_time,
        end_time,
        topic,
        notes,
        subject_id,
        tracking_options: finalTrackingOptions,
        type: type || 'normal',
        school_id: req.user.school_id || null
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Récupérer les devoirs actifs pour cette classe et cette date
    const { data: activeHomework, error: hwError } = await supabaseAdmin
      .from('homework')
      .select('id')
      .eq('class_id', class_id)
      .gte('due_date', date);

    if (hwError) throw hwError;

    // Lier les devoirs actifs à la séance
    if (activeHomework && activeHomework.length > 0) {
      const homeworkSessions = activeHomework.map(hw => ({
        homework_id: hw.id,
        session_id: session.id
      }));

      await supabaseAdmin
        .from('homework_sessions')
        .insert(homeworkSessions);
    }

    // Vérifier s'il existe des contrôles planifiés pour cette session et les marquer comme terminés
    if (type === 'control') {
      console.log('[DEBUG] Vérification des contrôles pour la session:', session.id, 'date:', date, 'class_id:', class_id);
      
      const { data: plannedControls, error: controlError } = await supabaseAdmin
        .from('controls_plan')
        .select('id')
        .eq('teacher_id', teacherId)
        .eq('class_id', class_id)
        .eq('date', date)
        .eq('status', 'planned');

      if (controlError) {
        console.error('[DEBUG] Erreur lors de la recherche des contrôles:', controlError);
      } else if (plannedControls && plannedControls.length > 0) {
        console.log('[DEBUG] Contrôles trouvés:', plannedControls.length, 'marquage comme terminés...');
        
        // Marquer tous les contrôles trouvés comme terminés
        const { error: updateError } = await supabaseAdmin
          .from('controls_plan')
          .update({ status: 'completed' })
          .in('id', plannedControls.map(c => c.id));

        if (updateError) {
          console.error('[DEBUG] Erreur lors du marquage des contrôles:', updateError);
        } else {
          console.log('[DEBUG] Contrôles marqués comme terminés avec succès');
        }
      } else {
        console.log('[DEBUG] Aucun contrôle trouvé à marquer comme terminé');
      }
    }

    res.status(201).json(session);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer une séance
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.user.id;

    let query = supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId);

    // La direction pédagogique accède aux séances de toutes les classes de son périmètre
    if (!isPedagogicalStaff(req.user)) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query.single();

    if (error) throw error;

    if (isPedagogicalStaff(req.user)) {
      const allowed = await canAccessClassAsTeacher(req, data.class_id);
      if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour le contenu pédagogique d'une séance (topic/notes)
router.put('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.user.id;
    const { topic, notes } = req.body;

    let updateQuery = supabaseAdmin
      .from('sessions')
      .update({ topic, notes, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (isPedagogicalStaff(req.user)) {
      // Vérifier que la séance appartient à une classe du périmètre
      const { data: existing } = await supabaseAdmin
        .from('sessions')
        .select('id, class_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Séance introuvable.' });
      const allowed = await canAccessClassAsTeacher(req, existing.class_id);
      if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
    } else {
      updateQuery = updateQuery.eq('teacher_id', teacherId);
    }

    const { data, error } = await updateQuery
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Séance introuvable.' });
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une séance
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.user.id;

    // Vérifier que la séance appartient au professeur (ou est dans le
    // périmètre de la direction pédagogique)
    const { data: session, error: checkError } = await supabaseAdmin
      .from('sessions')
      .select('id, teacher_id, class_id')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    if (session.teacher_id !== teacherId) {
      const allowed = isPedagogicalStaff(req.user) && await canAccessClassAsTeacher(req, session.class_id);
      if (!allowed) return res.status(403).json({ error: 'Non autorisé' });
    }

    // Supprimer d'abord les enregistrements de suivi associés
    const { error: trackingError } = await supabaseAdmin
      .from('session_tracking')
      .delete()
      .eq('session_id', sessionId);

    if (trackingError) throw trackingError;

    // Supprimer la séance
    const { error: deleteError } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('id', sessionId);

    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Séance supprimée avec succès' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les séances d'une classe
router.get('/classes/:classId/sessions', async (req, res) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;
    const teacherId = req.user.id;

    // La direction pédagogique voit les séances de TOUS les profs de la classe
    // (permet de vérifier si un prof a fait son travail et de compléter à sa place)
    if (isPedagogicalStaff(req.user)) {
      const allowed = await canAccessClassAsTeacher(req, classId);
      if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
    }

    let query = supabaseAdmin
      .from('sessions')
      .select(`
        *,
        homework_sessions (
          homework_id,
          homework (
            id,
            title,
            type,
            due_date,
            target_type
          )
        )
      `)
      .eq('class_id', classId);

    if (!isPedagogicalStaff(req.user)) {
      query = query.eq('teacher_id', teacherId);
    }

    if (date) {
      query = query.eq('date', date);
    }

    query = query.order('date', { ascending: false }).order('start_time', { ascending: true, nullsFirst: true });

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SUIVI DE SÉANCE ====================

// Enregistrer la soumission d'un devoir quand le prof le marque comme fait
router.post('/homework/:homeworkId/submit/:studentId', async (req, res) => {
  try {
    const { homeworkId, studentId } = req.params;
    const teacherId = req.user.id;

    console.log(`Soumission de devoir: homeworkId=${homeworkId}, studentId=${studentId}, teacherId=${teacherId}`);

    // Vérifier que le devoir appartient à une classe du professeur
    const { data: homework, error: hwError } = await supabaseAdmin
      .from('homework')
      .select('id, class_id, target_type, created_by')
      .eq('id', homeworkId)
      .single();

    if (hwError || !homework) {
      console.log('Erreur: Devoir non trouvé', hwError);
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Vérifier le droit sur ce devoir (créateur, enseignant de la classe ou
    // direction pédagogique dans son périmètre)
    const hasClassAccess = await canAccessClassAsTeacher(req, homework.class_id);

    if (!hasClassAccess && homework.created_by !== teacherId) {
      console.log('Erreur: Utilisateur non autorisé sur ce devoir');
      return res.status(403).json({ error: 'Accès refusé' });
    }

    console.log(`Devoir trouvé: class_id=${homework.class_id}, target_type=${homework.target_type}, created_by=${homework.created_by}`);

    // Vérifier que l'élève est dans la classe
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('id, class_id')
      .eq('id', studentId)
      .eq('role', 'student')
      .single();

    if (studentError || !student || student.class_id !== homework.class_id) {
      console.log('Erreur: Élève non trouvé ou pas dans la classe', studentError, student);
      return res.status(403).json({ error: 'Accès refusé' });
    }

    console.log(`Élève trouvé: class_id=${student.class_id}`);

    // Si le devoir est pour un groupe, vérifier que l'élève est dans le groupe
    if (homework.target_type === 'group') {
      console.log(`Vérification de groupe pour homeworkId=${homeworkId}, studentId=${studentId}`);
      const { data: homeworkStudent, error: hsError } = await supabaseAdmin
        .from('homework_students')
        .select('id')
        .eq('homework_id', homeworkId)
        .eq('student_id', studentId)
        .single();

      console.log(`Résultat homework_students:`, homeworkStudent, hsError);

      if (hsError || !homeworkStudent) {
        console.log('Erreur: Élève pas dans le groupe', hsError);
        return res.status(403).json({ error: 'Ce devoir n\'est pas assigné à cet élève' });
      }
    }

    // Vérifier si une soumission existe déjà
    const { data: existing } = await supabaseAdmin
      .from('homework_submissions')
      .select('id')
      .eq('homework_id', homeworkId)
      .eq('student_id', studentId)
      .single();

    let result;
    if (existing) {
      // Mettre à jour la soumission existante
      result = await supabaseAdmin
        .from('homework_submissions')
        .update({
          submission_date: new Date().toISOString(),
          status: 'submitted'
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Créer une nouvelle soumission
      result = await supabaseAdmin
        .from('homework_submissions')
        .insert({
          homework_id: homeworkId,
          student_id: studentId,
          submission_date: new Date().toISOString(),
          status: 'submitted'
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;
    console.log('Soumission enregistrée avec succès:', result.data);
    res.json(result.data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Enregistrer le suivi d'une séance (upsert pour éviter les doublons)
router.post('/session-tracking', async (req, res) => {
  try {
    const {
      session_id,
      student_id,
      presence,
      cahier_present,
      sleeping,
      homework,
      participation,
      discipline,
      phone_use,
      mini_eval,
      cahier_lesson,
      cahier_documents,
      cahier_readability,
      attitude,
      comment,
      notes,
      writing,
      skip_absence_notification
    } = req.body;

    // Vérifier si une entrée existe déjà
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('session_tracking')
      .select('id, absence_notified')
      .eq('session_id', session_id)
      .eq('student_id', student_id)
      .single();

    let data, error;

    if (existing) {
      // Mettre à jour l'entrée existante
      const result = await supabaseAdmin
        .from('session_tracking')
        .update({
          presence,
          cahier_present,
          sleeping,
          homework,
          participation,
          discipline,
          phone_use,
          mini_eval,
          cahier_lesson,
          cahier_documents,
          cahier_readability,
          attitude,
          comment,
          notes,
          writing,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Créer une nouvelle entrée
      const result = await supabaseAdmin
        .from('session_tracking')
        .insert({
          session_id,
          student_id,
          presence,
          cahier_present,
          sleeping,
          homework,
          participation,
          discipline,
          phone_use,
          mini_eval,
          cahier_lesson,
          cahier_documents,
          cahier_readability,
          attitude,
          comment,
          notes,
          writing,
          school_id: req.user.school_id || null
        })
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) throw error;
    res.status(201).json(data);

    // Notifications WhatsApp présence/absence (gère toutes les transitions).
    // skip_absence_notification = enregistrement complet de séance : on ne
    // (re)notifie jamais la présence depuis ce flux.
    if (!skip_absence_notification && (presence === 'absent' || presence === 'present' || presence === 'late')) {
      try {
        await handlePresenceNotification({
          presence,
          existing,
          rowId: data?.id,
          sessionId: session_id,
          studentId: student_id,
          senderId: req.user.id,
        });
      } catch (notifError) {
        console.error('[Tracking] Erreur notification présence/absence WhatsApp:', notifError);
      }
    }

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer le suivi d'une séance
router.get('/sessions/:sessionId/tracking', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('session_tracking')
      .select('*')
      .eq('session_id', sessionId);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les soumissions de devoirs pour une séance
router.get('/homework-submissions', async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id est requis' });
    }

    // Récupérer la séance pour obtenir la classe et la date
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('class_id, date')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Séance non trouvée' });
    }

    console.log(`Recherche soumissions pour session ${session_id}, classe ${session.class_id}, date ${session.date}`);

    // Récupérer tous les devoirs de la classe dont la date limite est >= à la date de la séance
    const { data: homeworks, error: hwError } = await supabaseAdmin
      .from('homework')
      .select('id')
      .eq('class_id', session.class_id)
      .gte('due_date', session.date);

    if (hwError) throw hwError;

    console.log(`Devoirs trouvés: ${homeworks ? homeworks.length : 0}`);

    if (!homeworks || homeworks.length === 0) {
      console.log('Aucun devoir trouvé, retour tableau vide');
      return res.json([]);
    }

    const homeworkIds = homeworks.map(hw => hw.id);
    console.log(`IDs des devoirs: ${homeworkIds.join(', ')}`);

    // Récupérer les soumissions pour ces devoirs
    const { data, error } = await supabaseAdmin
      .from('homework_submissions')
      .select('*')
      .in('homework_id', homeworkIds);

    if (error) throw error;
    
    console.log(`Soumissions trouvées: ${data ? data.length : 0}`);
    if (data && data.length > 0) {
      console.log('Détails des soumissions:', data);
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== MINI-ÉVALUATIONS ====================

// Récupérer les compétences
router.get('/competencies', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('competencies')
      .select('*')
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Enregistrer une mini-évaluation
router.post('/mini-assessments', async (req, res) => {
  try {
    const { session_id, student_id, subject_id, competencies, score, notes } = req.body;

    const { data: assessment, error: assessmentError } = await supabaseAdmin
      .from('mini_assessments')
      .insert({
        session_id,
        student_id,
        subject_id,
        assessed: true,
        score,
        notes
      })
      .select()
      .single();

    if (assessmentError) throw assessmentError;

    // Enregistrer les compétences
    if (competencies && Object.keys(competencies).length > 0) {
      const competencyEntries = Object.entries(competencies).map(([competency_id, level]) => ({
        assessment_id: assessment.id,
        competency_id,
        level
      }));

      const { error: compError } = await supabaseAdmin
        .from('assessment_competencies')
        .insert(competencyEntries);

      if (compError) throw compError;
    }

    res.status(201).json(assessment);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== CAHIER DE CLASSE ====================

// Récupérer le planning hebdomadaire
router.get('/lesson-plan/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { week_start } = req.query;
    const teacherId = req.user.id;

    let query = supabaseAdmin
      .from('lesson_plan')
      .select('*')
      .eq('class_id', classId)
      .eq('week_start', week_start);

    // La direction pédagogique voit le planning de tous les profs de la classe
    if (isPedagogicalStaff(req.user)) {
      const allowed = await canAccessClassAsTeacher(req, classId);
      if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
    } else {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer/Mettre à jour une leçon
router.post('/lesson-plan', async (req, res) => {
  try {
    const { class_id, subject_id, week_start, day_of_week, topic, objectives, resources, homework } = req.body;
    const teacherId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('lesson_plan')
      .insert({
        class_id,
        teacher_id: teacherId,
        subject_id,
        week_start,
        day_of_week,
        topic,
        objectives,
        resources,
        homework
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

// Mettre à jour une leçon
router.put('/lesson-plan/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const { topic, objectives, resources, homework } = req.body;

    const { data, error } = await supabaseAdmin
      .from('lesson_plan')
      .update({
        topic,
        objectives,
        resources,
        homework
      })
      .eq('id', lessonId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une leçon
router.delete('/lesson-plan/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;

    const { error } = await supabaseAdmin
      .from('lesson_plan')
      .delete()
      .eq('id', lessonId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== FICHE ÉLÈVE ====================

// Récupérer les infos d'un élève
router.get('/students/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', studentId)
      .eq('role', 'student')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les statistiques d'un élève
router.get('/students/:studentId/stats', async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: tracking, error } = await supabaseAdmin
      .from('session_tracking')
      .select('presence, participation, discipline, attitude, writing, phone_use, sleeping, cahier_present, homework, mini_eval, sessions(id, tracking_options)')
      .eq('student_id', studentId);

    if (error) throw error;

    const validTracking = (tracking || []).filter(t => t.sessions && t.sessions.id);
    const baseTracking = validTracking.length > 0 ? validTracking : (tracking || []);
    const totalTracked = baseTracking.length;

    // Homework
    const homeworkTracking = baseTracking.filter(t => t.homework !== null && t.homework !== undefined);
    const homeworkDoneCount = homeworkTracking.filter(t => t.homework === 'done' || t.homework === true).length;

    // Writing
    const writingTracked = baseTracking.filter(t => t.writing !== null && t.writing !== undefined);
    const writingDoneCount = writingTracked.filter(t => t.writing === true).length;

    // Cahier
    const cahierTracked = baseTracking.filter(t => t.cahier_present !== null && t.cahier_present !== undefined);
    const cahierPresentCount = cahierTracked.filter(t => t.cahier_present === true).length;

    // Phone
    const phoneUseCount = baseTracking.filter(t => t.phone_use === true).length;

    // Sleeping
    const sleepingCount = baseTracking.filter(t => t.sleeping === true).length;

    const stats = {
      total_sessions: totalTracked,
      // Présence
      present_count: baseTracking.filter(t => t.presence === 'present').length,
      absent_count: baseTracking.filter(t => t.presence === 'absent').length,
      late_count: baseTracking.filter(t => t.presence === 'late').length,
      // Participation (used as "Travail" in the UI)
      excellent_participation: baseTracking.filter(t => t.participation === 'excellent').length,
      bon_participation: baseTracking.filter(t => t.participation === 'bon').length,
      faible_participation: baseTracking.filter(t => t.participation === 'faible').length,
      // Discipline / Vigilance
      concentre_count: baseTracking.filter(t => t.discipline === 'concentre').length,
      moyen_count: baseTracking.filter(t => t.discipline === 'moyen').length,
      distrait_count: baseTracking.filter(t => t.discipline === 'distrait').length,
      // Attitude
      correct_count: baseTracking.filter(t => t.attitude === 'correct').length,
      bavarde_count: baseTracking.filter(t => t.attitude === 'bavarde' || t.attitude === 'bavarre').length,
      perturbateur_count: baseTracking.filter(t => t.attitude === 'perturbateur').length,
      // Phone & sleeping
      phone_use_count: phoneUseCount,
      phone_use_rate: totalTracked > 0 ? Math.round((phoneUseCount / totalTracked) * 100) : 0,
      sleeping_count: sleepingCount,
      // Writing
      writing_done_count: writingDoneCount,
      writing_total_count: writingTracked.length,
      writing_rate: writingTracked.length > 0 ? Math.round((writingDoneCount / writingTracked.length) * 100) : null,
      // Cahier
      cahier_present_count: cahierPresentCount,
      cahier_total_count: cahierTracked.length,
      cahier_rate: cahierTracked.length > 0 ? Math.round((cahierPresentCount / cahierTracked.length) * 100) : null,
      // Homework
      homework_tracked: homeworkTracking.length > 0,
      homework_done_count: homeworkTracking.length > 0 ? homeworkDoneCount : null,
      homework_total_count: homeworkTracking.length > 0 ? homeworkTracking.length : null,
      homework_rate: homeworkTracking.length > 0 ? Math.round((homeworkDoneCount / homeworkTracking.length) * 100) : null
    };

    res.json(stats);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer l'historique d'un élève
router.get('/students/:studentId/tracking', async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('session_tracking')
      .select('*, sessions(date)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = data.map(t => ({
      ...t,
      session_date: t.sessions?.date
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== MÉTRIQUES & DASHBOARD ====================

// Récupérer les métriques détaillées d'un élève
router.get('/students/:studentId/metrics', async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user.id;

    // Récupérer les infos élève
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', studentId)
      .eq('role', 'student')
      .single();

    if (studentError) throw studentError;

    // Récupérer le suivi des 30 derniers jours avec les options de suivi
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: tracking, error: trackingError } = await supabaseAdmin
      .from('session_tracking')
      .select('*, sessions(id, date, start_time, end_time, tracking_options)')
      .eq('student_id', studentId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (trackingError) throw trackingError;

    // Filtrer pour ne garder que les suivis avec une séance existante
    const validTracking = (tracking || []).filter(t => t.sessions && t.sessions.id);

    // Filtrer les suivis selon les options de suivi de chaque séance
    const presenceTracking = validTracking.filter(t => t.sessions?.tracking_options?.presence !== false);
    const workTracking = validTracking.filter(t => t.sessions?.tracking_options?.discipline !== false);
    const disciplineTracking = validTracking.filter(t => t.sessions?.tracking_options?.discipline !== false);
    const phoneTracking = validTracking.filter(t => t.sessions?.tracking_options?.phone_use !== false);
    const participationTracking = validTracking.filter(t => t.sessions?.tracking_options?.participation !== false);

    // Calculer les statistiques uniquement pour les séances où l'option est activée
    const presenceStats = {
      present: presenceTracking.filter(t => t.presence === 'present').length,
      absent: presenceTracking.filter(t => t.presence === 'absent').length,
      late: presenceTracking.filter(t => t.presence === 'late').length,
      excused: presenceTracking.filter(t => t.presence === 'excused').length,
    };

    const workStats = {
      excellent: workTracking.filter(t => t.work_status === 'excellent').length,
      good: workTracking.filter(t => t.work_status === 'good').length,
      average: workTracking.filter(t => t.work_status === 'average').length,
      poor: workTracking.filter(t => t.work_status === 'poor').length,
    };

    const disciplineStats = {
      concentre: disciplineTracking.filter(t => t.discipline === 'concentre').length,
      moyen: disciplineTracking.filter(t => t.discipline === 'moyen').length,
      distrait: disciplineTracking.filter(t => t.discipline === 'distrait').length,
    };

    const phoneStats = {
      used: phoneTracking.filter(t => t.phone_use === true).length,
      not_used: phoneTracking.filter(t => t.phone_use === false).length,
    };

    const participationStats = {
      excellent: participationTracking.filter(t => t.participation === 'excellent').length,
      bon: participationTracking.filter(t => t.participation === 'bon').length,
      faible: participationTracking.filter(t => t.participation === 'faible').length,
    };

    // Calculer les scores globaux (0-100) uniquement pour les métriques activées
    const presenceScore = presenceTracking.length > 0 
      ? Math.round(((presenceStats.present + presenceStats.excused) / presenceTracking.length) * 100) 
      : null;
    const workScore = workTracking.length > 0 
      ? Math.round(((workStats.excellent + workStats.good) / workTracking.length) * 100) 
      : null;
    const disciplineScore = disciplineTracking.length > 0 
      ? Math.round(
          ((disciplineStats.concentre * 100) + (disciplineStats.moyen * 60) + (disciplineStats.distrait * 20))
          / disciplineTracking.length
        )
      : null;
    const phoneScore = phoneTracking.length > 0 
      ? Math.round((phoneStats.used / phoneTracking.length) * 100) 
      : null;
    const participationScore = participationTracking.length > 0 
      ? Math.round(
          ((participationStats.excellent * 100) + (participationStats.bon * 70) + (participationStats.faible * 30))
          / participationTracking.length
        )
      : null;

    // Récupérer les mini-évaluations
    const { data: assessments, error: assessmentError } = await supabaseAdmin
      .from('mini_assessments')
      .select('*, assessment_competencies(*)')
      .eq('student_id', studentId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (assessmentError) throw assessmentError;

    // Cahier stats (uniquement si activé)
    const cahierTracking = validTracking.filter(t => t.sessions?.tracking_options?.cahier === true);
    const cahierStats = {
      lecon: cahierTracking.length > 0 
        ? Math.round((cahierTracking.filter(t => t.cahier_lesson === 'complete').length / cahierTracking.length) * 100) 
        : null,
      collage: cahierTracking.length > 0 
        ? Math.round((cahierTracking.filter(t => t.cahier_documents === 'correct').length / cahierTracking.length) * 100) 
        : null,
      lisibilite: cahierTracking.length > 0 
        ? Math.round((cahierTracking.filter(t => t.cahier_readability === 'readable').length / cahierTracking.length) * 100) 
        : null,
    };

    // Récupérer les 7 derniers jours pour la heatmap
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayTracking = validTracking.filter(t => t.sessions?.date === dateStr);
      
      last7Days.push({
        date: dateStr,
        presence: dayTracking.length > 0 ? dayTracking[0].presence : null,
        work_status: dayTracking.length > 0 ? dayTracking[0].work_status : null,
        discipline: dayTracking.length > 0 ? dayTracking[0].discipline : null,
        phone_use: dayTracking.length > 0 ? dayTracking[0].phone_use : null,
      });
    }

    res.json({
      student,
      presenceScore,
      workScore,
      participationScore,
      disciplineScore,
      phoneScore,
      presenceStats,
      workStats,
      participationStats,
      disciplineStats,
      phoneStats,
      cahierStats,
      assessments: assessments || [],
      heatmap: last7Days,
      totalSessions: validTracking.length,
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les métriques de tous les élèves d'une classe
router.get('/classes/:classId/students-metrics', async (req, res) => {
  try {
    const { classId } = req.params;
    const teacherId = req.user.id;

    // Récupérer tous les élèves de la classe
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('class_id', classId)
      .eq('role', 'student');

    if (studentsError) {
      console.error('Erreur récupération élèves:', studentsError);
      throw studentsError;
    }

    if (!students || students.length === 0) {
      return res.json([]);
    }

    // Récupérer le suivi des 30 derniers jours avec vérification que la séance existe
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let trackingQuery = supabaseAdmin
      .from('session_tracking')
      .select('student_id, presence, cahier_present, sleeping, homework, participation, work_status, discipline, phone_use, cahier_lesson, cahier_documents, cahier_readability, attitude, comment, session_id, sessions!inner(id, class_id, teacher_id, tracking_options)')
      .eq('sessions.class_id', classId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    // La direction pédagogique voit le suivi de tous les profs de la classe
    if (isPedagogicalStaff(req.user)) {
      const allowed = await canAccessClassAsTeacher(req, classId);
      if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
    } else {
      trackingQuery = trackingQuery.eq('sessions.teacher_id', teacherId);
    }

    const { data: tracking, error: trackingError } = await trackingQuery;

    if (trackingError) {
      console.error('Erreur récupération suivi:', trackingError);
      throw trackingError;
    }

    // Filtrer pour ne garder que les suivis avec une séance existante
    const validTracking = (tracking || []).filter(t => t.sessions && t.sessions.id);

    // Calculer les statistiques de classe pour sleeping et phone_use
    const classStats = {
      sleepingPercentage: 0,
      phoneUsePercentage: 0
    };

    if (validTracking.length > 0) {
      const sleepingCount = validTracking.filter(t => t.sleeping === true).length;
      const phoneUseCount = validTracking.filter(t => t.phone_use === true).length;
      classStats.sleepingPercentage = Math.round((sleepingCount / validTracking.length) * 100);
      classStats.phoneUsePercentage = Math.round((phoneUseCount / validTracking.length) * 100);
    }

    // Calculer les métriques pour chaque élève
    const metricsPerStudent = students.map(student => {
      const studentTracking = validTracking.filter(t => t.student_id === student.id);
      const total = studentTracking.length;

      // Si pas de données de suivi, retourner des scores null (pas encore évalué)
      if (total === 0) {
        return {
          id: student.id,
          name: `${student.first_name} ${student.last_name}`,
          presenceScore: null,
          writingScore: null,
          cahierPresentScore: null,
          sleepingPercentage: null,
          sleepingScore: null,
          sleepingIncidents: null,
          homeworkScore: null,
          participationScore: null,
          participationPercentage: null,
          participationIncidents: null,
          disciplineScore: null,
          phoneUsePercentage: null,
          phoneScore: null,
          cahierScore: null,
          attitudeScore: null,
          globalScore: null,
          badge: 'unrated',
          totalSessions: 0,
          trackingOptions: {}
        };
      }

      // Calculer les scores uniquement pour les éléments activés dans chaque séance
      const scores = {};
      const activeMetrics = [];

      // Présence - toujours activée par défaut
      const presenceTracking = studentTracking.filter(t => t.sessions?.tracking_options?.presence !== false);
      const presentTracking = studentTracking.filter(t => t.presence === 'present' || t.presence === 'excused');
      if (presenceTracking.length > 0) {
        scores.presenceScore = Math.round(
          ((presenceTracking.filter(t => t.presence === 'present' || t.presence === 'excused').length) / presenceTracking.length) * 100
        );
        activeMetrics.push(scores.presenceScore);
      } else {
        scores.presenceScore = null;
      }

      // Cahier présent
      const cahierPresentTracking = presentTracking.filter(t => t.sessions?.tracking_options?.cahier_present !== false);
      if (cahierPresentTracking.length > 0) {
        scores.cahierPresentScore = Math.round(
          ((cahierPresentTracking.filter(t => t.cahier_present === true).length) / cahierPresentTracking.length) * 100
        );
        activeMetrics.push(scores.cahierPresentScore);
      } else {
        scores.cahierPresentScore = null;
      }

      // Écriture (activé uniquement si true)
      const writingTracking = presentTracking.filter(t => t.sessions?.tracking_options?.writing === true);
      if (writingTracking.length > 0) {
        scores.writingScore = Math.round(
          ((writingTracking.filter(t => t.writing === true).length) / writingTracking.length) * 100
        );
        activeMetrics.push(scores.writingScore);
      } else {
        scores.writingScore = null;
      }

      // Dormance
      const sleepingTracking = presentTracking.filter(t => t.sessions?.tracking_options?.sleeping !== false);
      if (sleepingTracking.length > 0) {
        const studentSleepingCount = sleepingTracking.filter(t => t.sleeping === true).length;
        const studentSleepingPercentage = Math.round((studentSleepingCount / sleepingTracking.length) * 100);
        scores.sleepingIncidents = studentSleepingCount;
        scores.sleepingPercentage = -studentSleepingPercentage;
        scores.sleepingScore = Math.max(0, 100 - studentSleepingPercentage);
        activeMetrics.push(scores.sleepingScore);
      } else {
        scores.sleepingIncidents = null;
        scores.sleepingPercentage = null;
        scores.sleepingScore = null;
      }

      // Devoirs (activé uniquement si true)
      const homeworkTracking = presentTracking.filter(t => t.sessions?.tracking_options?.homework === true);
      if (homeworkTracking.length > 0) {
        scores.homeworkScore = Math.round(
          ((homeworkTracking.filter(t => t.homework === 'done').length) / homeworkTracking.length) * 100
        );
        activeMetrics.push(scores.homeworkScore);
      } else {
        scores.homeworkScore = null;
      }

      // Participation
      const participationTracking = presentTracking.filter(t => t.sessions?.tracking_options?.participation !== false);
      if (participationTracking.length > 0) {
        const excellentCount = participationTracking.filter(t => t.participation === 'excellent').length;
        const bonCount = participationTracking.filter(t => t.participation === 'bon').length;
        const faibleCount = participationTracking.filter(t => t.participation === 'faible').length;
        const weightedScore = Math.round(
          ((excellentCount * 100) + (bonCount * 70) + (faibleCount * 30)) / participationTracking.length
        );
        scores.participationIncidents = excellentCount + bonCount;
        scores.participationPercentage = Math.round(((excellentCount + bonCount) / participationTracking.length) * 100);
        scores.participationScore = weightedScore;
        activeMetrics.push(scores.participationScore);
      } else {
        scores.participationIncidents = null;
        scores.participationPercentage = null;
        scores.participationScore = null;
      }

      // Discipline
      const disciplineTracking = presentTracking.filter(t => t.sessions?.tracking_options?.discipline !== false);
      if (disciplineTracking.length > 0) {
        const concentreCount = disciplineTracking.filter(t => t.discipline === 'concentre').length;
        const moyenCount = disciplineTracking.filter(t => t.discipline === 'moyen').length;
        const distraitCount = disciplineTracking.filter(t => t.discipline === 'distrait').length;
        scores.disciplineScore = Math.round(
          ((concentreCount * 100) + (moyenCount * 60) + (distraitCount * 20)) / disciplineTracking.length
        );
        activeMetrics.push(scores.disciplineScore);
      } else {
        scores.disciplineScore = null;
      }

      // Téléphone
      const phoneTracking = presentTracking.filter(t => t.sessions?.tracking_options?.phone_use !== false);
      if (phoneTracking.length > 0) {
        const studentPhoneUseCount = phoneTracking.filter(t => t.phone_use === true).length;
        const studentPhoneUsePercentage = Math.round((studentPhoneUseCount / phoneTracking.length) * 100);
        scores.phoneIncidents = studentPhoneUseCount;
        scores.phoneUsePercentage = -studentPhoneUsePercentage;
        scores.phoneScore = Math.max(0, 100 - studentPhoneUsePercentage);
        activeMetrics.push(scores.phoneScore);
      } else {
        scores.phoneIncidents = null;
        scores.phoneUsePercentage = null;
        scores.phoneScore = null;
      }

      // Cahier détaillé (activé uniquement si true)
      const cahierTracking = presentTracking.filter(t => t.sessions?.tracking_options?.cahier === true);
      if (cahierTracking.length > 0) {
        const cahierLessonScore = Math.round(
          ((cahierTracking.filter(t => t.cahier_lesson === 'complete').length) / cahierTracking.length) * 100
        );
        const cahierDocScore = Math.round(
          ((cahierTracking.filter(t => t.cahier_documents === 'correct').length) / cahierTracking.length) * 100
        );
        const cahierReadScore = Math.round(
          ((cahierTracking.filter(t => t.cahier_readability === 'readable').length) / cahierTracking.length) * 100
        );
        scores.cahierScore = Math.round((cahierLessonScore + cahierDocScore + cahierReadScore) / 3);
        activeMetrics.push(scores.cahierScore);
      } else {
        scores.cahierScore = null;
      }

      // Attitude (activé uniquement si true)
      const attitudeTracking = presentTracking.filter(t => t.sessions?.tracking_options?.attitude === true);
      if (attitudeTracking.length > 0) {
        const correctCount = attitudeTracking.filter(t => t.attitude === 'correct').length;
        const bavardCount = attitudeTracking.filter(t => t.attitude === 'bavarre').length;
        const perturbateurCount = attitudeTracking.filter(t => t.attitude === 'perturbateur').length;
        scores.attitudeScore = Math.round(
          ((correctCount * 100) + (bavardCount * 50) + (perturbateurCount * 10)) / attitudeTracking.length
        );
        activeMetrics.push(scores.attitudeScore);
      } else {
        scores.attitudeScore = null;
      }

      // Calcul du score global (moyenne uniquement des métriques activées)
      const globalScore = activeMetrics.length > 0 ? Math.round(activeMetrics.reduce((a, b) => a + b, 0) / activeMetrics.length) : 0;

      // Déterminer le badge
      let badge = 'normal';
      if (globalScore >= 80) badge = 'excellent';
      else if (globalScore >= 60) badge = 'good';
      else if (globalScore < 40) badge = 'alert';

      return {
        id: student.id,
        name: `${student.first_name} ${student.last_name}`,
        ...scores,
        globalScore,
        badge,
        totalSessions: total,
        trackingOptions: {}
      };
    });

    res.json(metricsPerStudent);
  } catch (error) {
    console.error('Erreur endpoint students-metrics:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ==================== SUIVI DES CONTRÔLES ====================

// Créer ou mettre à jour le tracking d'un contrôle (upsert)
router.post('/control-tracking', async (req, res) => {
  try {
    const {
      session_id,
      student_id,
      presence,
      presence_reason,
      material_status,
      missing_materials,
      phone_use,
      phone_confiscated,
      discipline_status,
      discipline_notes,
      copy_submitted,
      copy_notes
    } = req.body;

    const teacherId = req.user.id;

    // Vérifier que la session existe et appartient au professeur
    // (ou est dans le périmètre de la direction pédagogique)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id, type, teacher_id, class_id')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Séance non trouvée' });
    }

    if (session.teacher_id !== teacherId) {
      const allowed = isPedagogicalStaff(req.user) && await canAccessClassAsTeacher(req, session.class_id);
      if (!allowed) return res.status(403).json({ error: 'Non autorisé' });
    }

    if (session.type !== 'control') {
      return res.status(400).json({ error: 'Cette séance n\'est pas un contrôle' });
    }

    // Vérifier si une entrée existe déjà
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('control_tracking')
      .select('id')
      .eq('session_id', session_id)
      .eq('student_id', student_id)
      .single();

    let data, error;

    if (existing) {
      // Mettre à jour l'entrée existante
      const result = await supabaseAdmin
        .from('control_tracking')
        .update({
          presence,
          presence_reason,
          material_status,
          missing_materials,
          phone_use,
          phone_confiscated,
          discipline_status,
          discipline_notes,
          copy_submitted,
          copy_notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Créer une nouvelle entrée
      const result = await supabaseAdmin
        .from('control_tracking')
        .insert({
          session_id,
          student_id,
          presence,
          presence_reason,
          material_status,
          missing_materials,
          phone_use,
          phone_confiscated,
          discipline_status,
          discipline_notes,
          copy_submitted,
          copy_notes
        })
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer le tracking de contrôle pour une session
router.get('/sessions/:sessionId/control-tracking', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.user.id;

    // Vérifier que la session appartient au professeur
    // (ou est dans le périmètre de la direction pédagogique)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id, type, teacher_id, class_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Séance non trouvée' });
    }

    if (session.teacher_id !== teacherId) {
      const allowed = isPedagogicalStaff(req.user) && await canAccessClassAsTeacher(req, session.class_id);
      if (!allowed) return res.status(403).json({ error: 'Non autorisé' });
    }

    const { data, error } = await supabaseAdmin
      .from('control_tracking')
      .select(`
        *,
        profiles!control_tracking_student_id_fkey (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('session_id', sessionId);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer le tracking de contrôle pour tous les élèves d'une session de contrôle
router.post('/sessions/:sessionId/control-tracking/batch', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.user.id;

    // Vérifier que la session existe et est un contrôle
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id, type, teacher_id, class_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Séance non trouvée' });
    }

    if (session.teacher_id !== teacherId) {
      const allowed = isPedagogicalStaff(req.user) && await canAccessClassAsTeacher(req, session.class_id);
      if (!allowed) return res.status(403).json({ error: 'Non autorisé' });
    }

    if (session.type !== 'control') {
      return res.status(400).json({ error: 'Cette séance n\'est pas un contrôle' });
    }

    // Récupérer tous les élèves de la classe
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('class_id', session.class_id)
      .eq('role', 'student');

    if (studentsError) throw studentsError;

    // Créer les entrées de tracking pour chaque élève
    const trackingData = students.map(student => ({
      session_id: sessionId,
      student_id: student.id,
      presence: 'present',
      material_status: 'complete',
      phone_use: false,
      phone_confiscated: false,
      discipline_status: 'good',
      copy_submitted: false
    }));

    const { data, error } = await supabaseAdmin
      .from('control_tracking')
      .insert(trackingData)
      .select();

    if (error) throw error;
    res.status(201).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les notes existantes d'un contrôle
router.get('/controls/:controlId/notes', async (req, res) => {
  try {
    const { controlId } = req.params;

    // Créer un client Supabase authentifié avec le token JWT de l'utilisateur
    const supabase = createAuthenticatedClient(req.headers.authorization);

    // Récupérer les notes du contrôle (les politiques RLS vérifient automatiquement les permissions)
    const { data, error } = await supabase
      .from('control_notes')
      .select('*')
      .eq('control_id', controlId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur lors de la récupération des notes:', error);
      return res.status(500).json({ error: 'Erreur lors de la récupération des notes', details: error.message });
    }

    console.log(`${data?.length || 0} notes récupérées pour le contrôle ${controlId}`);
    res.json(data || []);

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== NOTES DES CONTRÔLES ====================

// Enregistrer les notes d'un contrôle
router.post('/controls/:controlId/notes', async (req, res) => {
  try {
    const { controlId } = req.params;
    const { notes } = req.body;
    const teacherId = req.user.id;

    // Créer un client Supabase authentifié avec le token JWT de l'utilisateur
    const supabase = createAuthenticatedClient(req.headers.authorization);

    if (!Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: 'Aucune note à enregistrer' });
    }

    // Préparer et valider les notes
    const notesToInsert = notes.filter(note => {
      return note.student_id && note.note !== undefined && note.note !== null && note.note !== '';
    }).map(note => ({
      control_id: controlId,
      student_id: note.student_id,
      note: parseFloat(note.note),
      appreciation: note.appreciation || '',
      created_at: new Date().toISOString()
    }));

    if (notesToInsert.length === 0) {
      return res.status(400).json({ error: 'Aucune note valide à enregistrer' });
    }

    // Insérer ou mettre à jour les notes dans la base de données avec le client authentifié
    // Les politiques RLS vont automatiquement vérifier les permissions
    const { data, error: insertError } = await supabase
      .from('control_notes')
      .upsert(notesToInsert, {
        onConflict: 'control_id,student_id',
        ignoreDuplicates: false
      })
      .select();

    if (insertError) {
      console.error('Erreur lors de l\'insertion des notes:', insertError);
      return res.status(500).json({ error: 'Erreur lors de l\'enregistrement des notes', details: insertError.message });
    }

    console.log(`${notesToInsert.length} notes enregistrées/mises à jour avec succès pour le contrôle ${controlId}`);
    res.status(201).json({ 
      success: true, 
      message: `${notesToInsert.length} note(s) enregistrée(s) avec succès`,
      count: notesToInsert.length,
      data: data 
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== IMPORT EXCEL DES NOTES ====================

// Étape 1 : Parser le fichier Excel et retourner les données détectées
router.post('/controls/parse-excel', upload.single('file'), async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { classId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    if (!classId) {
      return res.status(400).json({ error: 'classId requis' });
    }

    // Vérifier l'accès à cette classe (prof assigné ou direction pédagogique)
    const excelClassAllowed = await canAccessClassAsTeacher(req, classId);
    if (!excelClassAllowed) {
      return res.status(403).json({ error: 'Accès non autorisé à cette classe' });
    }

    // Lire le fichier Excel
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rawData || rawData.length < 3) {
      return res.status(400).json({ error: 'Fichier Excel vide ou format invalide' });
    }

    // Chercher la ligne d'en-tête contenant "رقم التلميذ" ou "إسم التلميذ"
    let headerRowIndex = -1;
    let studentIdColIndex = -1;
    let studentNameColIndex = -1;

    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const row = rawData[i];
      for (let j = 0; j < row.length; j++) {
        const cellVal = String(row[j] || '').trim();
        if (cellVal.includes('رقم التلميذ') || cellVal.includes('رقم التلميد')) {
          studentIdColIndex = j;
          headerRowIndex = i;
        }
        if (cellVal.includes('إسم التلميذ') || cellVal.includes('اسم التلميذ') || cellVal.includes('إسم التلميد')) {
          studentNameColIndex = j;
          headerRowIndex = i;
        }
      }
      if (headerRowIndex >= 0) break;
    }

    if (headerRowIndex < 0 || studentNameColIndex < 0) {
      return res.status(400).json({ 
        error: 'Format Excel non reconnu. Impossible de trouver les colonnes "رقم التلميذ" ou "إسم التلميذ".' 
      });
    }

    // Détecter les colonnes de contrôles et activités dans la ligne d'en-tête
    const headerRow = rawData[headerRowIndex];
    const controlColumns = [];

    const controlPatterns = [
      { pattern: /الفرض\s*(الأول|1)/i, label: 'الفرض الأول', controlNumber: 1 },
      { pattern: /الفرض\s*(الثاني|2)/i, label: 'الفرض الثاني', controlNumber: 2 },
      { pattern: /الفرض\s*(الثالث|3)/i, label: 'الفرض الثالث', controlNumber: 3 },
      { pattern: /الفرض\s*(الرابع|4)/i, label: 'الفرض الرابع', controlNumber: 4 },
      { pattern: /الأنشطة\s*المندمجة/i, label: 'الأنشطة المندمجة', controlNumber: 'activities' },
    ];

    const detectedControlNumbers = new Set(); // Éviter les doublons (cellules fusionnées)
    for (let j = 0; j < headerRow.length; j++) {
      const cellVal = String(headerRow[j] || '').trim();
      if (!cellVal) continue;
      for (const cp of controlPatterns) {
        if (cp.pattern.test(cellVal) && !detectedControlNumbers.has(cp.controlNumber)) {
          detectedControlNumbers.add(cp.controlNumber);
          // La colonne de notes est souvent la même colonne ou la sous-colonne "النقطة"
          // Vérifier si la ligne suivante a "النقطة" pour trouver la vraie colonne de notes
          let noteColIndex = j;
          if (headerRowIndex + 1 < rawData.length) {
            const subHeaderRow = rawData[headerRowIndex + 1];
            // Chercher "النقطة" dans les colonnes proches (élargi pour les cellules fusionnées)
            for (let k = j; k <= Math.min(j + 3, (subHeaderRow?.length || 0) - 1); k++) {
              const subVal = String(subHeaderRow[k] || '').trim();
              if (subVal.includes('النقطة') || subVal.includes('النقط')) {
                noteColIndex = k;
                break;
              }
            }
          }
          controlColumns.push({
            colIndex: noteColIndex,
            label: cp.label,
            controlNumber: cp.controlNumber,
            originalColIndex: j
          });
          break;
        }
      }
    }

    if (controlColumns.length === 0) {
      return res.status(400).json({ 
        error: 'Aucune colonne de contrôle détectée (الفرض الأول, الفرض الثاني, الأنشطة المندمجة...)' 
      });
    }

    // Extraire les données des élèves (sauter l'en-tête + sous-en-tête)
    const dataStartRow = headerRowIndex + 2; // +1 pour en-tête, +1 pour sous-en-tête "النقطة"
    const studentsData = [];

    for (let i = dataStartRow; i < rawData.length; i++) {
      const row = rawData[i];
      const studentName = String(row[studentNameColIndex] || '').trim();
      const studentId = String(row[studentIdColIndex] || '').trim();

      // Ignorer les lignes vides ou les en-têtes dupliquées
      if (!studentName || studentName.includes('رقم') || studentName.includes('إسم') || studentName.includes('اسم')) {
        continue;
      }

      const grades = {};
      for (const cc of controlColumns) {
        const rawVal = row[cc.colIndex];
        let noteVal = null;
        if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
          // Gérer les virgules comme séparateur décimal
          const parsed = parseFloat(String(rawVal).replace(',', '.'));
          if (!isNaN(parsed)) {
            noteVal = parsed;
          }
        }
        grades[cc.label] = noteVal;
      }

      studentsData.push({
        excelRowIndex: i,
        studentMassar: studentId,
        studentName: studentName,
        grades: grades
      });
    }

    if (studentsData.length === 0) {
      return res.status(400).json({ error: 'Aucun élève trouvé dans le fichier Excel' });
    }

    // Récupérer les élèves de la classe dans la base de données
    const { data: dbStudents, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('class_id', classId)
      .eq('role', 'student')
      .order('last_name');

    if (studentsError) {
      console.error('Erreur récupération élèves:', studentsError);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    // Récupérer les contrôles du professeur pour cette classe
    const { data: dbControls, error: controlsError } = await supabaseAdmin
      .from('controls_plan')
      .select('id, name, date, status')
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .order('date', { ascending: true });

    if (controlsError) {
      console.error('Erreur récupération contrôles:', controlsError);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    // Matcher les élèves Excel avec les élèves DB par nom
    const normalizeArabic = (str) => {
      return String(str || '').trim()
        .replace(/[\u064B-\u065F\u0670]/g, '') // Supprimer les diacritiques arabes
        .replace(/\s+/g, ' ')
        .toLowerCase();
    };

    const matchedStudents = studentsData.map(excelStudent => {
      const excelNameNorm = normalizeArabic(excelStudent.studentName);

      let bestMatch = null;
      let bestScore = 0;

      for (const dbStudent of (dbStudents || [])) {
        const dbFullName = normalizeArabic(`${dbStudent.last_name} ${dbStudent.first_name}`);
        const dbFullNameReverse = normalizeArabic(`${dbStudent.first_name} ${dbStudent.last_name}`);

        // Correspondance exacte
        if (excelNameNorm === dbFullName || excelNameNorm === dbFullNameReverse) {
          bestMatch = dbStudent;
          bestScore = 100;
          break;
        }

        // Correspondance partielle (contient)
        if (dbFullName.includes(excelNameNorm) || excelNameNorm.includes(dbFullName)) {
          const score = 80;
          if (score > bestScore) {
            bestMatch = dbStudent;
            bestScore = score;
          }
        }

        // Correspondance par mots communs
        const excelWords = excelNameNorm.split(' ').filter(w => w.length > 1);
        const dbWords = dbFullName.split(' ').filter(w => w.length > 1);
        const commonWords = excelWords.filter(w => dbWords.includes(w));
        const wordScore = (commonWords.length / Math.max(excelWords.length, dbWords.length)) * 70;
        if (wordScore > bestScore) {
          bestMatch = dbStudent;
          bestScore = wordScore;
        }
      }

      return {
        ...excelStudent,
        matchedStudent: bestMatch ? {
          id: bestMatch.id,
          name: `${bestMatch.last_name} ${bestMatch.first_name}`,
          email: bestMatch.email
        } : null,
        matchScore: bestScore,
        matched: bestScore >= 50
      };
    });

    res.json({
      success: true,
      detectedColumns: controlColumns.map(cc => ({
        label: cc.label,
        controlNumber: cc.controlNumber
      })),
      students: matchedStudents,
      dbControls: (dbControls || []).map(c => ({
        id: c.id,
        name: c.name,
        date: c.date,
        status: c.status
      })),
      totalExcelStudents: studentsData.length,
      totalMatchedStudents: matchedStudents.filter(s => s.matched).length,
      totalDbStudents: (dbStudents || []).length
    });

  } catch (error) {
    console.error('Erreur parse Excel:', error);
    res.status(500).json({ error: 'Erreur lors de l\'analyse du fichier Excel' });
  }
});

// Étape 2 : Sauvegarder les notes importées depuis Excel
router.post('/controls/import-excel-notes', async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { classId, mappings, students } = req.body;
    // mappings: { "الفرض الأول": "control-uuid-1", "الفرض الثاني": "control-uuid-2", ... }
    // students: [{ matchedStudentId, grades: { "الفرض الأول": 16, ... } }, ...]

    if (!classId || !mappings || !students || !Array.isArray(students)) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    // Vérifier l'accès à cette classe (prof assigné ou direction pédagogique)
    const importClassAllowed = await canAccessClassAsTeacher(req, classId);
    if (!importClassAllowed) {
      return res.status(403).json({ error: 'Accès non autorisé à cette classe' });
    }

    // Vérifier que les contrôles appartiennent bien au professeur
    const controlIds = Object.values(mappings).filter(id => id);
    if (controlIds.length === 0) {
      return res.status(400).json({ error: 'Aucun mapping de contrôle fourni' });
    }

    let validControlsQuery = supabaseAdmin
      .from('controls_plan')
      .select('id, name')
      .eq('class_id', classId)
      .in('id', controlIds);

    // La direction pédagogique peut importer les notes des contrôles de
    // n'importe quel prof de la classe
    if (!isPedagogicalStaff(req.user)) {
      validControlsQuery = validControlsQuery.eq('teacher_id', teacherId);
    }

    const { data: validControls, error: vcError } = await validControlsQuery;

    if (vcError) {
      console.error('Erreur vérification contrôles:', vcError);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    const validControlIds = new Set((validControls || []).map(c => c.id));

    // Préparer toutes les notes à insérer/mettre à jour
    const allNotes = [];
    let skippedCount = 0;

    for (const student of students) {
      if (!student.matchedStudentId) {
        skippedCount++;
        continue;
      }

      for (const [columnLabel, controlId] of Object.entries(mappings)) {
        if (!controlId || !validControlIds.has(controlId)) continue;

        const grade = student.grades?.[columnLabel];
        if (grade === null || grade === undefined || grade === '') continue;

        const noteVal = parseFloat(String(grade).replace(',', '.'));
        if (isNaN(noteVal)) continue;

        // Clamp la note entre 0 et 20 (contrainte CHECK dans la DB)
        const clampedNote = Math.min(20, Math.max(0, noteVal));

        allNotes.push({
          control_id: controlId,
          student_id: student.matchedStudentId,
          note: clampedNote,
          appreciation: ''
        });
      }
    }

    if (allNotes.length === 0) {
      return res.status(400).json({ error: 'Aucune note valide à importer' });
    }

    // Insérer/mettre à jour par lots (par contrôle)
    const results = {};
    const notesByControl = {};
    for (const note of allNotes) {
      if (!notesByControl[note.control_id]) {
        notesByControl[note.control_id] = [];
      }
      notesByControl[note.control_id].push(note);
    }

    let totalInserted = 0;
    let totalErrors = 0;

    for (const [controlId, notes] of Object.entries(notesByControl)) {
      const { data, error: insertError } = await supabaseAdmin
        .from('control_notes')
        .upsert(notes, {
          onConflict: 'control_id,student_id',
          ignoreDuplicates: false
        })
        .select();

      if (insertError) {
        console.error(`Erreur insertion notes contrôle ${controlId}:`, insertError);
        totalErrors += notes.length;
        results[controlId] = { success: false, error: insertError.message };
      } else {
        totalInserted += (data || []).length;
        const controlName = (validControls || []).find(c => c.id === controlId)?.name || controlId;
        results[controlId] = { success: true, count: (data || []).length, name: controlName };
      }
    }

    console.log(`Import Excel: ${totalInserted} notes importées, ${totalErrors} erreurs, ${skippedCount} élèves ignorés`);

    // Après import : pour chaque contrôle, détecter les élèves à signaler
    // (note manquante, copie rendue non notée, absent, triche…) — même logique
    // de couleurs que le rapport de contrôle PDF.
    for (const controlId of Object.keys(notesByControl)) {
      if (!results[controlId] || results[controlId].success === false) continue;
      try {
        const data = await collectControlReportData(controlId, teacherId);
        if (data && !data.forbidden) {
          const rows = buildControlRows(data);
          const flagged = rows
            .filter(r => r.statusLevel !== 'ok')
            .map(r => ({
              name: `${r.last_name} ${r.first_name}`.trim(),
              massar_code: r.massar_code,
              status: r.statusLabel,
              level: r.statusLevel,        // red | orange | yellow | gray
              note: r.note,
              copy: r.copy_submitted || null,
            }));
          const counts = flagged.reduce((acc, f) => { acc[f.level] = (acc[f.level] || 0) + 1; return acc; }, {});
          results[controlId].flagged = flagged;
          results[controlId].flaggedCounts = counts;
          results[controlId].totalStudents = rows.length;
          results[controlId].notedStudents = rows.filter(r => r.hasNote).length;
        }
      } catch (e) {
        console.warn(`[Import Excel] anomalies non calculées pour ${controlId}:`, e.message);
      }
    }

    res.json({
      success: true,
      message: `${totalInserted} note(s) importée(s) avec succès`,
      totalInserted,
      totalErrors,
      skippedStudents: skippedCount,
      details: results
    });

  } catch (error) {
    console.error('Erreur import Excel notes:', error);
    res.status(500).json({ error: 'Erreur lors de l\'importation des notes' });
  }
});

// ==================== TABLEAU DE BORD CLASSE (Analytics) ====================

// Récupérer les métriques agrégées d'une classe
router.get('/classes/:classId/analytics', async (req, res) => {
  try {
    const { classId } = req.params;
    const { days = 30 } = req.query;
    const teacherId = req.user.id;

    // Vérifier l'accès à cette classe (prof assigné ou direction pédagogique)
    const allowed = await canAccessClassAsTeacher(req, classId);
    if (!allowed) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Récupérer les infos de la classe
    const { data: classInfo, error: classError } = await supabaseAdmin
      .from('classes')
      .select('id, name, level')
      .eq('id', classId)
      .single();

    if (classError) throw classError;

    // Récupérer les élèves de la classe
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('class_id', classId)
      .eq('role', 'student');

    if (studentsError) throw studentsError;

    const studentCount = students?.length || 0;

    // Récupérer le suivi sur la période
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    let trackingQuery = supabaseAdmin
      .from('session_tracking')
      .select(`
        *,
        sessions!inner(id, date, start_time, class_id, teacher_id, topic, tracking_options)
      `)
      .eq('sessions.class_id', classId)
      .gte('created_at', startDate.toISOString());

    // La direction pédagogique voit le suivi de tous les profs de la classe
    if (!isPedagogicalStaff(req.user)) {
      trackingQuery = trackingQuery.eq('sessions.teacher_id', teacherId);
    }

    const { data: tracking, error: trackingError } = await trackingQuery;

    if (trackingError) throw trackingError;

    const validTracking = tracking || [];
    const totalRecords = validTracking.length;

    // Calculer les métriques agrégées
    const metrics = {
      presenceRate: 0,
      absenceRate: 0,
      cahierPresentRate: 0,
      writingRate: null,
      sleepingRate: 0,
      homeworkDoneRate: 0,
      participationPositiveRate: 0,
      participationWeakRate: 0,
      disciplineGoodRate: 0,
      disciplinePoorRate: 0,
      phoneUseRate: 0,
      attitudeCorrectRate: 0
    };

    if (totalRecords > 0) {
      const presentTracking = validTracking.filter(t => t.presence === 'present' || t.presence === 'excused');
      const presentCount = presentTracking.length;
      const absentCount = validTracking.filter(t => t.presence === 'absent').length;

      const cahierTracking = presentTracking.filter(t => t.sessions?.tracking_options?.cahier_present !== false);
      const cahierPresentCount = cahierTracking.filter(t => t.cahier_present === true).length;

      const sleepingTracking = presentTracking.filter(t => t.sessions?.tracking_options?.sleeping !== false);
      const sleepingCount = sleepingTracking.filter(t => t.sleeping === true).length;

      const homeworkTracking = presentTracking.filter(t => t.sessions?.tracking_options?.homework === true);
      const homeworkDoneCount = homeworkTracking.filter(t => t.homework === 'done').length;
      const homeworkTracked = homeworkTracking.length;

      const writingTracking = presentTracking.filter(t => t.sessions?.tracking_options?.writing === true);
      const writingCount = writingTracking.filter(t => t.writing === true).length;
      const writingTracked = writingTracking.length;

      const participationTracking = presentTracking.filter(t => t.sessions?.tracking_options?.participation !== false);
      const participationExcellent = participationTracking.filter(t => t.participation === 'excellent').length;
      const participationBon = participationTracking.filter(t => t.participation === 'bon').length;
      const participationWeak = participationTracking.filter(t => t.participation === 'faible').length;

      const disciplineTracking = presentTracking.filter(t => t.sessions?.tracking_options?.discipline !== false);
      const disciplineConcentre = disciplineTracking.filter(t => t.discipline === 'concentre').length;
      const disciplineMoyen = disciplineTracking.filter(t => t.discipline === 'moyen').length;
      const disciplinePoor = disciplineTracking.filter(t => t.discipline === 'distrait').length;

      const phoneTracking = presentTracking.filter(t => t.sessions?.tracking_options?.phone_use !== false);
      const phoneUseCount = phoneTracking.filter(t => t.phone_use === true).length;

      const attitudeTracking = presentTracking.filter(t => t.sessions?.tracking_options?.attitude === true);
      const attitudeCorrect = attitudeTracking.filter(t => t.attitude === 'correct').length;
      const attitudeTracked = attitudeTracking.length;

      metrics.presenceRate = Math.round((presentCount / totalRecords) * 100);
      metrics.absenceRate = Math.round((absentCount / totalRecords) * 100);
      metrics.cahierPresentRate = cahierTracking.length > 0 ? Math.round((cahierPresentCount / cahierTracking.length) * 100) : 0;
      metrics.sleepingRate = sleepingTracking.length > 0 ? Math.round((sleepingCount / sleepingTracking.length) * 100) : 0;
      metrics.writingRate = writingTracked > 0 ? Math.round((writingCount / writingTracked) * 100) : null;
      metrics.homeworkDoneRate = homeworkTracked > 0 ? Math.round((homeworkDoneCount / homeworkTracked) * 100) : null;
      metrics.participationPositiveRate = participationTracking.length > 0
        ? Math.round(((participationExcellent * 100) + (participationBon * 70) + (participationWeak * 30)) / participationTracking.length)
        : 0;
      metrics.participationWeakRate = participationTracking.length > 0 ? Math.round((participationWeak / participationTracking.length) * 100) : 0;
      metrics.disciplineGoodRate = disciplineTracking.length > 0
        ? Math.round(((disciplineConcentre * 100) + (disciplineMoyen * 60) + (disciplinePoor * 20)) / disciplineTracking.length)
        : 0;
      metrics.disciplinePoorRate = disciplineTracking.length > 0 ? Math.round((disciplinePoor / disciplineTracking.length) * 100) : 0;
      metrics.phoneUseRate = phoneTracking.length > 0 ? Math.round((phoneUseCount / phoneTracking.length) * 100) : 0;
      metrics.attitudeCorrectRate = attitudeTracked > 0 ? Math.round((attitudeCorrect / attitudeTracked) * 100) : null;
    }

    // Calculer le score de santé de la classe (uniquement si des données existent)
    let healthScore = null;
    let healthStatus = 'gray';
    if (totalRecords > 0) {
      const writingScoreForHealth = metrics.writingRate ?? 0;
      healthScore = Math.round(
        (metrics.presenceRate * 0.25) +
        (metrics.disciplineGoodRate * 0.20) +
        (metrics.participationPositiveRate * 0.20) +
        ((100 - metrics.phoneUseRate) * 0.15) +
        ((100 - metrics.sleepingRate) * 0.10) +
        (writingScoreForHealth * 0.10)
      );
      healthStatus = healthScore >= 70 ? 'green' : healthScore >= 50 ? 'orange' : 'red';
    }

    // Tendances par jour (derniers 7 ou 14 jours)
    const trendDays = Math.min(parseInt(days), 14);
    const trends = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayTracking = validTracking.filter(t => t.sessions?.date === dateStr);
      const dayTotal = dayTracking.length;
      const dayPresent = dayTracking.filter(t => t.presence === 'present' || t.presence === 'excused');
      const dayPresentTotal = dayPresent.length;
      
      if (dayTotal > 0) {
        trends.push({
          date: dateStr,
          presenceRate: Math.round((dayTracking.filter(t => t.presence === 'present' || t.presence === 'excused').length / dayTotal) * 100),
          participationRate: dayPresentTotal > 0 ? Math.round((dayPresent.filter(t => t.participation === 'excellent' || t.participation === 'bon').length / dayPresentTotal) * 100) : 0,
          disciplineRate: dayPresentTotal > 0 ? Math.round((dayPresent.filter(t => t.discipline === 'concentre' || t.discipline === 'moyen').length / dayPresentTotal) * 100) : 0,
          attitudeRate: dayPresentTotal > 0 ? Math.round((dayPresent.filter(t => t.attitude === 'correct').length / dayPresentTotal) * 100) : 0,
          perturbateurRate: dayPresentTotal > 0 ? Math.round((dayPresent.filter(t => t.attitude === 'perturbateur').length / dayPresentTotal) * 100) : 0,
          bavardRate: dayPresentTotal > 0 ? Math.round((dayPresent.filter(t => t.attitude === 'bavarre').length / dayPresentTotal) * 100) : 0,
          phoneRate: dayPresentTotal > 0 ? Math.round((dayPresent.filter(t => t.phone_use === true).length / dayPresentTotal) * 100) : 0,
          sleepingRate: dayPresentTotal > 0 ? Math.round((dayPresent.filter(t => t.sleeping === true).length / dayPresentTotal) * 100) : 0,
          recordCount: dayTotal
        });
      }
    }

    // Identifier les problèmes récurrents (uniquement si des données existent)
    const issues = [];
    if (totalRecords > 0) {
      if (metrics.sleepingRate > 10) {
        issues.push({ type: 'sleeping', severity: metrics.sleepingRate > 20 ? 'high' : 'medium', value: metrics.sleepingRate, label: 'Élèves qui dorment', action: 'Revoir le format des cours pour plus d\'interactivité' });
      }
      if (metrics.phoneUseRate > 15) {
        issues.push({ type: 'phone', severity: metrics.phoneUseRate > 30 ? 'high' : 'medium', value: metrics.phoneUseRate, label: 'Utilisation du téléphone', action: 'Instaurer une règle de dépôt de téléphone en début de cours' });
      }
      if (metrics.participationWeakRate > 30) {
        issues.push({ type: 'participation', severity: metrics.participationWeakRate > 50 ? 'high' : 'medium', value: metrics.participationWeakRate, label: 'Faible participation', action: 'Intégrer plus d\'activités participatives' });
      }
      if (metrics.absenceRate > 10) {
        issues.push({ type: 'absence', severity: metrics.absenceRate > 20 ? 'high' : 'medium', value: metrics.absenceRate, label: 'Taux d\'absence élevé', action: 'Contacter les parents des élèves souvent absents' });
      }
      if (metrics.cahierPresentRate < 80) {
        issues.push({ type: 'cahier', severity: metrics.cahierPresentRate < 60 ? 'high' : 'medium', value: 100 - metrics.cahierPresentRate, label: 'Cahiers manquants', action: 'Rappeler l\'importance du matériel scolaire' });
      }
      if (metrics.disciplinePoorRate > 10) {
        issues.push({ type: 'discipline', severity: metrics.disciplinePoorRate > 20 ? 'high' : 'medium', value: metrics.disciplinePoorRate, label: 'Problèmes de discipline', action: 'Mettre en place un système de responsabilisation' });
      }
    }

    // Récupérer les sessions récentes
    const { data: recentSessions, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('id, date, start_time, end_time, topic, type')
      .eq('class_id', classId)
      .eq('teacher_id', teacherId)
      .order('date', { ascending: false })
      .limit(5);

    if (sessionsError) throw sessionsError;

    // Ajouter les métriques par session
    const sessionsWithMetrics = (recentSessions || []).map(session => {
      const sessionTracking = validTracking.filter(t => t.session_id === session.id);
      const sessionTotal = sessionTracking.length;
      
      return {
        ...session,
        studentCount: sessionTotal,
        presenceRate: sessionTotal > 0 ? Math.round((sessionTracking.filter(t => t.presence === 'present').length / sessionTotal) * 100) : null,
        participationRate: sessionTotal > 0 ? Math.round((sessionTracking.filter(t => t.participation === 'excellent' || t.participation === 'bon').length / sessionTotal) * 100) : null,
        incidentsCount: sessionTracking.filter(
          t => t.sleeping || t.phone_use || t.discipline === 'distrait' || t.attitude === 'perturbateur' || t.attitude === 'bavarre'
        ).length
      };
    });

    res.json({
      classInfo,
      studentCount,
      totalRecords,
      period: parseInt(days),
      metrics,
      healthScore,
      healthStatus,
      trends,
      issues: issues.sort((a, b) => (b.severity === 'high' ? 1 : 0) - (a.severity === 'high' ? 1 : 0)),
      recentSessions: sessionsWithMetrics
    });
  } catch (error) {
    console.error('Erreur analytics:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer un résumé de toutes les classes du professeur
router.get('/dashboard/summary', async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { days = 7 } = req.query;

    // Récupérer les classes accessibles (prof : classes assignées ;
    // direction pédagogique : classes du périmètre)
    let classes;
    if (isPedagogicalStaff(req.user)) {
      const accessibleIds = await getTeachingClassIds(req);
      if (accessibleIds.length === 0) {
        return res.json({ classes: [], summary: null, todaysSessions: [], alerts: [] });
      }
      const { data: cls, error: clsError } = await supabaseAdmin
        .from('classes')
        .select('id, name, level')
        .in('id', accessibleIds);
      if (clsError) throw clsError;
      classes = cls || [];
    } else {
      const { data: classTeachers, error: ctError } = await supabaseAdmin
        .from('class_teachers')
        .select('class_id, classes(id, name, level)')
        .eq('teacher_id', teacherId);

      if (ctError) throw ctError;

      classes = classTeachers.map(ct => ct.classes).filter(Boolean);
    }

    if (classes.length === 0) {
      return res.json({ classes: [], summary: null, todaysSessions: [], alerts: [] });
    }

    const classIds = classes.map(c => c.id);

    // Récupérer le suivi sur la période
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    let trackingQuery = supabaseAdmin
      .from('session_tracking')
      .select(`
        *,
        sessions!inner(id, date, start_time, class_id, teacher_id, tracking_options)
      `)
      .in('sessions.class_id', classIds)
      .gte('created_at', startDate.toISOString());

    if (!isPedagogicalStaff(req.user)) {
      trackingQuery = trackingQuery.eq('sessions.teacher_id', teacherId);
    }

    const { data: tracking, error: trackingError } = await trackingQuery;

    if (trackingError) throw trackingError;

    const validTracking = tracking || [];

    // Calculer les métriques par classe
    const classesWithMetrics = classes.map(cls => {
      const classTracking = validTracking.filter(t => t.sessions?.class_id === cls.id);
      const total = classTracking.length;

      if (total === 0) {
        return { ...cls, healthScore: null, healthStatus: 'gray', metrics: null, studentCount: 0 };
      }

      const presentCount = classTracking.filter(t => t.presence === 'present' || t.presence === 'excused').length;
      const disciplineGood = classTracking.filter(t => t.discipline === 'concentre' || t.discipline === 'moyen').length;
      const participationPositive = classTracking.filter(t => t.participation === 'excellent' || t.participation === 'bon').length;
      const phoneUse = classTracking.filter(t => t.phone_use === true).length;
      const sleeping = classTracking.filter(t => t.sleeping === true).length;
      const cahierPresent = classTracking.filter(t => t.cahier_present === true).length;
      const writingCount = classTracking.filter(t => t.writing === true).length;
      const writingTracked = classTracking.filter(t => t.writing !== null).length;

      const presenceRate = Math.round((presentCount / total) * 100);
      const disciplineRate = Math.round((disciplineGood / total) * 100);
      const participationRate = Math.round((participationPositive / total) * 100);
      const phoneRate = Math.round((phoneUse / total) * 100);
      const sleepingRate = Math.round((sleeping / total) * 100);
      const cahierRate = Math.round((cahierPresent / total) * 100);
      const writingRate = writingTracked > 0 ? Math.round((writingCount / writingTracked) * 100) : 0;

      const healthScore = Math.round(
        (presenceRate * 0.25) +
        (disciplineRate * 0.20) +
        (participationRate * 0.20) +
        ((100 - phoneRate) * 0.15) +
        ((100 - sleepingRate) * 0.10) +
        (writingRate * 0.10)
      );

      return {
        ...cls,
        healthScore,
        healthStatus: healthScore >= 70 ? 'green' : healthScore >= 50 ? 'orange' : 'red',
        metrics: { presenceRate, disciplineRate, participationRate, phoneRate, sleepingRate, cahierRate, writingRate },
        recordCount: total
      };
    });

    // Calculer le résumé global
    const classesWithData = classesWithMetrics.filter(c => c.healthScore !== null);
    const summary = classesWithData.length > 0 ? {
      averageHealthScore: Math.round(classesWithData.reduce((sum, c) => sum + c.healthScore, 0) / classesWithData.length),
      totalClasses: classes.length,
      classesWithData: classesWithData.length,
      greenClasses: classesWithData.filter(c => c.healthStatus === 'green').length,
      orangeClasses: classesWithData.filter(c => c.healthStatus === 'orange').length,
      redClasses: classesWithData.filter(c => c.healthStatus === 'red').length
    } : null;

    // Récupérer les sessions d'aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    let todayQuery = supabaseAdmin
      .from('sessions')
      .select('id, class_id, date, start_time, end_time, topic, type, classes(name)')
      .eq('date', today)
      .order('start_time', { ascending: true });

    if (isPedagogicalStaff(req.user)) {
      todayQuery = todayQuery.in('class_id', classIds);
    } else {
      todayQuery = todayQuery.eq('teacher_id', teacherId);
    }

    const { data: todaysSessions, error: todayError } = await todayQuery;

    if (todayError) throw todayError;

    // Générer des alertes
    const alerts = [];
    classesWithMetrics.forEach(cls => {
      if (cls.healthStatus === 'red') {
        alerts.push({ type: 'critical', classId: cls.id, className: cls.name, message: `La classe ${cls.name} nécessite une attention particulière (score: ${cls.healthScore}/100)` });
      }
      if (cls.metrics?.phoneRate > 30) {
        alerts.push({ type: 'warning', classId: cls.id, className: cls.name, message: `Usage élevé du téléphone en ${cls.name} (${cls.metrics.phoneRate}%)` });
      }
      if (cls.metrics?.sleepingRate > 15) {
        alerts.push({ type: 'warning', classId: cls.id, className: cls.name, message: `Élèves qui dorment en ${cls.name} (${cls.metrics.sleepingRate}%)` });
      }
    });

    res.json({
      classes: classesWithMetrics.sort((a, b) => (a.healthScore || 0) - (b.healthScore || 0)),
      summary,
      todaysSessions: todaysSessions || [],
      alerts: alerts.slice(0, 5)
    });
  } catch (error) {
    console.error('Erreur dashboard summary:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== CLASSEMENT DES CLASSES DU PROF ====================

// GET /dashboard/class-ranking — classement des classes du professeur
router.get('/dashboard/class-ranking', async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Récupérer les classes accessibles (prof ou direction pédagogique)
    let classes;
    if (isPedagogicalStaff(req.user)) {
      const accessibleIds = await getTeachingClassIds(req);
      if (accessibleIds.length === 0) {
        return res.json({ ranking: [], period: {}, totalClasses: 0, rankedClasses: 0 });
      }
      const { data: cls, error: clsError } = await supabaseAdmin
        .from('classes')
        .select('id, name, level, academic_year')
        .in('id', accessibleIds);
      if (clsError) throw clsError;
      classes = cls || [];
    } else {
      const { data: classTeachers, error: ctError } = await supabaseAdmin
        .from('class_teachers')
        .select('class_id, classes(id, name, level, academic_year)')
        .eq('teacher_id', teacherId);
      if (ctError) throw ctError;

      classes = classTeachers.map(ct => ct.classes).filter(Boolean);
    }
    if (classes.length === 0) {
      return res.json({ ranking: [], period: {}, totalClasses: 0, rankedClasses: 0 });
    }

    const classIds = classes.map(c => c.id);

    // Récupérer les élèves de ces classes
    const { data: students } = await supabaseAdmin
      .from('profiles')
      .select('id, class_id')
      .eq('role', 'student')
      .in('class_id', classIds);

    // Tracking des 30 derniers jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sinceDate = thirtyDaysAgo.toISOString().split('T')[0];

    let rankingTrackingQuery = supabaseAdmin
      .from('session_tracking')
      .select('student_id, presence, phone_use, sleeping, discipline, attitude, homework, cahier_present, participation, writing, sessions!inner(id, date, class_id, teacher_id, tracking_options)')
      .in('sessions.class_id', classIds)
      .gte('sessions.date', sinceDate);

    if (!isPedagogicalStaff(req.user)) {
      rankingTrackingQuery = rankingTrackingQuery.eq('sessions.teacher_id', teacherId);
    }

    const { data: trackingData, error: trackingError } = await rankingTrackingQuery;
    if (trackingError) throw trackingError;

    const isPresentStatus = (status) => ['present', 'excused', 'late'].includes(status);
    const validTracking = trackingData || [];

    // Agréger par classe
    const classMetrics = new Map();
    classes.forEach(cls => {
      classMetrics.set(cls.id, {
        classId: cls.id,
        name: cls.name,
        level: cls.level,
        academic_year: cls.academic_year,
        studentCount: (students || []).filter(s => s.class_id === cls.id).length,
        presence: { total: 0, present: 0 },
        incidents: { total: 0, count: 0 },
        homework: { total: 0, done: 0 },
        cahier: { total: 0, present: 0 },
        participation: { total: 0, active: 0 },
        sessionCount: 0
      });
    });

    const sessionSet = new Set();
    validTracking.forEach(record => {
      const classId = record.sessions?.class_id;
      if (!classId || !classMetrics.has(classId)) return;
      const m = classMetrics.get(classId);
      const opts = record.sessions?.tracking_options || {};

      if (!sessionSet.has(record.sessions.id)) {
        sessionSet.add(record.sessions.id);
        m.sessionCount++;
      }

      if (opts.presence !== false && record.presence) {
        m.presence.total++;
        if (isPresentStatus(record.presence)) m.presence.present++;
      }

      if (!isPresentStatus(record.presence)) return;

      let hasIncident = false;
      if (opts.phone_use !== false && record.phone_use === true) hasIncident = true;
      if (opts.sleeping !== false && record.sleeping === true) hasIncident = true;
      if (opts.discipline !== false && record.discipline === 'bavarre') hasIncident = true;
      if (opts.attitude !== false && record.attitude === 'perturbateur') hasIncident = true;
      m.incidents.total++;
      if (hasIncident) m.incidents.count++;

      if (opts.homework !== false && record.homework !== null && record.homework !== undefined) {
        m.homework.total++;
        if (record.homework === true || record.homework === 'done') m.homework.done++;
      }

      if (opts.cahier_present !== false && record.cahier_present !== null && record.cahier_present !== undefined) {
        m.cahier.total++;
        if (record.cahier_present === true) m.cahier.present++;
      }

      if (opts.participation !== false && record.participation) {
        m.participation.total++;
        if (record.participation === 'bon' || record.participation === 'excellent') m.participation.active++;
      }
    });

    const ranking = Array.from(classMetrics.values()).map(m => {
      const attendanceRate = m.presence.total > 0 ? (m.presence.present / m.presence.total) * 100 : null;
      const incidentRate = m.incidents.total > 0 ? (1 - m.incidents.count / m.incidents.total) * 100 : null;
      const homeworkRate = m.homework.total > 0 ? (m.homework.done / m.homework.total) * 100 : null;
      const cahierRate = m.cahier.total > 0 ? (m.cahier.present / m.cahier.total) * 100 : null;
      const participationRate = m.participation.total > 0 ? (m.participation.active / m.participation.total) * 100 : null;

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

    ranking.sort((a, b) => {
      if (a.compositeScore === null && b.compositeScore === null) return 0;
      if (a.compositeScore === null) return 1;
      if (b.compositeScore === null) return -1;
      return b.compositeScore - a.compositeScore;
    });

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
    console.error('Erreur teacher class-ranking:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== CAHIER DE TEXTE ====================

// Récupérer le cahier de texte (sessions avec contenu pédagogique)
router.get('/cahier-de-texte', async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { class_id, start_date, end_date, subject_id } = req.query;

    const startDate = start_date || new Date().toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    let query = supabaseAdmin
      .from('sessions')
      .select('id, date, start_time, end_time, topic, notes, type, class_id, subject_id, subject:subjects(id, name), class:classes!inner(id, name, level, school_type, filiere)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    // La direction pédagogique voit le cahier de texte de toutes les classes
    // de son périmètre (tous profs confondus)
    if (isPedagogicalStaff(req.user)) {
      const accessibleIds = await getTeachingClassIds(req);
      if (accessibleIds.length === 0) {
        return res.json({ teacherName: '', classes: [], period: { startDate, endDate } });
      }
      query = query.in('class_id', accessibleIds);
    } else {
      query = query.eq('teacher_id', teacherId);
    }

    // Filter by class_id(s) if provided (comma-separated)
    if (class_id) {
      const classIds = class_id.split(',').map(id => id.trim()).filter(Boolean);
      if (classIds.length === 1) {
        query = query.eq('class_id', classIds[0]);
      } else if (classIds.length > 1) {
        query = query.in('class_id', classIds);
      }
    }

    if (subject_id) {
      query = query.eq('subject_id', subject_id);
    }

    const { data: sessions, error } = await query;
    if (error) throw error;

    // Récupérer le nom du prof
    const { data: teacher } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', teacherId)
      .single();

    const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}` : '';

    // Group sessions by class
    const classMap = {};
    (sessions || []).forEach(s => {
      const cid = s.class_id;
      if (!classMap[cid]) {
        classMap[cid] = { classInfo: s.class || {}, sessions: [] };
      }
      classMap[cid].sessions.push(s);
    });

    const classes = Object.values(classMap);

    res.json({
      teacherName,
      classes,
      period: { startDate, endDate }
    });
  } catch (error) {
    console.error('Erreur cahier de texte:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
