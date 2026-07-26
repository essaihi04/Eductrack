/**
 * Vitrine de l'école — administration.
 *
 * Deux ressources :
 *   - /profile : informations générales (présentation, taux de réussite, atouts,
 *     langues, filières, contacts et réseaux sociaux)
 *   - /items   : rubriques illustrées (cantine, sport, salles, équipements,
 *     trophées, activités, élèves méritants) — une image par élément
 *
 * Le chatbot WhatsApp s'en sert pour répondre aux parents ET aux visiteurs
 * (voir services/whatsapp/chatbot/showcase.js).
 *
 * Monté sur /api/admin/school-showcase.
 */

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { memoryUpload, uploadBuffer, removeObject, BUCKET_PUBLIC } from '../utils/storage.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'));

const getSchoolId = (req) => (req.user.role === 'super_admin' ? null : req.user.school_id || null);

const imageUpload = memoryUpload(8);

const CATEGORIES = [
  'cantine', 'sport', 'salle', 'equipement', 'trophee',
  'activite', 'filiere', 'eleve_merite', 'transport', 'autre',
];

/** Normalise une liste envoyée en JSON ou en texte (une entrée par ligne). */
function toList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 40);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return toList(parsed);
    } catch (_) { /* pas du JSON : on découpe par lignes */ }
    return trimmed.split(/[\n;]+/).map((v) => v.trim()).filter(Boolean).slice(0, 40);
  }
  return [];
}

