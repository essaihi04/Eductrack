import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { sendWhatsAppResponse, getSchoolSessionApiKey } from '../services/whatsappChatbot.js';

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

const uploadSingleDocument = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Documents][Upload][MulterError]', {
        message: err.message,
        code: err.code,
        field: err.field,
        stack: err.stack
      });

      const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
      return res.status(isTooLarge ? 413 : 400).json({
        error: isTooLarge
          ? 'Le fichier dépasse la taille maximale autorisée (20 Mo).'
          : (err.message || 'Erreur lors du traitement du fichier uploadé')
      });
    }
    next();
  });
};

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
router.post('/', authorize('teacher'), uploadSingleDocument, async (req, res) => {
  try {
    const requestId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const teacherId = req.user.id;
    const { classId, subjectId, controlId, title, documentType, description } = req.body;

    console.log(`[Documents][${requestId}] Upload start`, {
      teacherId,
      classId,
      subjectId,
      controlId,
      titleLength: title?.length || 0,
      documentType,
      hasFile: Boolean(req.file),
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      fileType: req.file?.mimetype
    });

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
      console.warn(`[Documents][${requestId}] Aucun fichier dans la requête`);
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
      console.warn(`[Documents][${requestId}] Accès classe refusé`, { classId, teacherId, classError: classError?.message });
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
      console.error(`[Documents][${requestId}] Failed to insert document:`, error);
      throw error;
    }

    console.log(`[Documents][${requestId}] Document created:`, {
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

      console.log(`[Documents][${requestId}] Creating notifications:`, {
        count: notifications.length,
        firstStudentId: notifications[0]?.user_id
      });

      const { error: notifError } = await supabaseAdmin
        .from('notifications')
        .insert(notifications);

      if (notifError) {
        console.error(`[Documents][${requestId}] Failed to insert notifications:`, notifError);
      } else {
        console.log(`[Documents][${requestId}] Notifications created successfully:`, notifications.length);
      }

      // Envoyer notification WhatsApp aux parents (asynchrone, sans bloquer la requête HTTP)
      void (async () => {
        try {
          const studentIds = students.map(s => s.id);

          const { data: classInfoWa } = await supabaseAdmin
            .from('classes')
            .select('name, school_id')
            .eq('id', classId)
            .single();

          const schoolId = classInfoWa?.school_id || req.user.school_id;
          const sessionApiKey = await getSchoolSessionApiKey(schoolId);

          console.log(`[Documents][${requestId}] WhatsApp session check`, {
            schoolId,
            hasSessionApiKey: Boolean(sessionApiKey)
          });

          if (!sessionApiKey) {
            console.warn(`[Documents][${requestId}] WhatsApp session non connectée, notifications WhatsApp ignorées`);
            return;
          }

          // Récupérer les parents avec leur numéro
          const { data: parentLinks } = await supabaseAdmin
            .from('parent_students')
            .select('profiles!parent_id(first_name, phone)')
            .in('student_id', studentIds);

          if (parentLinks && parentLinks.length > 0) {
            const documentTypeLabel = {
              'cours': 'Cours',
              'exercice': 'Exercice',
              'correction': 'Correction',
              'support': 'Support pédagogique',
              'devoir': 'Devoir maison',
              'rattrapage': 'Rattrapage',
              'approfondissement': 'Approfondissement',
              'autre': 'Document'
            }[documentType] || 'Document';

            const messageCaption = `📄 *Nouveau document pédagogique*\n\n` +
              `Classe: *${classInfoWa?.name || 'N/A'}*\n` +
              `Professeur: ${teacherName}\n` +
              (subjectName ? `Matière: ${subjectName}\n` : '') +
              `Type: ${documentTypeLabel}\n\n` +
              `📝 *${title}*\n` +
              (description ? `${description}\n\n` : '\n') +
              `━━━━━━━━━━━━━━━\n� L'équipe pédagogique`;

            const sentPhones = new Set();
            
            // Importer la fonction d'envoi de fichier
            const { sendWhatsAppFile } = await import('../services/whatsappChatbot.js');
            
            for (const link of parentLinks) {
              const phone = link.profiles?.phone;
              if (!phone || sentPhones.has(phone)) continue;
              sentPhones.add(phone);
              const e164Phone = phone.startsWith('+') ? phone : `+${phone}`;
              
              // Envoyer le fichier avec la légende
              const fileSent = await sendWhatsAppFile(e164Phone, req.file.path, messageCaption, schoolId);
              
              console.log(`[Documents][${requestId}] Notification document parent`, { 
                phone: e164Phone, 
                fileSent,
                fileName: req.file.originalname 
              });
              
              // Attendre un peu entre chaque envoi pour éviter le rate limiting
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } else {
            console.log(`[Documents][${requestId}] Aucun parent trouvé pour les élèves de la classe`);
          }
        } catch (whatsappError) {
          console.error(`[Documents][${requestId}] Erreur notification WhatsApp:`, whatsappError);
        }
      })();
    } else {
      console.log(`[Documents][${requestId}] No students found to notify`);
    }

    console.log(`[Documents][${requestId}] Upload success, response 201`);
    res.status(201).json(data);
  } catch (error) {
    console.error('[Documents] Erreur upload route:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack
    });
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
