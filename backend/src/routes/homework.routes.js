import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Middleware pour vérifier que c'est un professeur
router.use(authenticate);
router.use(authorize('teacher'));

// ==================== DEVOIRS ====================

// Récupérer tous les devoirs du professeur
router.get('/homework', async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Récupérer d'abord les classes du professeur
    const { data: classTeachers, error: ctError } = await supabaseAdmin
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', teacherId);

    if (ctError) throw ctError;

    const classIds = classTeachers.map(ct => ct.class_id);

    if (classIds.length === 0) {
      return res.json([]);
    }

    const { data, error } = await supabaseAdmin
      .from('homework')
      .select(`
        *,
        classes(name, level),
        profiles(first_name, last_name),
        homework_students(student_id, profiles(first_name, last_name, avatar)),
        homework_submissions(student_id, status, submission_date)
      `)
      .in('class_id', classIds)
      .order('due_date', { ascending: true });

    if (error) throw error;

    // Récupérer les effectifs par classe pour calculer les stats
    const { data: classStudents, error: classStudentsError } = await supabaseAdmin
      .from('profiles')
      .select('id, class_id')
      .eq('role', 'student')
      .in('class_id', classIds);

    if (classStudentsError) throw classStudentsError;

    const classStudentCounts = (classStudents || []).reduce((acc, student) => {
      acc[student.class_id] = (acc[student.class_id] || 0) + 1;
      return acc;
    }, {});

    const homeworksWithStats = (data || []).map(hw => {
      const assignedCount = hw.target_type === 'all'
        ? (classStudentCounts[hw.class_id] || 0)
        : (hw.homework_students?.length || 0);

      const submittedCount = hw.homework_submissions
        ? hw.homework_submissions.filter(sub => sub.status === 'submitted' || sub.status === 'graded').length
        : 0;

      const pendingCount = Math.max(assignedCount - submittedCount, 0);
      const submissionRate = assignedCount > 0 ? Math.round((submittedCount / assignedCount) * 100) : 0;

      return {
        ...hw,
        assigned_count: assignedCount,
        submitted_count: submittedCount,
        pending_count: pendingCount,
        submission_rate: submissionRate
      };
    });

    res.json(homeworksWithStats);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer un devoir spécifique
router.get('/homework/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('homework')
      .select(`
        *,
        classes(name, level),
        profiles(first_name, last_name),
        homework_students(student_id, profiles(first_name, last_name, avatar)),
        homework_submissions(
          student_id,
          status,
          submission_date,
          grade,
          feedback
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Vérifier que le professeur a accès à ce devoir
    const { data: classTeacher } = await supabaseAdmin
      .from('class_teachers')
      .select('id')
      .eq('class_id', data.class_id)
      .eq('teacher_id', teacherId)
      .single();

    if (!classTeacher) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un nouveau devoir
router.post('/homework', async (req, res) => {
  try {
    const { title, description, type, classId, targetType, studentIds, dueDate } = req.body;
    const teacherId = req.user.id;

    // Vérifier que le professeur a accès à cette classe
    const { data: classTeacher } = await supabaseAdmin
      .from('class_teachers')
      .select('id')
      .eq('class_id', classId)
      .eq('teacher_id', teacherId)
      .single();

    if (!classTeacher) {
      return res.status(403).json({ error: 'Accès refusé à cette classe' });
    }

    // Créer le devoir
    const { data: homework, error: homeworkError } = await supabaseAdmin
      .from('homework')
      .insert({
        title,
        description,
        type,
        class_id: classId,
        target_type: targetType,
        due_date: dueDate,
        created_by: teacherId
      })
      .select()
      .single();

    if (homeworkError) throw homeworkError;

    let targetStudentIds = [];

    // Si c'est un devoir pour un groupe d'élèves, ajouter les élèves
    if (targetType === 'group' && studentIds && studentIds.length > 0) {
      const studentsToInsert = studentIds.map(studentId => ({
        homework_id: homework.id,
        student_id: studentId
      }));

      await supabaseAdmin
        .from('homework_students')
        .insert(studentsToInsert);

      targetStudentIds = studentIds;
    } else if (targetType === 'all') {
      // Récupérer tous les élèves de la classe
      const { data: classStudents } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('class_id', classId)
        .eq('role', 'student');

      targetStudentIds = classStudents.map(s => s.id);
    }

    // Lier le devoir aux séances existantes de la classe
    const { data: existingSessions } = await supabaseAdmin
      .from('sessions')
      .select('id, date')
      .eq('class_id', classId)
      .lte('date', dueDate);

    if (existingSessions && existingSessions.length > 0) {
      const homeworkSessions = existingSessions.map(session => ({
        homework_id: homework.id,
        session_id: session.id
      }));

      await supabaseAdmin
        .from('homework_sessions')
        .insert(homeworkSessions);
    }

    // Envoyer des notifications aux élèves concernés
    for (const studentId of targetStudentIds) {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: studentId,
          type: 'homework',
          title: 'Nouveau devoir',
          message: `Nouveau devoir: ${title}`,
          data: {
            homework_id: homework.id,
            type: type,
            due_date: dueDate
          }
        });
    }

    // Envoyer notification WhatsApp aux parents
    try {
      // Récupérer les informations du professeur et de la classe
      const { data: teacher } = await supabaseAdmin
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', teacherId)
        .single();

      const { data: classInfo } = await supabaseAdmin
        .from('classes')
        .select('name')
        .eq('id', classId)
        .single();

      // Récupérer les parents des élèves concernés
      const { data: parentLinks } = await supabaseAdmin
        .from('parent_students')
        .select('parent_id, student_id')
        .in('student_id', targetStudentIds);

      if (parentLinks && parentLinks.length > 0) {
        const parentIds = [...new Set(parentLinks.map(l => l.parent_id))];

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
            // Récupérer la clé API WhatsApp de l'école
            const { data: school } = await supabaseAdmin
              .from('schools')
              .select('wasender_api_key')
              .eq('id', req.user.school_id)
              .single();

            const sessionApiKey = school?.wasender_api_key;

            if (sessionApiKey) {
              // Formater le message
              const dueDateFormatted = new Date(dueDate).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              });

              const messageText = `📚 *Nouveau devoir*\n\n` +
                `Classe: ${classInfo?.name || 'N/A'}\n` +
                `Professeur: ${teacher?.first_name || ''} ${teacher?.last_name || ''}\n` +
                `Matière: ${type || 'Devoir'}\n\n` +
                `*${title}*\n\n` +
                `${description || ''}\n\n` +
                `📅 À rendre avant le: ${dueDateFormatted}`;

              // Créer le log du message
              const { data: msgLog } = await supabaseAdmin
                .from('whatsapp_messages')
                .insert({
                  school_id: req.user.school_id,
                  sent_by: teacherId,
                  message_type: 'text',
                  content: messageText,
                  total_recipients: recipients.length,
                  status: 'sending'
                })
                .select()
                .single();

              if (msgLog) {
                // Envoyer les messages en arrière-plan
                const sendPromises = recipients.map(async (contact) => {
                  try {
                    const recipientLog = await supabaseAdmin
                      .from('whatsapp_recipients')
                      .insert({
                        message_id: msgLog.id,
                        phone_e164: contact.phone_e164,
                        parent_id: contact.parent_id,
                        status: 'pending'
                      })
                      .select()
                      .single();

                    if (recipientLog.data) {
                      const response = await fetch('https://api.wasender.com/api/v1/messages/text', {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${sessionApiKey}`,
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          phone: contact.phone_e164,
                          message: messageText
                        })
                      });

                      if (response.ok) {
                        await supabaseAdmin
                          .from('whatsapp_recipients')
                          .update({ status: 'sent', sent_at: new Date().toISOString() })
                          .eq('id', recipientLog.data.id);
                      } else {
                        await supabaseAdmin
                          .from('whatsapp_recipients')
                          .update({ status: 'failed', error_message: 'Échec envoi API' })
                          .eq('id', recipientLog.data.id);
                      }
                    }
                  } catch (err) {
                    console.error('Erreur envoi WhatsApp:', err);
                  }
                });

                // Exécuter tous les envois
                Promise.all(sendPromises).then(async () => {
                  const { data: recipientStats } = await supabaseAdmin
                    .from('whatsapp_recipients')
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
                });
              }
            }
          }
        }
      }
    } catch (whatsappError) {
      console.error('Erreur notification WhatsApp:', whatsappError);
      // Ne pas bloquer la création du devoir si l'envoi WhatsApp échoue
    }

    res.status(201).json(homework);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour un devoir
