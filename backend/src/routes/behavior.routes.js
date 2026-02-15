import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Lister les évaluations de comportement
router.get('/', authorize('admin', 'school_admin', 'teacher', 'student'), async (req, res) => {
  try {
    const { studentId } = req.query;
    let query = supabase
      .from('behavior_records')
      .select('*, student:profiles!behavior_records_student_id_fkey(first_name, last_name), teacher:profiles!behavior_records_teacher_id_fkey(first_name, last_name)')
      .order('date', { ascending: false });

    if (studentId) {
      query = query.eq('student_id', studentId);
    } else if (req.user.role === 'student') {
      query = query.eq('student_id', req.user.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ajouter une évaluation de comportement (Prof, Admin)
router.post('/', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { studentId, type, description, severity } = req.body;

    const { data, error } = await supabase
      .from('behavior_records')
      .insert({
        student_id: studentId,
        teacher_id: req.user.id,
        type, // 'positive', 'negative', 'neutral'
        description,
        severity, // 1-5
        date: new Date().toISOString()
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

// Mettre à jour une évaluation
router.put('/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { type, description, severity } = req.body;

    const { data, error } = await supabase
      .from('behavior_records')
      .update({ type, description, severity })
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

// Supprimer une évaluation
router.delete('/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('behavior_records')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Évaluation supprimée' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
