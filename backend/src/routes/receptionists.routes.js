// Gestion des numéros « réceptionniste » (chatbot statistiques école) par l'admin.
//
// Un réceptionniste n'est PAS un compte applicatif : juste un numéro WhatsApp
// autorisé à dialoguer avec le chatbot IA « statistiques de l'école ». Stocké
// dans la table school_receptionists (cf. migrations/create_school_receptionists.sql).
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireFullAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireFullAdmin);

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.body.school_id || req.query.school_id || null;
  return req.user.school_id || null;
};

/** Normalise un numéro en format E.164 (+212…). */
function normalizePhone(raw) {
  let p = String(raw || '')
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace(/\s+/g, '')
    .replace(/[()\-.]/g, '');
  if (!p) return '';
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

// GET — liste des réceptionnistes de l'école
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin
      .from('school_receptionists')
      .select('id, school_id, phone_e164, name, active, created_at')
      .order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ receptionists: data || [] });
  } catch (error) {
    console.error('Erreur fetch receptionists:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — créer un réceptionniste
router.post('/', async (req, res) => {
  try {
    const { name, phone } = req.body;
    const phoneE164 = normalizePhone(phone);
    if (!phoneE164 || phoneE164.length < 8) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide' });
    }
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'school_id requis' });

    const { data, error } = await supabaseAdmin
      .from('school_receptionists')
      .insert({ school_id: schoolId, phone_e164: phoneE164, name: name || null, active: true })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ce numéro est déjà enregistré pour cette école' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur create receptionist:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// PUT — modifier (nom, numéro, actif)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, active } = req.body;
    const schoolId = getSchoolId(req);

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name || null;
    if (active !== undefined) updates.active = !!active;
    if (phone !== undefined) {
      const phoneE164 = normalizePhone(phone);
      if (!phoneE164 || phoneE164.length < 8) {
        return res.status(400).json({ error: 'Numéro de téléphone invalide' });
      }
      updates.phone_e164 = phoneE164;
    }

    let q = supabaseAdmin.from('school_receptionists').update(updates).eq('id', id);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q.select().single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ce numéro est déjà enregistré pour cette école' });
      }
      throw error;
    }
    res.json(data);
  } catch (error) {
    console.error('Erreur update receptionist:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — supprimer
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin.from('school_receptionists').delete().eq('id', id);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { error } = await q;
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur delete receptionist:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
