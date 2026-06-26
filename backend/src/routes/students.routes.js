import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { profilePhotoUpload, uploadProfilePhotoFile } from '../utils/profilePhoto.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// Upload de la photo de profil de l'élève (remplace l'avatar emoji)
router.post('/me/photo', authorize('student'), profilePhotoUpload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucune image fournie' });
    const avatar_url = await uploadProfilePhotoFile(req.file);
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url })
      .eq('id', req.user.id)
      .select('id, avatar_url')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur upload photo profil élève:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// Récupérer les documents pédagogiques pour un élève
router.get('/me/documents', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Récupérer la classe de l'élève
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    if (!profile) {
      return res.status(404).json({ error: 'Profil non trouvé' });
    }

    if (!profile.class_id) {
      return res.json([]);
    }

    // Récupérer tous les documents de la classe de l'élève
    const { data, error } = await supabaseAdmin
      .from('teaching_documents')
      .select(`
        *,
        classes(name, level),
        subjects(name),
        controls_plan(name),
        profiles!teaching_documents_teacher_id_fkey(first_name, last_name)
      `)
      .eq('class_id', profile.class_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Marquer les documents comme vus pour cet élève
    const documentsWithViewStatus = await Promise.all(
      (data || []).map(async (doc) => {
        const { data: view } = await supabaseAdmin
          .from('document_views')
          .select('viewed_at, downloaded_at')
          .eq('document_id', doc.id)
          .eq('student_id', studentId)
          .single();

        return {
          ...doc,
          viewed: !!view,
          downloaded: view?.downloaded_at || false,
          viewed_at: view?.viewed_at || null
        };
      })
    );

    res.json(documentsWithViewStatus);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Marquer un document comme vu par un élève
router.post('/me/documents/:id/view', authorize('student'), async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user.id;

    // Vérifier si l'élève a déjà vu ce document
    const { data: existingView } = await supabase
      .from('document_views')
      .select('*')
      .eq('document_id', id)
      .eq('student_id', studentId)
      .single();

    if (existingView) {
      return res.json({ message: 'Document déjà marqué comme vu' });
    }

    // Créer une entrée de vue
    const { error } = await supabaseAdmin
      .from('document_views')
      .insert({
        document_id: id,
        student_id: studentId
      });

    if (error) throw error;

    res.json({ message: 'Document marqué comme vu' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Marquer un document comme téléchargé par un élève
router.post('/me/documents/:id/download', authorize('student'), async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user.id;

    // Mettre à jour ou créer l'entrée de vue avec la date de téléchargement
    const { error } = await supabaseAdmin
      .from('document_views')
      .upsert({
        document_id: id,
        student_id: studentId,
        downloaded_at: new Date().toISOString()
      }, {
        onConflict: 'document_id,student_id'
      });

    if (error) throw error;

    res.json({ message: 'Document marqué comme téléchargé' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Lister tous les élèves (Admin, Prof)
router.get('/', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, classes(*)')
      .eq('role', 'student')
      .order('last_name');

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer un élève par ID
router.get('/:id', authorize('admin', 'school_admin', 'teacher', 'student'), async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que l'élève ne peut voir que ses propres données
    if (req.user.role === 'student' && req.user.id !== id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*, classes(*)')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Créer un élève (Admin)
router.post('/', authorize('admin', 'school_admin'), async (req, res) => {
  try {
    const { email, firstName, lastName, classId, dateOfBirth } = req.body;

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        email,
        first_name: firstName,
        last_name: lastName,
        role: 'student',
        class_id: classId,
        date_of_birth: dateOfBirth
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mettre à jour un élève (Admin)
router.put('/:id', authorize('admin', 'school_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, classId, dateOfBirth } = req.body;

    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        class_id: classId,
        date_of_birth: dateOfBirth
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Supprimer un élève (Admin)
router.delete('/:id', authorize('admin', 'school_admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Élève supprimé avec succès' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mettre à jour le profil de l'élève (Student)
router.put('/me/profile', authorize('student'), async (req, res) => {
  try {
    const { first_name, last_name, phone, bio, avatar } = req.body;
    const studentId = req.user.id;

    const updateData = {
      first_name,
      last_name,
      phone,
      updated_at: new Date().toISOString()
    };

    // Ajouter bio seulement si la colonne existe
    if (bio !== undefined) {
      updateData.bio = bio;
    }

    // Ajouter avatar seulement si fourni (sera ignoré si la colonne n'existe pas)
    if (avatar !== undefined) {
      updateData.avatar = avatar;
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', studentId)
      .select()
      .single();

    if (error) {
      // Si l'erreur est due à la colonne avatar qui n'existe pas, on réessaie sans
      if (error.code === 'PGRST204' && error.message.includes('avatar')) {
        delete updateData.avatar;
        const { data: retryData, error: retryError } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', studentId)
          .select()
          .single();
        
        if (retryError) throw retryError;
        return res.json(retryData);
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== DEVOIRS ====================

// Récupérer les devoirs de l'élève
router.get('/me/homework', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Récupérer la classe de l'élève
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .single();

    if (studentError) throw studentError;

    if (!student.class_id) {
      return res.json([]);
    }

    // Récupérer tous les devoirs de la classe
    const { data: allHomework, error: hwError } = await supabaseAdmin
      .from('homework')
      .select(`
        *,
        classes(name, level),
        profiles(first_name, last_name),
        subjects(name),
        homework_students(student_id),
        homework_submissions(status, submission_date, grade, feedback)
      `)
      .eq('class_id', student.class_id)
      .order('due_date', { ascending: true });

    if (hwError) throw hwError;

    // Fallback matière via teacher_subjects si subjects.name est NULL
    const teacherIdsNeedingSubject = Array.from(
      new Set(
        (allHomework || [])
          .filter(hw => !hw.subjects?.name && hw.created_by)
          .map(hw => hw.created_by)
      )
    );

    let subjectByTeacherId = new Map();
    if (teacherIdsNeedingSubject.length) {
      const { data: teacherSubjects, error: teacherSubjectsError } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id, subjects(name)')
        .in('teacher_id', teacherIdsNeedingSubject);

      if (teacherSubjectsError) throw teacherSubjectsError;

      (teacherSubjects || []).forEach(ts => {
        const subjectName = ts?.subjects?.name;
        if (subjectName && !subjectByTeacherId.has(ts.teacher_id)) {
          subjectByTeacherId.set(ts.teacher_id, subjectName);
        }
      });
    }

    const enrichedHomework = (allHomework || []).map(hw => {
      const directSubject = hw.subjects?.name || null;
      const fallbackSubject = !directSubject && hw.created_by
        ? subjectByTeacherId.get(hw.created_by) || null
        : null;

      return {
        ...hw,
        subjects: directSubject ? { name: directSubject } : (fallbackSubject ? { name: fallbackSubject } : null)
      };
    });

    // Filtrer les devoirs : soit pour toute la classe, soit pour le groupe de l'élève
    const filteredHomework = enrichedHomework.filter(hw => {
      if (hw.target_type === 'all') {
        return true;
      }
      if (hw.target_type === 'group') {
        return hw.homework_students.some(hs => hs.student_id === studentId);
      }
      return false;
    });

    res.json(filteredHomework);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Soumettre un devoir
router.post('/me/homework/:homeworkId/submit', authorize('student'), async (req, res) => {
  try {
    const { homeworkId } = req.params;
    const studentId = req.user.id;
    const { fileUrl } = req.body;

    // Vérifier que l'élève a accès à ce devoir
    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .single();

    const { data: homework } = await supabaseAdmin
      .from('homework')
      .select('class_id, target_type')
      .eq('id', homeworkId)
      .single();

    if (!homework || homework.class_id !== student.class_id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (homework.target_type === 'group') {
      const { data: hwStudent } = await supabaseAdmin
        .from('homework_students')
        .select('id')
        .eq('homework_id', homeworkId)
        .eq('student_id', studentId)
        .single();

      if (!hwStudent) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    // Créer ou mettre à jour la soumission
    const { data: submission, error } = await supabaseAdmin
      .from('homework_submissions')
      .upsert({
        homework_id: homeworkId,
        student_id: studentId,
        status: 'submitted',
        submission_date: new Date().toISOString(),
        file_url: fileUrl
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

// Changer le mot de passe de l'élève (Student)
router.post('/me/change-password', authorize('student'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const studentId = req.user.id;
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    // Vérifier le mot de passe actuel en utilisant signInWithPassword
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Erreur getUser:', userError);
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    // Vérifier le mot de passe actuel
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (signInError) {
      console.error('Erreur signIn:', signInError);
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    // Changer le mot de passe
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) throw updateError;

    // Déconnecter l'utilisateur pour forcer la reconnexion avec le nouveau mot de passe
    await supabase.auth.signOut();

    res.json({ message: 'Mot de passe changé avec succès. Veuillez vous reconnecter.' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Récupérer les statistiques de suivi de l'élève (Student)
router.get('/me/tracking-stats', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    const { data: tracking, error } = await supabaseAdmin
      .from('session_tracking')
      .select('presence, cahier_present, participation, homework, discipline, phone_use, writing, sessions(date)')
      .eq('student_id', studentId);

    if (error) throw error;

    const stats = {
      present_count: tracking.filter(t => t.presence === 'present').length,
      absent_count: tracking.filter(t => t.presence === 'absent').length,
      late_count: tracking.filter(t => t.presence === 'late').length,
      cahier_present_count: tracking.filter(t => t.cahier_present).length,
      excellent_participation: tracking.filter(t => t.participation === 'excellent').length,
      good_participation: tracking.filter(t => t.participation === 'bon').length,
      faible_participation: tracking.filter(t => t.participation === 'faible').length,
      homework_done: tracking.filter(t => t.homework === 'done').length,
      concentre_count: tracking.filter(t => t.discipline === 'concentre').length,
      moyen_count: tracking.filter(t => t.discipline === 'moyen').length,
      distrait_count: tracking.filter(t => t.discipline === 'distrait').length,
      correct_attitude: tracking.filter(t => t.attitude === 'correct').length,
      bavarre_attitude: tracking.filter(t => t.attitude === 'bavarre').length,
      perturbateur_attitude: tracking.filter(t => t.attitude === 'perturbateur').length,
      phone_use_count: tracking.filter(t => t.phone_use).length,
      writing_count: tracking.filter(t => t.writing).length,
      total_sessions: tracking.length
    };

    res.json(stats);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Classement de la classe de l'élève parmi toutes les classes de l'école
router.get('/me/class-ranking', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Récupérer le profil de l'élève (class_id, school_id)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('class_id, school_id')
      .eq('id', studentId)
      .single();

    if (profileError) throw profileError;
    if (!profile?.class_id || !profile?.school_id) {
      return res.json({ rank: null, totalClasses: 0, message: 'Aucune classe assignée' });
    }

    // Récupérer toutes les classes de l'école
    const { data: classes, error: classesError } = await supabaseAdmin
      .from('classes')
      .select('id, name, level')
      .eq('school_id', profile.school_id);

    if (classesError) throw classesError;
    if (!classes || classes.length === 0) {
      return res.json({ rank: null, totalClasses: 0, message: 'Aucune classe trouvée' });
    }

    // Récupérer tous les élèves de l'école avec leur class_id
    const classIds = classes.map(c => c.id);
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('profiles')
      .select('id, class_id')
      .eq('role', 'student')
      .eq('school_id', profile.school_id)
      .in('class_id', classIds);

    if (studentsError) throw studentsError;

    // Récupérer tout le tracking de ces élèves
    const studentIds = (students || []).map(s => s.id);
    if (studentIds.length === 0) {
      return res.json({ rank: null, totalClasses: 0, message: 'Aucun élève trouvé' });
    }

    const { data: allTracking, error: trackingError } = await supabaseAdmin
      .from('session_tracking')
      .select('student_id, presence, cahier_present, participation, discipline, writing, phone_use')
      .in('student_id', studentIds);

    if (trackingError) throw trackingError;

    // Mapper student_id -> class_id
    const studentClassMap = {};
    (students || []).forEach(s => { studentClassMap[s.id] = s.class_id; });

    // Agréger par classe
    const classData = {};
    classIds.forEach(cid => {
      classData[cid] = { total: 0, present: 0, cahier: 0, writing: 0, concentre: 0, moyenDisc: 0, distrait: 0, excellentPart: 0, bonPart: 0, faiblePart: 0, phoneUse: 0 };
    });

    (allTracking || []).forEach(t => {
      const cid = studentClassMap[t.student_id];
      if (!cid || !classData[cid]) return;
      const d = classData[cid];
      d.total++;
      if (t.presence === 'present') d.present++;
      if (t.cahier_present === true) d.cahier++;
      if (t.writing === true) d.writing++;
      if (t.discipline === 'concentre') d.concentre++;
      else if (t.discipline === 'moyen') d.moyenDisc++;
      else if (t.discipline === 'distrait') d.distrait++;
      if (t.participation === 'excellent') d.excellentPart++;
      else if (t.participation === 'bon') d.bonPart++;
      else if (t.participation === 'faible') d.faiblePart++;
      if (t.phone_use === true) d.phoneUse++;
    });

    // Calculer le score de chaque classe
    const classScores = classes.map(cls => {
      const d = classData[cls.id];
      if (d.total === 0) {
        return { classId: cls.id, className: cls.name, level: cls.level, score: 0, total: 0, details: { presence: 0, cahier: 0, writing: 0, vigilance: 0, participation: 0 } };
      }
      const presenceScore = (d.present / d.total) * 100;
      const cahierScore = (d.cahier / d.total) * 100;
      const writingScore = (d.writing / d.total) * 100;
      const vigilanceScore = ((d.concentre * 100 + d.moyenDisc * 50) / d.total);
      const participationScore = ((d.excellentPart * 100 + d.bonPart * 75 + d.faiblePart * 50) / d.total);
      const phoneRate = (d.phoneUse / d.total) * 100;

      const score = (
        presenceScore * 0.25 +
        cahierScore * 0.15 +
        writingScore * 0.15 +
        vigilanceScore * 0.20 +
        participationScore * 0.15 +
        (100 - phoneRate) * 0.10
      );

      return {
        classId: cls.id,
        className: cls.name,
        level: cls.level,
        score: Math.round(score * 10) / 10,
        total: d.total,
        details: {
          presence: Math.round(presenceScore * 10) / 10,
          cahier: Math.round(cahierScore * 10) / 10,
          writing: Math.round(writingScore * 10) / 10,
          vigilance: Math.round(vigilanceScore * 10) / 10,
          participation: Math.round(participationScore * 10) / 10,
          phoneRate: Math.round(phoneRate * 10) / 10,
        }
      };
    });

    // Trier par score décroissant (seules les classes avec des données)
    const rankedClasses = classScores
      .filter(c => c.total > 0)
      .sort((a, b) => b.score - a.score);

    // Trouver le rang de la classe de l'élève
    const myClassIndex = rankedClasses.findIndex(c => c.classId === profile.class_id);
    const myClass = rankedClasses[myClassIndex];
    const rank = myClassIndex >= 0 ? myClassIndex + 1 : null;

    // Identifier les forces et faiblesses
    const strengths = [];
    const weaknesses = [];

    if (myClass) {
      const avgScores = { presence: 0, cahier: 0, writing: 0, vigilance: 0, participation: 0 };
      const count = rankedClasses.length;
      rankedClasses.forEach(c => {
        avgScores.presence += c.details.presence;
        avgScores.cahier += c.details.cahier;
        avgScores.writing += c.details.writing;
        avgScores.vigilance += c.details.vigilance;
        avgScores.participation += c.details.participation;
      });
      Object.keys(avgScores).forEach(k => { avgScores[k] /= count; });

      const metrics = [
        { key: 'presence', label: 'Présence', emoji: '📅', value: myClass.details.presence, avg: avgScores.presence },
        { key: 'cahier', label: 'Cahier', emoji: '📓', value: myClass.details.cahier, avg: avgScores.cahier },
        { key: 'writing', label: 'Écriture', emoji: '✍️', value: myClass.details.writing, avg: avgScores.writing },
        { key: 'vigilance', label: 'Vigilance', emoji: '🧠', value: myClass.details.vigilance, avg: avgScores.vigilance },
        { key: 'participation', label: 'Participation', emoji: '🗣️', value: myClass.details.participation, avg: avgScores.participation },
      ];

      metrics.forEach(m => {
        const diff = m.value - m.avg;
        if (diff >= 5) {
          strengths.push({ ...m, diff: Math.round(diff * 10) / 10 });
        } else if (diff <= -5) {
          weaknesses.push({ ...m, diff: Math.round(diff * 10) / 10 });
        }
      });

      strengths.sort((a, b) => b.diff - a.diff);
      weaknesses.sort((a, b) => a.diff - b.diff);
    }

    // Générer des conseils
    const tips = [];
    if (weaknesses.length > 0) {
      const worst = weaknesses[0];
      const tipMap = {
        presence: 'Soyez tous présents et à l\'heure — chaque absence fait baisser le classement.',
        cahier: 'Pensez tous à apporter vos cahiers — c\'est un critère important du classement.',
        writing: 'Écrivez l\'essentiel pendant les cours — ça booste le score de la classe.',
        vigilance: 'Restez concentrés en classe — moins de distractions = meilleur classement.',
        participation: 'Participez davantage — une question ou réponse par séance suffit.',
      };
      tips.push({ type: 'improve', text: tipMap[worst.key] || 'Améliorez-vous sur vos points faibles.' });
    }
    if (strengths.length > 0) {
      const best = strengths[0];
      tips.push({ type: 'keep', text: `Continuez sur ${best.label.toLowerCase()} — c'est votre point fort (+${best.diff}% au-dessus de la moyenne) !` });
    }
    if (rank === 1) {
      tips.push({ type: 'champion', text: 'Vous êtes 1ers ! Gardez le rythme pour rester au sommet.' });
    } else if (rank && rank <= 3) {
      tips.push({ type: 'podium', text: `Vous êtes sur le podium (${rank}e). Un petit effort et vous serez 1ers !` });
    }

    res.json({
      rank,
      totalClasses: rankedClasses.length,
      myClass: myClass || null,
      ranking: rankedClasses.slice(0, 10),
      strengths: strengths.slice(0, 3),
      weaknesses: weaknesses.slice(0, 3),
      tips,
    });
  } catch (error) {
    console.error('Erreur class-ranking:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les badges de l'élève (Student)
router.get('/me/badges', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    const { data: tracking, error } = await supabaseAdmin
      .from('session_tracking')
      .select('presence, cahier_present, participation, homework, discipline, phone_use, writing, sleeping, sessions!inner(date)')
      .eq('student_id', studentId)
      .order('sessions(date)', { ascending: true });

    if (error) throw error;

    const total = tracking.length;
    const present = tracking.filter(t => t.presence === 'present' || t.presence === 'excused').length;
    const cahier = tracking.filter(t => t.cahier_present === true).length;
    const writing = tracking.filter(t => t.writing === true).length;
    const homeworkDone = tracking.filter(t => t.homework === 'done' || t.homework === true).length;
    const homeworkTracked = tracking.filter(t => t.homework !== null && t.homework !== undefined).length;
    const concentre = tracking.filter(t => t.discipline === 'concentre').length;
    const excellentParticipation = tracking.filter(t => t.participation === 'excellent').length;
    const bonParticipation = tracking.filter(t => t.participation === 'bon').length;
    const phoneUse = tracking.filter(t => t.phone_use === true).length;
    const sleeping = tracking.filter(t => t.sleeping === true).length;

    // Calculer les séries de présence consécutive
    let currentStreak = 0;
    let maxStreak = 0;
    const sortedByDate = [...tracking].sort((a, b) => (a.sessions?.date || '').localeCompare(b.sessions?.date || ''));
    for (const t of sortedByDate) {
      if (t.presence === 'present' || t.presence === 'excused') {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    // Définition des badges
    const badgeDefinitions = [
      // PRÉSENCE
      { id: 'first_day', emoji: '🌟', name: 'Premier Pas', desc: 'Assister à ta première séance', category: 'presence', condition: () => total >= 1, progress: () => Math.min(total, 1), target: 1 },
      { id: 'present_10', emoji: '📅', name: 'Régulier', desc: 'Être présent à 10 séances', category: 'presence', condition: () => present >= 10, progress: () => Math.min(present, 10), target: 10 },
      { id: 'present_30', emoji: '🏅', name: 'Assidu', desc: 'Être présent à 30 séances', category: 'presence', condition: () => present >= 30, progress: () => Math.min(present, 30), target: 30 },
      { id: 'present_50', emoji: '🏆', name: 'Pilier de Classe', desc: 'Être présent à 50 séances', category: 'presence', condition: () => present >= 50, progress: () => Math.min(present, 50), target: 50 },
      { id: 'streak_5', emoji: '🔥', name: 'Série de 5', desc: '5 séances présent d\'affilée', category: 'presence', condition: () => maxStreak >= 5, progress: () => Math.min(currentStreak, 5), target: 5 },
      { id: 'streak_10', emoji: '💪', name: 'Inarrêtable', desc: '10 séances présent d\'affilée', category: 'presence', condition: () => maxStreak >= 10, progress: () => Math.min(currentStreak, 10), target: 10 },
      { id: 'streak_20', emoji: '⚡', name: 'Machine', desc: '20 séances présent d\'affilée', category: 'presence', condition: () => maxStreak >= 20, progress: () => Math.min(currentStreak, 20), target: 20 },

      // DEVOIRS
      { id: 'hw_5', emoji: '📝', name: 'Bosseur', desc: 'Rendre 5 devoirs', category: 'homework', condition: () => homeworkDone >= 5, progress: () => Math.min(homeworkDone, 5), target: 5 },
      { id: 'hw_15', emoji: '📚', name: 'Travailleur', desc: 'Rendre 15 devoirs', category: 'homework', condition: () => homeworkDone >= 15, progress: () => Math.min(homeworkDone, 15), target: 15 },
      { id: 'hw_perfect', emoji: '💯', name: 'Sans Faute', desc: '100% de devoirs rendus (min 10)', category: 'homework', condition: () => homeworkTracked >= 10 && homeworkDone === homeworkTracked, progress: () => homeworkTracked > 0 ? Math.min(Math.round((homeworkDone / homeworkTracked) * 10), 10) : 0, target: 10 },

      // PARTICIPATION
      { id: 'particip_5', emoji: '🗣️', name: 'Voix Active', desc: '5 participations excellentes', category: 'participation', condition: () => excellentParticipation >= 5, progress: () => Math.min(excellentParticipation, 5), target: 5 },
      { id: 'particip_15', emoji: '🎤', name: 'Leader', desc: '15 participations excellentes', category: 'participation', condition: () => excellentParticipation >= 15, progress: () => Math.min(excellentParticipation, 15), target: 15 },
      { id: 'particip_good_10', emoji: '👍', name: 'Contributeur', desc: '10 bonnes participations', category: 'participation', condition: () => (excellentParticipation + bonParticipation) >= 10, progress: () => Math.min(excellentParticipation + bonParticipation, 10), target: 10 },

      // VIGILANCE / DISCIPLINE
      { id: 'concentre_10', emoji: '🧠', name: 'Concentré', desc: 'Être concentré 10 fois', category: 'vigilance', condition: () => concentre >= 10, progress: () => Math.min(concentre, 10), target: 10 },
      { id: 'concentre_25', emoji: '🎯', name: 'Focus Total', desc: 'Être concentré 25 fois', category: 'vigilance', condition: () => concentre >= 25, progress: () => Math.min(concentre, 25), target: 25 },
      { id: 'no_phone_10', emoji: '📵', name: 'Déconnecté', desc: '10 séances sans téléphone', category: 'vigilance', condition: () => total >= 10 && (total - phoneUse) >= 10, progress: () => Math.min(total - phoneUse, 10), target: 10 },
      { id: 'no_sleep_10', emoji: '☕', name: 'Éveillé', desc: '10 séances sans dormir', category: 'vigilance', condition: () => total >= 10 && (total - sleeping) >= 10, progress: () => Math.min(total - sleeping, 10), target: 10 },

      // CAHIER & ÉCRITURE
      { id: 'cahier_10', emoji: '📓', name: 'Bien Équipé', desc: 'Avoir son cahier 10 fois', category: 'cahier', condition: () => cahier >= 10, progress: () => Math.min(cahier, 10), target: 10 },
      { id: 'cahier_25', emoji: '🎒', name: 'Toujours Prêt', desc: 'Avoir son cahier 25 fois', category: 'cahier', condition: () => cahier >= 25, progress: () => Math.min(cahier, 25), target: 25 },
      { id: 'writing_10', emoji: '✍️', name: 'Scribe', desc: 'Écrire dans 10 séances', category: 'cahier', condition: () => writing >= 10, progress: () => Math.min(writing, 10), target: 10 },
      { id: 'writing_25', emoji: '📖', name: 'Auteur', desc: 'Écrire dans 25 séances', category: 'cahier', condition: () => writing >= 25, progress: () => Math.min(writing, 25), target: 25 },

      // SCORE GLOBAL
      { id: 'perfect_rate', emoji: '👑', name: 'Élève Modèle', desc: '90%+ de présence sur 20+ séances', category: 'global', condition: () => total >= 20 && (present / total) >= 0.9, progress: () => total >= 20 ? Math.min(Math.round((present / total) * 10), 10) : Math.min(total, 20) / 2, target: 10 },
    ];

    const earned = [];
    const inProgress = [];

    for (const badge of badgeDefinitions) {
      const isEarned = badge.condition();
      const progress = badge.progress();
      const pct = Math.round((progress / badge.target) * 100);

      const badgeData = {
        id: badge.id,
        emoji: badge.emoji,
        name: badge.name,
        desc: badge.desc,
        category: badge.category,
        progress,
        target: badge.target,
        pct: Math.min(pct, 100),
      };

      if (isEarned) {
        earned.push(badgeData);
      } else if (pct > 0) {
        inProgress.push(badgeData);
      }
    }

    // Trier in-progress par proximité de complétion (desc)
    inProgress.sort((a, b) => b.pct - a.pct);

    res.json({ earned, inProgress, totalSessions: total });
  } catch (error) {
    console.error('Erreur badges:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les notes de contrôle de l'élève (Student)
router.get('/me/control-grades', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .single();

    if (profileError) throw profileError;
    if (!profile?.class_id) return res.json([]);

    const { data: controls, error: controlsError } = await supabaseAdmin
      .from('controls_plan')
      .select(`
        id,
        name,
        date,
        description,
        status,
        teacher_id,
        class_id,
        profiles!controls_plan_teacher_id_fkey (first_name, last_name),
        classes (name, level)
      `)
      .eq('class_id', profile.class_id)
      .eq('status', 'completed')
      .order('date', { ascending: false });

    if (controlsError) throw controlsError;

    const controlIds = (controls || []).map(c => c.id);
    const teacherIds = Array.from(new Set((controls || []).map(c => c.teacher_id).filter(Boolean)));

    if (!controlIds.length) {
      return res.json([]);
    }

    const { data: notes, error: notesError } = await supabaseAdmin
      .from('control_notes')
      .select('id, control_id, note, appreciation, created_at')
      .eq('student_id', studentId)
      .in('control_id', controlIds)
      .order('created_at', { ascending: false });

    if (notesError) throw notesError;

    const notesByControlId = new Map();
    (notes || []).forEach(n => {
      if (!notesByControlId.has(n.control_id)) {
        notesByControlId.set(n.control_id, n);
      }
    });

    let subjectByTeacherId = new Map();
    if (teacherIds.length) {
      const { data: teacherSubjects, error: teacherSubjectsError } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id, subjects(name)')
        .in('teacher_id', teacherIds);

      if (teacherSubjectsError) throw teacherSubjectsError;

      (teacherSubjects || []).forEach(ts => {
        const subjectName = ts?.subjects?.name;
        if (subjectName && !subjectByTeacherId.has(ts.teacher_id)) {
          subjectByTeacherId.set(ts.teacher_id, subjectName);
        }
      });
    }

    const formatted = (controls || []).map(control => {
      const note = notesByControlId.get(control.id) || null;
      const teacher = control?.profiles;
      const subjectName = subjectByTeacherId.get(control.teacher_id) || null;

      return {
        id: control.id,
        note_id: note?.id || null,
        note: note?.note ?? null,
        appreciation: note?.appreciation ?? null,
        control_id: control.id,
        control_name: control?.name,
        control_date: control?.date,
        control_description: control?.description,
        subject_name: subjectName,
        teacher_name: teacher ? `${teacher.first_name} ${teacher.last_name}` : null,
        class_name: control?.classes?.name,
        class_level: control?.classes?.level,
        created_at: note?.created_at || null
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Récupérer l'historique de suivi de l'élève (Student)
router.get('/me/tracking-history', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { limit = 10 } = req.query;

    const { data, error } = await supabaseAdmin
      .from('session_tracking')
      .select('*, sessions(date, subject_id, teacher_id, subjects(name))')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    const teacherIdsNeedingSubject = Array.from(
      new Set(
        (data || [])
          .filter(t => !t?.sessions?.subject_id && t?.sessions?.teacher_id)
          .map(t => t.sessions.teacher_id)
      )
    );

    let subjectByTeacherId = new Map();
    if (teacherIdsNeedingSubject.length) {
      const { data: teacherSubjects, error: teacherSubjectsError } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id, subjects(name)')
        .in('teacher_id', teacherIdsNeedingSubject);

      if (teacherSubjectsError) throw teacherSubjectsError;

      (teacherSubjects || []).forEach(ts => {
        const subjectName = ts?.subjects?.name;
        if (subjectName && !subjectByTeacherId.has(ts.teacher_id)) {
          subjectByTeacherId.set(ts.teacher_id, subjectName);
        }
      });
    }

    const formatted = (data || []).map(t => {
      const directSubject = t.sessions?.subjects?.name || null;
      const fallbackSubject = !directSubject && t.sessions?.teacher_id
        ? subjectByTeacherId.get(t.sessions.teacher_id) || null
        : null;

      return {
        ...t,
        session_date: t.sessions?.date,
        session_subject_id: t.sessions?.subject_id || null,
        subject_name: directSubject || fallbackSubject
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== EMPLOI DU TEMPS ====================

// Récupérer l'emploi du temps complet de la classe de l'élève
router.get('/me/timetable', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Get student's class_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .single();

    if (profileError) throw profileError;
    if (!profile?.class_id) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from('class_timetable')
      .select('*, subject:subjects(id, name, code), teacher:profiles!class_timetable_teacher_id_fkey(id, first_name, last_name)')
      .eq('class_id', profile.class_id)
      .order('slot_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erreur timetable:', error);
    res.status(500).json({ error: error.message });
  }
});

// Smart "Qu'est-ce que j'ai demain ?" endpoint
router.get('/me/tomorrow', authorize('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // Get student's class_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('class_id, first_name')
      .eq('id', studentId)
      .single();

    if (profileError) throw profileError;
    if (!profile?.class_id) {
      return res.json({ day: null, dayLabel: null, date: null, sessions: [], preparations: [], message: 'Aucune classe assignée.' });
    }

    // Determine tomorrow's day_of_week
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayLabels = { sunday: 'Dimanche', monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi' };

    let targetDay = dayNames[tomorrow.getDay()];
    let targetDate = tomorrow.toISOString().split('T')[0];

    // If tomorrow is Sunday, show Monday
    if (targetDay === 'sunday') {
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDay = 'monday';
      targetDate = tomorrow.toISOString().split('T')[0];
    }

    // 1. Get timetable slots for tomorrow
    const { data: slots, error: slotsError } = await supabaseAdmin
      .from('class_timetable')
      .select('*, subject:subjects(id, name), teacher:profiles!class_timetable_teacher_id_fkey(id, first_name, last_name)')
      .eq('class_id', profile.class_id)
      .eq('day_of_week', targetDay)
      .order('slot_order', { ascending: true });

    if (slotsError) throw slotsError;

    const sessions = (slots || []).map(slot => ({
      startTime: slot.start_time?.slice(0, 5),
      endTime: slot.end_time?.slice(0, 5),
      subject: slot.subject?.name || 'Matière libre',
      subjectId: slot.subject?.id || null,
      teacher: slot.teacher ? `${slot.teacher.first_name} ${slot.teacher.last_name}` : null,
      room: slot.room || null
    }));

    // Collect tomorrow's subject IDs for matching
    const tomorrowSubjectIds = sessions.map(s => s.subjectId).filter(Boolean);

    // 2. Get pending homework due within 2 days
    const twoDaysLater = new Date(now);
    twoDaysLater.setDate(twoDaysLater.getDate() + 3);
    const twoDaysStr = twoDaysLater.toISOString().split('T')[0];

    const { data: homework, error: hwError } = await supabaseAdmin
      .from('homework')
      .select('id, title, type, due_date, subject_id, subjects:subject_id(name)')
      .eq('class_id', profile.class_id)
      .lte('due_date', twoDaysStr)
      .gte('due_date', now.toISOString().split('T')[0]);

    if (hwError) throw hwError;

    // Check which homework the student has already submitted
    const homeworkIds = (homework || []).map(h => h.id);
    let submittedIds = new Set();
    if (homeworkIds.length > 0) {
      const { data: submissions } = await supabaseAdmin
        .from('homework_submissions')
        .select('homework_id')
        .eq('student_id', studentId)
        .eq('status', 'submitted')
        .in('homework_id', homeworkIds);

      submittedIds = new Set((submissions || []).map(s => s.homework_id));
    }

    // 3. Get unviewed documents for tomorrow's subjects
    let docPreps = [];
    if (tomorrowSubjectIds.length > 0) {
      const { data: docs } = await supabaseAdmin
        .from('documents')
        .select('id, title, subject_id, subjects:subject_id(name), document_type')
        .eq('class_id', profile.class_id)
        .in('subject_id', tomorrowSubjectIds)
        .order('created_at', { ascending: false })
        .limit(5);

      // Check which docs student has viewed
      if (docs && docs.length > 0) {
        const { data: views } = await supabaseAdmin
          .from('document_views')
          .select('document_id')
          .eq('student_id', studentId)
          .in('document_id', docs.map(d => d.id));

        const viewedIds = new Set((views || []).map(v => v.document_id));
        docPreps = docs.filter(d => !viewedIds.has(d.id)).map(d => ({
          type: 'document',
          subject: d.subjects?.name || 'Document',
          title: d.title,
          priority: 'low',
          documentType: d.document_type
        }));
      }
    }

    // 4. Build preparations list (priority sorted, capped at 3)
    const preparations = [];

    // Add homework — prioritize by due date and whether it matches tomorrow's subjects
    const pendingHw = (homework || []).filter(h => !submittedIds.has(h.id));
    const tomorrowDateStr = targetDate;

    pendingHw.sort((a, b) => {
      // Overdue first
      const aOverdue = a.due_date < now.toISOString().split('T')[0];
      const bOverdue = b.due_date < now.toISOString().split('T')[0];
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      // Due tomorrow next
      const aTomorrow = a.due_date === tomorrowDateStr;
      const bTomorrow = b.due_date === tomorrowDateStr;
      if (aTomorrow && !bTomorrow) return -1;
      if (!aTomorrow && bTomorrow) return 1;
      // Matching subject next
      const aMatch = tomorrowSubjectIds.includes(a.subject_id);
      const bMatch = tomorrowSubjectIds.includes(b.subject_id);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });

    for (const hw of pendingHw) {
      const isOverdue = hw.due_date < now.toISOString().split('T')[0];
      const isDueTomorrow = hw.due_date === tomorrowDateStr;
      preparations.push({
        type: 'homework',
        subject: hw.subjects?.name || 'Devoir',
        title: hw.title,
        dueDate: hw.due_date,
        priority: isOverdue ? 'high' : isDueTomorrow ? 'medium' : 'low',
        homeworkType: hw.type
      });
    }

    // Add document preps
    preparations.push(...docPreps);

    // Cap at 3 items
    const topPreps = preparations.slice(0, 3);

    // 5. Generate smart message
    let message = '';
    const sessionCount = sessions.length;
    const hwCount = topPreps.filter(p => p.type === 'homework').length;
    const highPriority = topPreps.filter(p => p.priority === 'high').length;

    if (sessionCount === 0) {
      message = 'Pas de cours demain ! Profite pour réviser ou te reposer.';
    } else if (highPriority > 0) {
      message = `Attention : ${highPriority} devoir${highPriority > 1 ? 's' : ''} en retard à rattraper !`;
    } else if (hwCount > 0) {
      message = `Tu as ${sessionCount} séance${sessionCount > 1 ? 's' : ''} demain. Prépare ${hwCount === 1 ? 'ton devoir' : 'tes devoirs'} ce soir.`;
    } else {
      message = `Tu as ${sessionCount} séance${sessionCount > 1 ? 's' : ''} demain. Tu es bien préparé !`;
    }

    res.json({
      day: targetDay,
      dayLabel: dayLabels[targetDay],
      date: targetDate,
      sessions,
      preparations: topPreps,
      message
    });
  } catch (error) {
    console.error('Erreur tomorrow:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
