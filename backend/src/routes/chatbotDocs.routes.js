/**
 * Base de connaissances du chatbot WhatsApp — administration.
 *
 * L'école importe ici ses documents généraux en PDF (liste des fournitures par
 * niveau, règlement intérieur, calendrier…). Le backend extrait le texte,
 * découpe le document PAR NIVEAU et stocke les sections : le chatbot peut alors
 * répondre à un parent en régénérant un PDF pour le seul niveau demandé.
 *
 * Monté sur /api/admin/chatbot-docs.
 */

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { memoryUpload, uploadBuffer, removeObject, BUCKET_PUBLIC } from '../utils/storage.js';
import { analyzeDocument, getSectionById } from '../services/whatsapp/chatbot/knowledge.js';
import { generateSectionPdf } from '../services/whatsapp/chatbot/suppliesPdf.js';
import { invalidatePublicChatbotCache } from '../services/whatsapp/chatbot/publicChatbot.js';

const router = express.Router();
const pdfUpload = memoryUpload(20);

router.use(authenticate);
router.use(authorize('admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'));

const getSchoolId = (req) => (req.user.role === 'super_admin' ? null : req.user.school_id || null);

/** Vérifie que le document appartient bien à l'école de l'utilisateur. */
async function loadOwnedDocument(documentId, schoolId) {
  const { data } = await supabaseAdmin
    .from('chatbot_documents')
    .select('*')
    .eq('id', documentId)
    .eq('school_id', schoolId)
    .maybeSingle();
  return data || null;
}

// ==================== RÉGLAGES (déclarés avant /:id) ====================

/**
 * Message d'avertissement quand l'année écrite dans le PDF ne correspond pas à
 * celle enregistrée sur le document — c'est elle qui sera imprimée sur le PDF
 * envoyé aux parents.
 */
const yearMismatchWarning = (result, saved) => {
  const detected = result?.detected_academic_year;
  if (!detected || !saved) return null;
  const digits = (v) => String(v).replace(/\D/g, '');
  if (digits(detected) === digits(saved)) return null;
  return `Le document mentionne l'année ${detected} alors que ${saved} est enregistrée : `
    + `c'est ${saved} qui sera imprimée sur le PDF envoyé aux parents. Corrigez l'année si besoin.`;
};