/** Taux de réussite : accepte "87", "87,5", "87.5 %" ; refuse hors 0-100. */
function parseRate(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseFloat(String(value).replace(',', '.').replace('%', '').trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

// ==================== PROFIL ====================

// GET /profile — informations générales de l'école
router.get('/profile', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'Aucune école associée à ce compte' });

    const { data, error } = await supabaseAdmin
      .from('school_profile')
      .select('*')
      .eq('school_id', schoolId)
      .maybeSingle();
    if (error) throw error;

    res.json({ profile: data || null });
  } catch (e) {
    console.error('GET school profile:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// PUT /profile — création / mise à jour des informations générales
router.put('/profile', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'Aucune école associée à ce compte' });

    const b = req.body || {};
    const rate = parseRate(b.success_rate);
    if (b.success_rate !== undefined && b.success_rate !== '' && rate === null) {
      return res.status(400).json({ error: 'Taux de réussite invalide (attendu : un nombre entre 0 et 100)' });
    }

    const payload = {
      school_id: schoolId,
      about: b.about?.trim() || null,
      success_rate: rate,
      success_rate_year: b.success_rate_year?.trim() || null,
      success_rate_note: b.success_rate_note?.trim() || null,
      advantages: toList(b.advantages),
      languages: toList(b.languages),
      filieres: toList(b.filieres),
      contact_phone: b.contact_phone?.trim() || null,
      contact_whatsapp: b.contact_whatsapp?.trim() || null,
      contact_email: b.contact_email?.trim() || null,
      website_url: b.website_url?.trim() || null,
      facebook_url: b.facebook_url?.trim() || null,
      instagram_url: b.instagram_url?.trim() || null,
      tiktok_url: b.tiktok_url?.trim() || null,
      youtube_url: b.youtube_url?.trim() || null,
      maps_url: b.maps_url?.trim() || null,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('school_profile')
      .upsert(payload, { onConflict: 'school_id' })
      .select()
      .single();
    if (error) throw error;

    res.json({ profile: data });
  } catch (e) {
    console.error('PUT school profile:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// ==================== RUBRIQUES ILLUSTRÉES ====================

// GET /items — toutes les rubriques de l'école
router.get('/items', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'Aucune école associée à ce compte' });

    const { data, error } = await supabaseAdmin
      .from('school_showcase_items')
      .select('*')
      .eq('school_id', schoolId)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw error;

    res.json({ items: data || [] });
  } catch (e) {
    console.error('GET showcase items:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// POST /items — nouvel élément (multipart : champ `image` optionnel)
router.post('/items', imageUpload.single('image'), async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'Aucune école associée à ce compte' });

    const b = req.body || {};
    const category = CATEGORIES.includes(b.category) ? b.category : null;
    const title = b.title?.trim();
    if (!category) return res.status(400).json({ error: 'Rubrique invalide' });
    if (!title) return res.status(400).json({ error: 'Le titre est obligatoire' });

    let imageUrl = null;
    let storagePath = null;
    if (req.file) {
      if (!/^image\//.test(req.file.mimetype || '')) {
        return res.status(400).json({ error: 'Le fichier doit être une image' });
      }
      const up = await uploadBuffer({
        bucket: BUCKET_PUBLIC,
        folder: `showcase/${schoolId}/${category}`,
        file: req.file,
        prefix: category,
      });
      imageUrl = up.publicUrl;
      storagePath = up.path;
    }

    // Élève méritant : nom, note, classe et année vivent dans `extra`.
    const extra = {};
    for (const key of ['student_name', 'grade', 'class_label', 'year']) {
      if (b[key]?.trim()) extra[key] = b[key].trim();
    }

    // Données d'un mineur : jamais diffusées aux numéros inconnus sans un choix
    // explicite de l'école (accord des parents à recueillir en amont).
    const isPublic = category === 'eleve_merite'
      ? b.is_public === 'true' || b.is_public === true
      : !(b.is_public === 'false' || b.is_public === false);

    const { data, error } = await supabaseAdmin
      .from('school_showcase_items')
      .insert({
        school_id: schoolId,
        category,
        title,
        description: b.description?.trim() || null,
        image_url: imageUrl,
        storage_path: storagePath,
        extra,
        sort_order: parseInt(b.sort_order, 10) || 0,
        is_published: !(b.is_published === 'false' || b.is_published === false),
        is_public: isPublic,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ item: data });
  } catch (e) {
    console.error('POST showcase item:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// PATCH /items/:id — modifier un élément (image remplaçable)
router.patch('/items/:id', imageUpload.single('image'), async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: existing } = await supabaseAdmin
      .from('school_showcase_items')
      .select('*')
      .eq('id', req.params.id)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Élément introuvable' });

    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };

    if (b.title !== undefined) {
      const title = b.title.trim();
      if (!title) return res.status(400).json({ error: 'Le titre est obligatoire' });
      update.title = title;
    }
    if (b.description !== undefined) update.description = b.description.trim() || null;
    if (b.category !== undefined) {
      if (!CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'Rubrique invalide' });
      update.category = b.category;
    }
    if (b.sort_order !== undefined) update.sort_order = parseInt(b.sort_order, 10) || 0;
    if (b.is_published !== undefined) update.is_published = !(b.is_published === 'false' || b.is_published === false);
    if (b.is_public !== undefined) update.is_public = b.is_public === 'true' || b.is_public === true;

    const extraKeys = ['student_name', 'grade', 'class_label', 'year'];
    if (extraKeys.some((k) => b[k] !== undefined)) {
      const extra = { ...(existing.extra || {}) };
      for (const key of extraKeys) {
        if (b[key] === undefined) continue;
        const v = b[key].trim();
        if (v) extra[key] = v; else delete extra[key];
      }
      update.extra = extra;
    }

    if (req.file) {
      if (!/^image\//.test(req.file.mimetype || '')) {
        return res.status(400).json({ error: 'Le fichier doit être une image' });
      }
      const up = await uploadBuffer({
        bucket: BUCKET_PUBLIC,
        folder: `showcase/${schoolId}/${update.category || existing.category}`,
        file: req.file,
        prefix: update.category || existing.category,
      });
      update.image_url = up.publicUrl;
      update.storage_path = up.path;
      // L'ancienne image ne sert plus à rien : on libère l'espace de stockage.
      if (existing.storage_path) await removeObject(BUCKET_PUBLIC, existing.storage_path);
    }

    const { data, error } = await supabaseAdmin
      .from('school_showcase_items')
      .update(update)
      .eq('id', req.params.id)
      .eq('school_id', schoolId)
      .select()
      .single();
    if (error) throw error;

    res.json({ item: data });
  } catch (e) {
    console.error('PATCH showcase item:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// DELETE /items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data: existing } = await supabaseAdmin
      .from('school_showcase_items')
      .select('id, storage_path')
      .eq('id', req.params.id)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Élément introuvable' });

    if (existing.storage_path) await removeObject(BUCKET_PUBLIC, existing.storage_path);
    const { error } = await supabaseAdmin
      .from('school_showcase_items')
      .delete()
      .eq('id', req.params.id)
      .eq('school_id', schoolId);
    if (error) throw error;

    res.json({ success: true });
  } catch (e) {
    console.error('DELETE showcase item:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

export default router;
