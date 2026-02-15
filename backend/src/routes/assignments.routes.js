import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Lister les devoirs
router.get('/', authenticate, async (req, res) => {
  try {
    const { classId, subjectId } = req.query;
    let query = supabase
      .from('assignments')
      .select('*, subject:subjects(*), class:classes(*), teacher:profiles!assignments_teacher_id_fkey(first_name, last_name)')
      .order('due_date', { ascending: false });

    if (classId) query = query.eq('class_id', classId);
    if (subjectId) query = query.eq('subject_id', subjectId);

    // Les élèves ne voient que les devoirs de leur classe
    if (req.user.role === 'student' && req.user.class_id) {
      query = query.eq('class_id', req.user.class_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Créer un devoir (Prof, Admin)
router.post('/', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { title, description, classId, subjectId, dueDate, maxScore } = req.body;

    const { data, error } = await supabase
      .from('assignments')
      .insert({
        title,
        description,
        class_id: classId,
        subject_id: subjectId,
        teacher_id: req.user.id,
        due_date: dueDate,
        max_score: maxScore
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

// Mettre à jour un devoir
router.put('/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, dueDate, maxScore } = req.body;

    const { data, error } = await supabase
      .from('assignments')
      .update({ title, description, due_date: dueDate, max_score: maxScore })
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

// Supprimer un devoir
router.delete('/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Devoir supprimé' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Soumettre un devoir (Élève)
router.post('/:id/submit', authorize('student'), async (req, res) => {
  try {
    const { id } = req.params;
    const { content, fileUrl } = req.body;

    const { data, error } = await supabase
      .from('submissions')
      .insert({
        assignment_id: id,
        student_id: req.user.id,
        content,
        file_url: fileUrl,
        submitted_at: new Date().toISOString()
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

// Noter une soumission (Prof, Admin)
router.put('/submissions/:id/grade', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { score, feedback } = req.body;

    const { data, error } = await supabase
      .from('submissions')
      .update({
        score,
        feedback,
        graded_at: new Date().toISOString()
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

// Récupérer les soumissions d'un devoir
router.get('/:id/submissions', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('submissions')
      .select('*, student:profiles(first_name, last_name, email)')
      .eq('assignment_id', id)
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
