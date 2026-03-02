import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppResponse } from '../services/whatsappChatbot.js';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Variables d\'environnement Supabase manquantes');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  }
});

// Middleware pour vérifier l'authentification
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Token invalide' });
    }
    
    req.user = { id: user.id };
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification du token:', error);
    return res.status(401).json({ error: 'Token invalide' });
  }
};

// Créer un contrôle planifié
router.post('/controls-plan', authenticateUser, async (req, res) => {
  try {
    const { class_id, name, date, start_time, end_time, description } = req.body;
    const teacher_id = req.user.id;

    if (!class_id || !name || !date) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const { data, error } = await supabase
      .from('controls_plan')
      .insert({
        teacher_id,
        class_id,
        name,
        date,
        start_time,
        end_time,
        description
      })
      .select()
      .single();

    if (error) {
      console.error('Erreur lors de la création du contrôle planifié:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    const control = data;
    console.log('[DEBUG] Contrôle créé avec succès:', control);

    // Créer des notifications pour les parents et élèves de la classe
    console.log('[DEBUG] Récupération des élèves de la classe:', class_id);
    const { data: studentsData, error: studentsError } = await supabase
      .from('profiles')
      .select('id')
      .eq('class_id', class_id)
      .eq('role', 'student');

    if (studentsError) {
      console.error('[DEBUG] Erreur lors de la récupération des élèves:', studentsError);
    } else {
      console.log('[DEBUG] Élèves trouvés:', studentsData);
    }

    if (studentsData && studentsData.length > 0) {
      const studentIds = studentsData.map(s => s.id);
      console.log('[DEBUG] IDs des élèves:', studentIds);
      
      const notifications = studentIds.map(studentId => ({
        user_id: studentId,
        type: 'control_scheduled',
        title: 'Nouveau contrôle planifié',
        message: `Un contrôle "${name}" est planifié pour le ${new Date(date).toLocaleDateString('fr-FR')}`,
        related_id: control.id
      }));

      console.log('[DEBUG] Création des notifications pour les élèves:', notifications);
      const { data: notifData, error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifError) {
        console.error('[DEBUG] Erreur lors de la création des notifications pour les élèves:', notifError);
      } else {
        console.log('[DEBUG] Notifications créées avec succès pour les élèves');
        console.log('[DEBUG] Nombre de notifications créées pour les élèves:', notifications.length);
      }
    } else {
      console.log('[DEBUG] Aucun élève trouvé pour cette classe');
    }

    // Créer une notification pour l'admin
    console.log('[DEBUG] Récupération de l\'admin');
    const { data: adminData, error: adminError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (adminError) {
      console.error('[DEBUG] Erreur lors de la récupération de l\'admin:', adminError);
    } else {
      console.log('[DEBUG] Admin trouvé:', adminData);
    }

    // Récupérer les informations du professeur et de la classe
    console.log('[DEBUG] Récupération des informations du professeur et de la classe');
    const { data: teacherData, error: teacherError } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', teacher_id)
      .single();

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('name, level')
      .eq('id', class_id)
      .single();

    // Récupérer la matière du professeur
    const { data: subjectData, error: subjectError } = await supabase
      .from('teacher_subjects')
      .select('subjects(name)')
      .eq('teacher_id', teacher_id)
      .limit(1)
      .single();

    if (adminData && adminData.length > 0) {
      const teacherName = teacherData ? `${teacherData.first_name} ${teacherData.last_name}` : 'Un professeur';
      const className = classData ? `${classData.name} (${classData.level})` : 'une classe';
      const subjectName = subjectData && subjectData.subjects ? subjectData.subjects.name : '';
      
      let message;
      if (subjectName) {
        message = `${teacherName} (${subjectName}) a planifié un contrôle "${name}" pour la classe ${className} le ${new Date(date).toLocaleDateString('fr-FR')}`;
      } else {
        message = `${teacherName} a planifié un contrôle "${name}" pour la classe ${className} le ${new Date(date).toLocaleDateString('fr-FR')}`;
      }
      
      const adminNotification = {
        user_id: adminData[0].id,
        type: 'control_scheduled',
        title: 'Nouveau contrôle planifié',
        message: message,
        related_id: control.id
      };

      console.log('[DEBUG] Création de la notification pour l\'admin:', adminNotification);
      const { data: adminNotifData, error: adminNotifError } = await supabase
        .from('notifications')
        .insert(adminNotification);

      if (adminNotifError) {
        console.error('[DEBUG] Erreur lors de la création de la notification pour l\'admin:', adminNotifError);
      } else {
        console.log('[DEBUG] Notification créée avec succès pour l\'admin');
      }
    } else {
      console.log('[DEBUG] Aucun admin trouvé');
    }

    // Envoyer notification WhatsApp aux parents
    try {
      if (studentsData && studentsData.length > 0) {
        const studentIds = studentsData.map(s => s.id);

        // Récupérer school_id depuis la classe
        const { data: classForSchool } = await supabase
          .from('classes')
          .select('school_id')
          .eq('id', class_id)
          .single();
        const schoolId = classForSchool?.school_id;

        // Récupérer les parents avec leur numéro
        const { data: parentLinks } = await supabase
          .from('parent_students')
          .select('profiles!parent_id(first_name, phone)')
          .in('student_id', studentIds);

        if (parentLinks && parentLinks.length > 0) {
          const teacherName = teacherData ? `${teacherData.first_name} ${teacherData.last_name}` : 'Votre professeur';
          const className = classData ? classData.name : 'N/A';
          const subjectName = subjectData?.subjects?.name || '';

          const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
          });
          const timeInfo = start_time && end_time ? `\n🕐 Horaire: ${start_time.slice(0,5)} - ${end_time.slice(0,5)}` : '';

          const messageText = `📝 *Contrôle planifié*\n\n` +
            `Classe: *${className}*\n` +
            `Professeur: ${teacherName}\n` +
            (subjectName ? `Matière: ${subjectName}\n` : '') +
            `\n📌 *${name}*\n` +
            `📅 Date: *${dateFormatted}*${timeInfo}\n` +
            (description ? `\n${description}\n` : '') +
            `\n✏️ Merci de préparer votre enfant pour ce contrôle.\n\n` +
            `━━━━━━━━━━━━━━━\n👥 L'équipe pédagogique`;

          const sentPhones = new Set();
          for (const link of parentLinks) {
            const phone = link.profiles?.phone;
            if (!phone || sentPhones.has(phone)) continue;
            sentPhones.add(phone);
            const e164Phone = phone.startsWith('+') ? phone : `+${phone}`;
            await sendWhatsAppResponse(e164Phone, messageText, schoolId);
            console.log(`[Controls] Notification contrôle envoyée au parent (${e164Phone})`);
          }
        } else {
          console.log('[Controls] Aucun parent trouvé pour les élèves de la classe');
        }
      }
    } catch (whatsappError) {
      console.error('Erreur notification WhatsApp:', whatsappError);
      // Ne pas bloquer la création du contrôle si l'envoi WhatsApp échoue
    }

    res.status(201).json(control);
  } catch (error) {
    console.error('Erreur lors de la création du contrôle planifié:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer tous les contrôles planifiés du professeur
router.get('/controls-plan', authenticateUser, async (req, res) => {
  try {
    const teacher_id = req.user.id;
    console.log('[DEBUG] Récupération des contrôles planifiés pour teacher_id:', teacher_id);

    const { data, error } = await supabase
      .from('controls_plan')
      .select(`
        *,
        classes(name, level),
        profiles(first_name, last_name)
      `)
      .eq('teacher_id', teacher_id)
      .order('date', { ascending: false })
      .order('start_time', { ascending: true });

    console.log('[DEBUG] Résultat Supabase:', { data, error });

    if (error) {
      console.error('[DEBUG] Erreur lors de la récupération des contrôles planifiés:', error);
      return res.status(500).json({ error: 'Erreur serveur', details: error });
    }

    res.json(data || []);
  } catch (error) {
    console.error('[DEBUG] Exception lors de la récupération des contrôles planifiés:', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// Récupérer un contrôle planifié par ID
router.get('/controls-plan/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const teacher_id = req.user.id;

    const { data, error } = await supabase
      .from('controls_plan')
      .select(`
        *,
        classes(name, level)
      `)
      .eq('id', id)
      .eq('teacher_id', teacher_id)
      .single();

    if (error) {
      console.error('Erreur lors de la récupération du contrôle planifié:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Contrôle non trouvé' });
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur lors de la récupération du contrôle planifié:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour un contrôle planifié
router.put('/controls-plan/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, date, start_time, end_time, description, status } = req.body;
    const teacher_id = req.user.id;

    const { data, error } = await supabase
      .from('controls_plan')
      .update({
        name: name !== undefined ? name : undefined,
        date: date !== undefined ? date : undefined,
        start_time: start_time !== undefined ? start_time : undefined,
        end_time: end_time !== undefined ? end_time : undefined,
        description: description !== undefined ? description : undefined,
        status: status !== undefined ? status : undefined
      })
      .eq('id', id)
      .eq('teacher_id', teacher_id)
      .select()
      .single();

    if (error) {
      console.error('Erreur lors de la mise à jour du contrôle planifié:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Contrôle non trouvé' });
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du contrôle planifié:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un contrôle planifié
router.delete('/controls-plan/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const teacher_id = req.user.id;

    const { data, error } = await supabase
      .from('controls_plan')
      .delete()
      .eq('id', id)
      .eq('teacher_id', teacher_id)
      .select();

    if (error) {
      console.error('Erreur lors de la suppression du contrôle planifié:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Contrôle non trouvé' });
    }

    res.json({ message: 'Contrôle supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du contrôle planifié:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer tous les contrôles planifiés pour une classe (pour le calendrier)
router.get('/controls-plan/class/:classId', authenticateUser, async (req, res) => {
  try {
    const { classId } = req.params;
    const userId = req.user.id;

    // Vérifier que le professeur est assigné à cette classe
    const { data: assignment, error: assignError } = await supabase
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', userId)
      .eq('class_id', classId)
      .maybeSingle();

    if (assignError) {
      console.error('Erreur vérification class_teachers:', assignError);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    if (!assignment) {
      return res.status(403).json({ error: 'Accès non autorisé à cette classe' });
    }

    const { data, error } = await supabase
      .from('controls_plan')
      .select(`
        *,
        classes(name),
        profiles(first_name, last_name, email)
      `)
      .eq('class_id', classId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Erreur lors de la récupération des contrôles de la classe:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Erreur lors de la récupération des contrôles de la classe:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les contrôles planifiés (calendrier) — filtré par école et classes du professeur
router.get('/controls-plan-calendar', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Récupérer le profil du professeur (school_id)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('school_id, role')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: 'Profil non trouvé' });
    }

    // 2. Récupérer les classes assignées au professeur
    const { data: teacherClasses, error: tcError } = await supabase
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', userId);

    if (tcError) {
      console.error('Erreur class_teachers:', tcError);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    const myClassIds = (teacherClasses || []).map(tc => tc.class_id);

    if (myClassIds.length === 0) {
      return res.json([]);
    }

    // 3. Récupérer les contrôles uniquement pour ces classes
    let query = supabase
      .from('controls_plan')
      .select(`
        *,
        classes(name, level, school_id),
        profiles(first_name, last_name)
      `)
      .in('class_id', myClassIds)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    const { data: controls, error: controlsError } = await query;

    if (controlsError) {
      console.error('Erreur lors de la récupération des contrôles planifiés:', controlsError);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    // 4. Filtrer par school_id (même école uniquement)
    const schoolId = profile.school_id;
    const filteredControls = schoolId
      ? (controls || []).filter(c => c.classes?.school_id === schoolId)
      : (controls || []);

    // 5. Récupérer les matières pour chaque professeur
    const controlsWithSubjects = await Promise.all(
      filteredControls.map(async (control) => {
        try {
          const { data: subjectData, error: subjectError } = await supabase
            .from('teacher_subjects')
            .select('subjects(name)')
            .eq('teacher_id', control.teacher_id)
            .limit(1)
            .single();

          if (subjectError || !subjectData) {
            return {
              ...control,
              subject_name: 'Non spécifié'
            };
          }

          return {
            ...control,
            subject_name: subjectData.subjects?.name || 'Non spécifié'
          };
        } catch (error) {
          console.error('Erreur lors de la récupération de la matière:', error);
          return {
            ...control,
            subject_name: 'Non spécifié'
          };
        }
      })
    );

    res.json(controlsWithSubjects || []);
  } catch (error) {
    console.error('Erreur lors de la récupération des contrôles planifiés:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer tous les contrôles planifiés (pour le calendrier global - admin, filtré par école)
router.get('/admin/controls-plan', authenticateUser, async (req, res) => {
  try {
    // Vérifier si l'utilisateur est admin et récupérer son school_id
    const { data: userData } = await supabase
      .from('profiles')
      .select('role, school_id')
      .eq('id', req.user.id)
      .single();

    if (!userData || !['admin', 'school_admin', 'super_admin'].includes(userData.role)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { data: allControls, error } = await supabase
      .from('controls_plan')
      .select(`
        *,
        classes(name, level, school_id),
        profiles(first_name, last_name, email)
      `)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Erreur lors de la récupération des contrôles planifiés:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }

    // Filtrer par école (sauf super_admin qui voit tout)
    let data = allControls || [];
    if (userData.school_id && userData.role !== 'super_admin') {
      data = data.filter(c => c.classes?.school_id === userData.school_id);
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur lors de la récupération des contrôles planifiés:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer le tracking de contrôle pour tous les élèves d'une session de contrôle
router.post('/sessions/:sessionId/control-tracking/batch', authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const teacherId = req.user.id;
    const { trackingData } = req.body;

    console.log('[DEBUG] Batch control tracking for session:', sessionId, 'teacher:', teacherId);
    console.log('[DEBUG] Tracking data:', trackingData);

    // Vérifier que la session appartient bien au professeur
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('teacher_id', teacherId)
      .single();

    if (sessionError || !session) {
      console.error('Session non trouvée ou accès non autorisé:', sessionError);
      return res.status(404).json({ error: 'Session non trouvée' });
    }

    // Préparer les données pour l'upsert
    const upsertData = trackingData.map(item => ({
      session_id: sessionId,
      student_id: item.student_id,
      presence: item.presence || 'present',
      presence_reason: item.presence_reason || '',
      material_status: item.material_status || 'complete',
      missing_materials: item.missing_materials || '',
      phone_use: item.phone_use || false,
      phone_confiscated: item.phone_confiscated || false,
      discipline_status: item.discipline_status || 'good',
      discipline_notes: item.discipline_notes || '',
      copy_submitted: item.copy_submitted || false,
      copy_notes: item.copy_notes || ''
    }));

    // Supprimer d'abord les données existantes pour cette session
    const { error: deleteError } = await supabase
      .from('control_tracking')
      .delete()
      .eq('session_id', sessionId);

    if (deleteError) {
      console.error('Erreur lors de la suppression des données existantes:', deleteError);
    }

    // Insérer les nouvelles données
    const { data: result, error: upsertError } = await supabase
      .from('control_tracking')
      .insert(upsertData)
      .select();

    if (upsertError) {
      console.error('Erreur lors de la création du tracking:', upsertError);
      return res.status(500).json({ error: 'Erreur lors de la création du tracking' });
    }

    console.log('[DEBUG] Batch control tracking completed, results:', result);
    res.json({ message: 'Tracking enregistré avec succès', data: result });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Marquer un contrôle comme terminé
router.put('/:id/complete', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;

    // Vérifier que le contrôle appartient bien au professeur
    const { data: control, error: controlError } = await supabase
      .from('controls_plan')
      .select('*')
      .eq('id', id)
      .eq('teacher_id', teacherId)
      .single();

    if (controlError || !control) {
      return res.status(404).json({ error: 'Contrôle non trouvé ou accès non autorisé' });
    }

    // Mettre à jour le statut du contrôle
    const { data: updatedControl, error: updateError } = await supabase
      .from('controls_plan')
      .update({ status: 'completed' })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Erreur lors de la mise à jour du contrôle:', updateError);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour du contrôle' });
    }

    console.log('[DEBUG] Contrôle marqué comme terminé:', updatedControl);
    res.json({ message: 'Contrôle marqué comme terminé avec succès', control: updatedControl });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