router.put('/homework/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      type,
      targetType,
      dueDate,
      classId,
      studentIds = []
    } = req.body;
    const teacherId = req.user.id;

    // Récupérer le devoir existant
    const { data: homework } = await supabaseAdmin
      .from('homework')
      .select('class_id')
      .eq('id', id)
      .single();

    if (!homework) {
      return res.status(404).json({ error: 'Devoir non trouvé' });
    }

    const targetClassId = classId || homework.class_id;

    // Vérifier que le professeur a accès à la classe cible
    const { data: classTeacher } = await supabaseAdmin
      .from('class_teachers')
      .select('id')
      .eq('class_id', targetClassId)
      .eq('teacher_id', teacherId)
      .single();

    if (!classTeacher) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Mettre à jour le devoir
    const { data: updatedHomework, error } = await supabaseAdmin
      .from('homework')
      .update({
        title,
        description,
        type,
        class_id: targetClassId,
        target_type: targetType,
        due_date: dueDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Mettre à jour les élèves ciblés
    const { error: deleteStudentsError } = await supabaseAdmin
      .from('homework_students')
      .delete()
      .eq('homework_id', id);

    if (deleteStudentsError) throw deleteStudentsError;

    if (targetType === 'group' && studentIds.length > 0) {
      const studentsToInsert = studentIds.map(studentId => ({
        homework_id: id,
        student_id: studentId
      }));

      const { error: insertStudentsError } = await supabaseAdmin
        .from('homework_students')
        .insert(studentsToInsert);

      if (insertStudentsError) throw insertStudentsError;
    }

    // Mettre à jour les liens avec les séances existantes
    await supabaseAdmin
      .from('homework_sessions')
      .delete()
      .eq('homework_id', id);

    const { data: existingSessions } = await supabaseAdmin
      .from('sessions')
      .select('id, date')
      .eq('class_id', targetClassId)
      .lte('date', dueDate);

    if (existingSessions && existingSessions.length > 0) {
      const homeworkSessions = existingSessions.map(session => ({
        homework_id: id,
        session_id: session.id
      }));

      await supabaseAdmin
        .from('homework_sessions')
        .insert(homeworkSessions);
    }

    res.json(updatedHomework);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Supprimer un devoir
router.delete('/homework/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;

    // Vérifier que le professeur a accès à ce devoir
    const { data: homework } = await supabaseAdmin
      .from('homework')
      .select('class_id')
      .eq('id', id)
      .single();

    if (!homework) {
      return res.status(404).json({ error: 'Devoir non trouvé' });
    }

    const { data: classTeacher } = await supabaseAdmin
      .from('class_teachers')
      .select('id')
      .eq('class_id', homework.class_id)
      .eq('teacher_id', teacherId)
      .single();

    if (!classTeacher) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Supprimer le devoir (cascade supprimera homework_students et homework_submissions)
    await supabaseAdmin
      .from('homework')
      .delete()
      .eq('id', id);

    res.json({ message: 'Devoir supprimé' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== SOUMISSIONS ====================

// Noter une soumission
router.put('/homework/:homeworkId/submissions/:studentId', async (req, res) => {
  try {
    const { homeworkId, studentId } = req.params;
    const { grade, feedback } = req.body;
    const teacherId = req.user.id;

    // Vérifier que le professeur a accès à ce devoir
    const { data: homework } = await supabaseAdmin
      .from('homework')
      .select('class_id')
      .eq('id', homeworkId)
      .single();

    if (!homework) {
      return res.status(404).json({ error: 'Devoir non trouvé' });
    }

    const { data: classTeacher } = await supabaseAdmin
      .from('class_teachers')
      .select('id')
      .eq('class_id', homework.class_id)
      .eq('teacher_id', teacherId)
      .single();

    if (!classTeacher) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Mettre à jour ou créer la soumission
    const { data: submission, error } = await supabaseAdmin
      .from('homework_submissions')
      .upsert({
        homework_id: homeworkId,
        student_id: studentId,
        grade,
        feedback,
        status: 'graded',
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json(submission);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

export default router;
