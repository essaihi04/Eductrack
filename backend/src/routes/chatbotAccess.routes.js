/**
 * Administration des données communiquées par le chatbot WhatsApp.
 *
 *  - GET/PUT /capabilities : inventaire des données accessibles aux parents et
 *    interrupteur pour chacune. Le référentiel vient du code
 *    (services/whatsapp/chatbot/capabilities.js), l'état vient de la base.
 *  - CRUD /entries : contenus ajoutés par l'école (texte, image, PDF), exposés
 *    en menu, par mots-clés et/ou comme source de connaissance pour l'IA.
 *
 * Monté sur /api/admin/chatbot-access.
 */
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { memoryUpload, uploadBuffer, removeObject, BUCKET_PUBLIC } from '../utils/storage.js';
import {
  CAPABILITIES, CAPABILITY_IDS, invalidateCapabilityCache, isMissingTableError,
} from '../services/whatsapp/chatbot/capabilities.js';
import { invalidateCustomEntriesCache } from '../services/whatsapp/chatbot/customEntries.js';

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin', 'school_admin'));

const mediaUpload = memoryUpload(15);
const VALID_IDS = new Set(CAPABILITY_IDS);
const VALID_MENUS = new Set(['main', 'pedagogy', 'finance', 'schoollife', 'account']);

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.query.school_id || req.body.school_id || null;
  return req.user.school_id || null;
};

const requireSchool = (req, res) => {
  const schoolId = getSchoolId(req);
  if (!schoolId) {
    res.status(400).json({ error: 'Aucune école associée à ce compte' });
    return null;
  }
  return schoolId;
};

/** Message clair quand la migration SQL n'a pas encore été exécutée. */
const isMissingTable = isMissingTableError;
const migrationHint = {
  error: 'Tables absentes : exécutez ADD_CHATBOT_ACCESS_CONTROL.sql dans Supabase.',
};

// ── Inventaire et interrupteurs ───────────────────────────────────────────

