import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Configuration de multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/documents';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20 Mo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.doc', '.docx', '.ppt', '.pptx'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Types acceptés: PDF, images, documents Word/PowerPoint'));
    }
  }
});

// Middleware d'authentification
router.use(authenticate);

// ==================== ROUTES POUR LES DOCUMENTS PÉDAGOGIQUES ====================

// Récupérer tous les documents d'un professeur
router.get('/', authorize('teacher'), async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { classId, documentType } = req.query;

    let query = supabaseAdmin
      .from('teaching_documents')
      .select(`
        *,
        classes(name, level),
        subjects(name),
        controls_plan(name)
      `)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (classId) {
      query = query.eq('class_id', classId);
    }

    if (documentType) {
      query = query.eq('document_type', documentType);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculer le nombre total d'élèves pour chaque document
    const documentsWithStats = await Promise.all(data.map(async (doc) => {
      const { data: students } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('class_id', doc.class_id)
        .eq('role', 'student');

      const { data: views } = await supabaseAdmin
        .from('document_views')
        .select('viewed_at, downloaded_at')
        .eq('document_id', doc.id);

      const viewedCount = (views || []).filter(v => !!v.viewed_at).length;
      const downloadedCount = (views || []).filter(v => !!v.downloaded_at).length;

      return {
        ...doc,
        total_students: students ? students.length : 0,
        viewed_count: viewedCount,
        downloaded_count: downloadedCount
      };
    }));

    res.json(documentsWithStats);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les détails d'un document
router.get('/:id', authorize('teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('teaching_documents')
      .select(`
        *,
        classes(name, level),
        subjects(name),
        controls_plan(name)
      `)
      .eq('id', id)
      .eq('teacher_id', teacherId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }

    // Récupérer les statistiques de consultation
    const { data: views } = await supabaseAdmin
      .from('document_views')
      .select('student_id, viewed_at, downloaded_at, profiles(first_name, last_name)')
      .eq('document_id', id);

    const { data: students } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('class_id', data.class_id)
      .eq('role', 'student');

    const viewedBy = (views || [])
      .filter(v => !!v.viewed_at)
      .map(v => ({
        student_id: v.student_id,
        first_name: v.profiles?.first_name || null,
        last_name: v.profiles?.last_name || null,
        viewed_at: v.viewed_at
      }));

    const downloadedBy = (views || [])
      .filter(v => !!v.downloaded_at)
      .map(v => ({
        student_id: v.student_id,
        first_name: v.profiles?.first_name || null,
        last_name: v.profiles?.last_name || null,
        downloaded_at: v.downloaded_at
      }));

    res.json({
      ...data,
      total_students: students ? students.length : 0,
      viewed_count: viewedBy.length,
      downloaded_count: downloadedBy.length,
      viewed_by: viewedBy,
      downloaded_by: downloadedBy,
      views: views || []
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Uploader un nouveau document
router.post('/', authorize('teacher'), upload.single('file'), async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { classId, subjectId, controlId, title, documentType, description } = req.body;

    let resolvedSubjectId = subjectId || null;
    if (typeof resolvedSubjectId === 'string' && resolvedSubjectId.trim() === '') {
      resolvedSubjectId = null;
    }

    // Validation des champs obligatoires
    if (!classId || !title || !documentType) {
      return res.status(400).json({ 
        error: 'Champs obligatoires manquants: classe, titre, type de document' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Vérifier que le professeur a accès à cette classe
    const { data: classTeacher, error: classError } = await supabaseAdmin
      .from('class_teachers')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .single();

    if (classError || !classTeacher) {
      return res.status(403).json({ error: 'Vous n\'avez pas accès à cette classe' });
    }

    // Récupérer le nombre total d'élèves dans la classe
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('class_id', classId)
      .eq('role', 'student');

    console.log('[DEBUG] Students fetched:', {
      classId,
      studentsCount: students?.length || 0,
      studentsError: studentsError?.message
    });

    if (!resolvedSubjectId) {
      const { data: teacherSubjects, error: teacherSubjectsError } = await supabaseAdmin
        .from('teacher_subjects')
        .select('subject_id')
        .eq('teacher_id', teacherId);

      if (!teacherSubjectsError && Array.isArray(teacherSubjects) && teacherSubjects.length > 0) {
        resolvedSubjectId = teacherSubjects[0]?.subject_id || null;
      }
    }

    // Créer le document dans la base de données
    const documentData = {
      teacher_id: teacherId,
      class_id: classId,
      subject_id: resolvedSubjectId,
      control_id: controlId || null,
      title: title,
      document_type: documentType,
      description: description || null,
      file_name: req.file.originalname,
      file_path: req.file.path,
      file_size: req.file.size,
      file_type: req.file.mimetype,
      total_students: students ? students.length : 0
    };

    const { data, error } = await supabaseAdmin
      .from('teaching_documents')
      .insert(documentData)
      .select(`
        *,
        classes(name, level),
        subjects(name),
        controls_plan(name)
      `)
      .single();

    if (error) {
      console.error('[ERROR] Failed to insert document:', error);
      throw error;
    }

    console.log('[DEBUG] Document created:', {
      documentId: data.id,
      title: data.title,
      classId: data.class_id
    });

    const teacherFirstName = req.user?.first_name || null;
    const teacherLastName = req.user?.last_name || null;
    const teacherName = [teacherFirstName, teacherLastName].filter(Boolean).join(' ') || 'Votre professeur';

    let subjectName = data?.subjects?.name || null;
    if (!subjectName && resolvedSubjectId) {
      const { data: subjectRow, error: subjectError } = await supabaseAdmin
        .from('subjects')
        .select('name')
        .eq('id', resolvedSubjectId)
        .single();

      if (!subjectError && subjectRow?.name) {
        subjectName = subjectRow.name;
      }
    }

    // Créer des notifications pour tous les élèves de la classe
    if (students && students.length > 0) {
      const notifications = students.map(student => ({
        user_id: student.id,
        type: 'document',
        title: `Nouveau document${subjectName ? ` (${subjectName})` : ''}: ${title}`,
        message: `${teacherName} a ajouté un nouveau document${subjectName ? ` en ${subjectName}` : ''} (type: ${documentType})`,
        related_id: data.id,
        read: false
      }));

      console.log('[DEBUG] Creating notifications:', {
        count: notifications.length,
        firstStudentId: notifications[0]?.user_id
      });

      const { error: notifError } = await supabaseAdmin
        .from('notifications')
        .insert(notifications);

      if (notifError) {
        console.error('[ERROR] Failed to insert notifications:', notifError);
      } else {
        console.log('[DEBUG] Notifications created successfully:', notifications.length);
      }

      // Envoyer notification WhatsApp aux parents
      try {
        const studentIds = students.map(s => s.id);

        // Récupérer les informations de la classe
        const { data: classInfo } = await supabaseAdmin
          .from('classes')
          .select('name')
          .eq('id', classId)
          .single();

        // Récupérer les parents des élèves
        const { data: parentLinks } = await supabaseAdmin
          .from('parent_students')
          .select('parent_id, student_id')
          .in('student_id', studentIds);

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
                const documentTypeLabel = {
                  'cours': 'Cours',
                  'exercice': 'Exercice',
                  'correction': 'Correction',
                  'support': 'Support pédagogique',
                  'autre': 'Document'
                }[documentType] || 'Document';

                const messageText = `📄 *Nouveau document pédagogique*\n\n` +
                  `Classe: ${classInfo?.name || 'N/A'}\n` +
                  `Professeur: ${teacherName}\n` +
                  (subjectName ? `Matière: ${subjectName}\n` : '') +
                  `Type: ${documentTypeLabel}\n\n` +
                  `*${title}*\n\n` +
                  (description ? `${description}\n\n` : '') +
                  `📎 Fichier: ${req.file.originalname}\n\n` +
                  `Le document est disponible dans l'espace élève.`;

                // Créer le log du message
                const { data: msgLog } = await supabaseAdmin
                  .from('whatsapp_messages')
                  .insert({
                    school_id: req.user.school_id,
                    sent_by: teacherId,
                    message_type: 'document',
                    content: messageText,
                    file_name: req.file.originalname,
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
                        // Envoyer le fichier via WhatsApp
                        const fileBuffer = fs.readFileSync(req.file.path);
                        const fileBase64 = fileBuffer.toString('base64');
                        
                        const response = await fetch('https://api.wasender.com/api/v1/messages/document', {
                          method: 'POST',
                          headers: {
                            'Authorization': `Bearer ${sessionApiKey}`,
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            phone: contact.phone_e164,
                            document: fileBase64,
                            filename: req.file.originalname,
                            caption: messageText
                          })
                        });

                        if (response.ok) {
                          await supabaseAdmin
                            .from('whatsapp_recipients')
                            .update({ status: 'sent', sent_at: new Date().toISOString() })
                            .eq('id', recipientLog.data.id);
                        } else {
                          const errorData = await response.text();
                          console.error('Erreur envoi document WhatsApp:', errorData);
                          await supabaseAdmin
                            .from('whatsapp_recipients')
                            .update({ status: 'failed', error_message: 'Échec envoi document' })
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
        // Ne pas bloquer l'upload du document si l'envoi WhatsApp échoue
      }
    } else {
      console.log('[DEBUG] No students found to notify');
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload du document' });
  }
});

// Supprimer un document
router.delete('/:id', authorize('teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;

    // Vérifier que le document appartient au professeur
    const { data: document, error: docError } = await supabaseAdmin
      .from('teaching_documents')
      .select('*')
      .eq('id', id)
      .eq('teacher_id', teacherId)
      .single();

    if (docError || !document) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }

    // Supprimer le fichier physique
    if (fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }

    // Supprimer le document de la base de données
    const { error } = await supabaseAdmin
      .from('teaching_documents')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Document supprimé avec succès' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du document' });
  }
});

// Télécharger un document
router.get('/:id/download', authorize('teacher', 'student'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: document, error } = await supabaseAdmin
      .from('teaching_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !document) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }

    // Vérifier que le fichier existe
    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    // Si c'est un élève, vérifier qu'il a accès au document (même classe)
    if (req.user.role === 'student') {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('class_id')
        .eq('id', req.user.id)
        .single();

      if (profileError) {
        return res.status(500).json({ error: profileError.message });
      }

      if (!profile?.class_id || profile.class_id !== document.class_id) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    // Marquer comme téléchargé si c'est un élève
    if (req.user.role === 'student') {
      await supabaseAdmin
        .from('document_views')
        .upsert({
          document_id: id,
          student_id: req.user.id,
          downloaded_at: new Date().toISOString()
        }, {
          onConflict: 'document_id,student_id'
        });
    }

    // Envoyer le fichier
    res.download(document.file_path, document.file_name);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur lors du téléchargement' });
  }
});

export default router;