// GET /settings — état du chatbot « visiteur » (réponses aux numéros inconnus)
router.get('/settings', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { data } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .select('public_chatbot_enabled')
      .eq('school_id', schoolId)
      .maybeSingle();
    res.json({ public_chatbot_enabled: !!data?.public_chatbot_enabled, has_session: !!data });
  } catch (e) {
    console.error('GET chatbot settings:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// PATCH /settings — activer/désactiver les réponses aux numéros inconnus
router.patch('/settings', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { public_chatbot_enabled } = req.body || {};
    if (typeof public_chatbot_enabled !== 'boolean') {
      return res.status(400).json({ error: 'public_chatbot_enabled (booléen) requis' });
    }

    const { data, error } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .update({ public_chatbot_enabled, updated_at: new Date().toISOString() })
      .eq('school_id', schoolId)
      .select('public_chatbot_enabled')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return res.status(400).json({
        error: "Aucune session WhatsApp pour cette école : connectez d'abord le numéro WhatsApp.",
      });
    }

    invalidatePublicChatbotCache(schoolId);
    res.json({ public_chatbot_enabled: data.public_chatbot_enabled });
  } catch (e) {
    console.error('PATCH chatbot settings:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// ==================== SECTIONS (déclarées avant /:id) ====================

// GET /sections/:id/pdf — aperçu admin du PDF exactement tel que le parent le reçoit
router.get('/sections/:id/pdf', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const section = await getSectionById(req.params.id);
    if (!section || section.school_id !== schoolId) {
      return res.status(404).json({ error: 'Section introuvable' });
    }

    const { buffer, fileName } = await generateSectionPdf({
      schoolId,
      section,
      title: 'Fournitures scolaires',
      academicYear: section.document?.academic_year || null,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  } catch (e) {
    console.error('GET chatbot section pdf:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// PATCH /sections/:id — corriger un niveau (libellé, code, alias, contenu)
router.patch('/sections/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { level_code, level_label, aliases, content } = req.body || {};

    const update = { updated_at: new Date().toISOString() };
    if (level_code !== undefined) update.level_code = level_code || null;
    if (level_label !== undefined) update.level_label = String(level_label).trim() || 'Tous les niveaux';
    if (Array.isArray(aliases)) update.aliases = aliases.map((a) => String(a).trim()).filter(Boolean);
    if (content !== undefined) update.content = content;

    const { data, error } = await supabaseAdmin
      .from('chatbot_document_sections')
      .update(update)
      .eq('id', req.params.id)
      .eq('school_id', schoolId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Section introuvable' });
    res.json({ section: data });
  } catch (e) {
    console.error('PATCH chatbot section:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// DELETE /sections/:id — retirer un niveau du document
router.delete('/sections/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { error } = await supabaseAdmin
      .from('chatbot_document_sections')
      .delete()
      .eq('id', req.params.id)
      .eq('school_id', schoolId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE chatbot section:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// ==================== DOCUMENTS ====================

// GET / — liste des documents importés (+ nombre de niveaux détectés)
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let query = supabaseAdmin
      .from('chatbot_documents')
      .select('id, title, category, academic_year, description, file_name, file_url, status, error_message, is_active, created_at, updated_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    if (req.query.category) query = query.eq('category', req.query.category);

    const { data: documents, error } = await query;
    if (error) throw error;

    const ids = (documents || []).map((d) => d.id);
    let sections = [];
    if (ids.length > 0) {
      const { data } = await supabaseAdmin
        .from('chatbot_document_sections')
        .select('id, document_id, level_code, level_label, sort_order, content')
        .in('document_id', ids)
        .order('sort_order', { ascending: true });
      sections = data || [];
    }

    res.json({
      documents: (documents || []).map((d) => {
        const docSections = sections.filter((s) => s.document_id === d.id);
        return {
          ...d,
          sections_count: docSections.length,
          levels: docSections.map((s) => s.level_label),
        };
      }),
    });
  } catch (e) {
    console.error('GET chatbot docs:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// GET /:id — document + sections détaillées
router.get('/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const document = await loadOwnedDocument(req.params.id, schoolId);
    if (!document) return res.status(404).json({ error: 'Document introuvable' });

    const { data: sections } = await supabaseAdmin
      .from('chatbot_document_sections')
      .select('id, level_code, level_label, aliases, content, sort_order')
      .eq('document_id', document.id)
      .order('sort_order', { ascending: true });

    // source_text peut peser plusieurs centaines de Ko : inutile côté liste
    const { source_text, ...rest } = document;
    res.json({ document: { ...rest, has_text: !!source_text }, sections: sections || [] });
  } catch (e) {
    console.error('GET chatbot doc:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// POST / — import d'un PDF puis analyse (extraction + découpage par niveau)
router.post('/', pdfUpload.single('file'), async (req, res) => {
  let documentId = null;
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'École introuvable pour cet utilisateur' });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Seuls les fichiers PDF sont acceptés' });
    }

    const { title, category, academic_year, description } = req.body || {};

    const { path: storagePath, publicUrl } = await uploadBuffer({
      bucket: BUCKET_PUBLIC,
      folder: `chatbot-docs/${schoolId}`,
      file: req.file,
      prefix: 'doc',
    });

    const { data: document, error } = await supabaseAdmin
      .from('chatbot_documents')
      .insert({
        school_id: schoolId,
        title: (title || req.file.originalname || 'Document').trim(),
        category: category || 'fournitures',
        academic_year: academic_year || null,
        description: description || null,
        file_name: req.file.originalname,
        file_url: publicUrl,
        storage_path: storagePath,
        status: 'processing',
        uploaded_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;
    documentId = document.id;

    // Analyse synchrone : l'admin voit immédiatement les niveaux détectés et
    // peut les corriger. Le découpage LLM prend quelques secondes.
    const result = await analyzeDocument({ documentId, schoolId, buffer: req.file.buffer });

    const { data: sections } = await supabaseAdmin
      .from('chatbot_document_sections')
      .select('id, level_code, level_label, aliases, content, sort_order')
      .eq('document_id', documentId)
      .order('sort_order', { ascending: true });

    res.status(201).json({
      document: {
        ...document,
        status: result.status,
        error_message: result.error || null,
        academic_year: result.academic_year ?? document.academic_year,
      },
      sections: sections || [],
      warning: result.error || yearMismatchWarning(result, document.academic_year),
    });
  } catch (e) {
    console.error('POST chatbot doc:', e);
    if (documentId) {
      await supabaseAdmin
        .from('chatbot_documents')
        .update({ status: 'error', error_message: e.message })
        .eq('id', documentId);
    }
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// POST /:id/reanalyze — relancer le découpage (après correction ou nouvelle clé IA)
router.post('/:id/reanalyze', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const document = await loadOwnedDocument(req.params.id, schoolId);
    if (!document) return res.status(404).json({ error: 'Document introuvable' });

    const result = await analyzeDocument({ documentId: document.id, schoolId });
    const { data: sections } = await supabaseAdmin
      .from('chatbot_document_sections')
      .select('id, level_code, level_label, aliases, content, sort_order')
      .eq('document_id', document.id)
      .order('sort_order', { ascending: true });

    res.json({
      status: result.status,
      warning: result.error || yearMismatchWarning(result, document.academic_year),
      sections: sections || [],
    });
  } catch (e) {
    console.error('POST chatbot doc reanalyze:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// PATCH /:id — métadonnées (titre, catégorie, année, activation)
router.patch('/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { title, category, academic_year, description, is_active } = req.body || {};

    const update = { updated_at: new Date().toISOString() };
    if (title !== undefined) update.title = String(title).trim();
    if (category !== undefined) update.category = category;
    if (academic_year !== undefined) update.academic_year = academic_year || null;
    if (description !== undefined) update.description = description || null;
    if (is_active !== undefined) update.is_active = !!is_active;

    const { data, error } = await supabaseAdmin
      .from('chatbot_documents')
      .update(update)
      .eq('id', req.params.id)
      .eq('school_id', schoolId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Document introuvable' });
    res.json({ document: data });
  } catch (e) {
    console.error('PATCH chatbot doc:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// DELETE /:id — supprime le document, ses sections (cascade) et le PDF source
router.delete('/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const document = await loadOwnedDocument(req.params.id, schoolId);
    if (!document) return res.status(404).json({ error: 'Document introuvable' });

    if (document.storage_path) await removeObject(BUCKET_PUBLIC, document.storage_path);
    const { error } = await supabaseAdmin
      .from('chatbot_documents')
      .delete()
      .eq('id', document.id)
      .eq('school_id', schoolId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE chatbot doc:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

export default router;
