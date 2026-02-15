import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Lister les absences
router.get('/', authorize('admin', 'school_admin', 'teacher', 'student'), async (req, res) => {
  try {
    const { studentId, startDate, endDate } = req.query;
    let query = supabase
      .from('attendance')
      .select('*, student:profiles!attendance_student_id_fkey(first_name, last_name), teacher:profiles!attendance_teacher_id_fkey(first_name, last_name)')
      .order('date', { ascending: false });

    // Filtrer par élève si spécifié
    if (studentId) {
      query = query.eq('student_id', studentId);
    } else if (req.user.role === 'student') {
      // Les élèves ne voient que leurs propres absences
      query = query.eq('student_id', req.user.id);
    }

    // Filtrer par dates
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Marquer une absence (Prof, Admin)
router.post('/', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { studentId, date, status, reason } = req.body;

    const { data, error } = await supabase
      .from('attendance')
      .insert({
        student_id: studentId,
        teacher_id: req.user.id,
        date,
        status, // 'present', 'absent', 'late', 'excused'
        reason
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

// Mettre à jour une absence
router.put('/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const { data, error } = await supabase
      .from('attendance')
      .update({ status, reason })
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

// Supprimer une absence
router.delete('/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Absence supprimée' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Statistiques d'assiduité
router.get('/stats/:studentId', authorize('admin', 'school_admin', 'teacher', 'student'), async (req, res) => {
  try {
    const { studentId } = req.params;

    // Vérifier les permissions
    if (req.user.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { data, error } = await supabase
      .from('attendance')
      .select('status')
      .eq('student_id', studentId);

    if (error) throw error;

    const stats = {
      total: data.length,
      present: data.filter(a => a.status === 'present').length,
      absent: data.filter(a => a.status === 'absent').length,
      late: data.filter(a => a.status === 'late').length,
      excused: data.filter(a => a.status === 'excused').length
    };

    stats.attendanceRate = stats.total > 0 
      ? ((stats.present / stats.total) * 100).toFixed(2) 
      : 0;

    res.json(stats);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