router.get('/capabilities', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { data, error } = await supabaseAdmin
      .from('chatbot_capabilities')
      .select('capability_id, is_enabled, updated_at')
      .eq('school_id', schoolId);

    if (error && !isMissingTable(error)) throw error;

    const state = new Map((data || []).map((r) => [r.capability_id, r]));

    res.json({
      migration_needed: Boolean(error && isMissingTable(error)),
      capabilities: CAPABILITIES.map((cap) => ({
        ...cap,
        // Absence de ligne = activé : une école qui n'a rien réglé garde le
        // comportement actuel du chatbot.
        is_enabled: state.get(cap.id)?.is_enabled ?? true,
        updated_at: state.get(cap.id)?.updated_at || null,
      })),
    });
  } catch (error) {
    console.error('Erreur GET capabilities:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.put('/capabilities', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { changes } = req.body; // [{ capability_id, is_enabled }]
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'changes doit être un tableau non vide' });
    }

    const unknown = changes.map((c) => c.capability_id).filter((id) => !VALID_IDS.has(id));
    if (unknown.length > 0) {
      return res.status(400).json({ error: `Capacités inconnues : ${unknown.join(', ')}` });
    }

    const rows = changes.map((c) => ({
      school_id: schoolId,
      capability_id: c.capability_id,
      is_enabled: c.is_enabled !== false,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from('chatbot_capabilities')
      .upsert(rows, { onConflict: 'school_id,capability_id' });

    if (error) {
      if (isMissingTable(error)) return res.status(400).json(migrationHint);
      throw error;
    }

    // Sans invalidation, le changement mettrait jusqu'à une minute à s'appliquer.
    invalidateCapabilityCache(schoolId);
    res.json({ updated: rows.length });
  } catch (error) {
    console.error('Erreur PUT capabilities:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ── Contenus ajoutés par l'école ──────────────────────────────────────────

router.get('/entries', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { data, error } = await supabaseAdmin
      .from('chatbot_custom_entries')
      .select('*')
      .eq('school_id', schoolId)
      .order('menu_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTable(error)) return res.json([]);
      throw error;
    }
    res.json(data || []);
  } catch (error) {
    console.error('Erreur GET entries:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

/** Champs communs à la création et à la mise à jour, validés. */
function parseEntryBody(body) {
  const keywords = Array.isArray(body.keywords)
    ? body.keywords
    : String(body.keywords || '').split(',');

  const menuId = VALID_MENUS.has(body.menu_id) ? body.menu_id : 'schoollife';
  const asBool = (v, fallback) => (v === undefined ? fallback : v === true || v === 'true');

  return {
    title: String(body.title || '').trim().slice(0, 120),
    body_text: body.body_text ? String(body.body_text).trim().slice(0, 4000) : null,
    menu_id: menuId,
    emoji: String(body.emoji || '📌').slice(0, 8),
    show_in_menu: asBool(body.show_in_menu, true),
    use_for_ai: asBool(body.use_for_ai, false),
    keywords: keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean).slice(0, 20),
    is_active: asBool(body.is_active, true),
    sort_order: Number(body.sort_order) || 0,
  };
}

router.post('/entries', mediaUpload.single('file'), async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const fields = parseEntryBody(req.body);
    if (!fields.title) return res.status(400).json({ error: 'Le titre est obligatoire' });

    let media = {};
    if (req.file) {
      const isImage = (req.file.mimetype || '').startsWith('image/');
      const { publicUrl, path } = await uploadBuffer({
        bucket: BUCKET_PUBLIC, folder: 'chatbot/entries', file: req.file, prefix: 'entry',
      });
      media = {
        media_type: isImage ? 'image' : 'document',
        media_url: publicUrl,
        storage_path: path,
        file_name: req.file.originalname,
      };
    }

    if (!fields.body_text && !media.media_url) {
      return res.status(400).json({ error: 'Ajoutez un texte ou un fichier' });
    }

    const { data, error } = await supabaseAdmin
      .from('chatbot_custom_entries')
      .insert({ ...fields, ...media, school_id: schoolId, created_by: req.user.id })
      .select()
      .single();

    if (error) {
      if (isMissingTable(error)) return res.status(400).json(migrationHint);
      throw error;
    }

    invalidateCustomEntriesCache(schoolId);
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur POST entry:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.put('/entries/:id', mediaUpload.single('file'), async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('chatbot_custom_entries')
      .select('*')
      .eq('id', req.params.id)
      .eq('school_id', schoolId)
      .single();
    if (findErr || !existing) return res.status(404).json({ error: 'Contenu introuvable' });

    const fields = parseEntryBody({ ...existing, ...req.body });
    let media = {};

    if (req.file) {
      const isImage = (req.file.mimetype || '').startsWith('image/');
      const { publicUrl, path } = await uploadBuffer({
        bucket: BUCKET_PUBLIC, folder: 'chatbot/entries', file: req.file, prefix: 'entry',
      });
      media = {
        media_type: isImage ? 'image' : 'document',
        media_url: publicUrl,
        storage_path: path,
        file_name: req.file.originalname,
      };
      // L'ancien fichier n'est plus référencé : on le supprime du bucket.
      if (existing.storage_path) {
        await removeObject(BUCKET_PUBLIC, existing.storage_path).catch(() => {});
      }
    } else if (req.body.remove_media === 'true') {
      media = { media_type: null, media_url: null, storage_path: null, file_name: null };
      if (existing.storage_path) {
        await removeObject(BUCKET_PUBLIC, existing.storage_path).catch(() => {});
      }
    }

    const nextText = media.media_url === null ? fields.body_text : (fields.body_text ?? existing.body_text);
    const nextMediaUrl = 'media_url' in media ? media.media_url : existing.media_url;
    if (!nextText && !nextMediaUrl) {
      return res.status(400).json({ error: 'Le contenu doit garder un texte ou un fichier' });
    }

    const { data, error } = await supabaseAdmin
      .from('chatbot_custom_entries')
      .update({ ...fields, ...media, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('school_id', schoolId)
      .select()
      .single();
    if (error) throw error;

    invalidateCustomEntriesCache(schoolId);
    res.json(data);
  } catch (error) {
    console.error('Erreur PUT entry:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.delete('/entries/:id', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { data: existing } = await supabaseAdmin
      .from('chatbot_custom_entries')
      .select('storage_path')
      .eq('id', req.params.id)
      .eq('school_id', schoolId)
      .single();

    const { error } = await supabaseAdmin
      .from('chatbot_custom_entries')
      .delete()
      .eq('id', req.params.id)
      .eq('school_id', schoolId);
    if (error) throw error;

    if (existing?.storage_path) {
      await removeObject(BUCKET_PUBLIC, existing.storage_path).catch(() => {});
    }

    invalidateCustomEntriesCache(schoolId);
    res.json({ message: 'Contenu supprimé' });
  } catch (error) {
    console.error('Erreur DELETE entry:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

export default router;
