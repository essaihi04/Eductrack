/**
 * Assistant conversationnel intégré à l'espace parent.
 *
 * Même cerveau que le chatbot WhatsApp — mêmes réponses (answers.js), même IA
 * (ai.js), mêmes interrupteurs d'administration (capabilities.js), mêmes
 * contenus ajoutés par l'école (customEntries.js) — mais une interface qui
 * n'est plus limitée par WhatsApp :
 *
 *   - les choix sont de VRAIS boutons, pas des numéros à recopier ;
 *   - les réponses sont structurées (blocs) au lieu d'un pavé de texte ;
 *   - les documents arrivent en pièce jointe cliquable ;
 *   - des suggestions contextuelles s'affichent après chaque réponse.
 *
 * Monté sur /api/parent/assistant.
 */
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import * as A from '../services/whatsapp/chatbot/answers.js';
import { answerWithAI } from '../services/whatsapp/chatbot/ai.js';
import {
  CAPABILITIES, isCapabilityEnabled, disabledCapabilities,
} from '../services/whatsapp/chatbot/capabilities.js';
import {
  loadCustomEntries, findCustomEntry, matchCustomEntryByKeyword,
} from '../services/whatsapp/chatbot/customEntries.js';
import { listParentChildren, loadParentChild } from '../services/parentAccess.js';

const router = express.Router();
router.use(authenticate);
router.use(authorize('parent'));

/**
 * Chaque capacité « feuille » est reliée à la fonction qui produit la réponse.
 * Les capacités de section (main.*) n'apparaissent pas ici : elles servent
 * uniquement à regrouper et à couper en cascade.
 */
const HANDLERS = {
  'pedagogy.tracking': A.getLastControlGrades,
  'pedagogy.grades': A.getAverageBySubject,
  'pedagogy.attendance': A.getWeeklyAttendance,
  'pedagogy.unjustified': A.getUnjustifiedAbsences,
  'pedagogy.homework': A.getPendingHomework,
  'pedagogy.timetable': A.getTodaySchedule,
  'pedagogy.documents': A.getRecentDocuments,
  'pedagogy.bulletins': A.getBulletinSummary,
  'finance.balance': A.getFinanceBalance,
  'finance.last_invoice': A.getLastInvoice,
  'finance.history': A.getPaymentHistory,
  'finance.due_dates': A.getUpcomingDueDates,
  'finance.payment_info': A.getSchoolPaymentInfo,
  'schoollife.extracurricular': A.getExtracurricular,
  'schoollife.feed': A.getClassroomFeed,
  'schoollife.lost_items': A.getLostItems,
  'schoollife.polls': A.getActivePolls,
  'main.massar': A.getMassarCode,
};

/** Regroupement affiché dans l'interface, avec son emoji d'ambiance. */
const SECTIONS = [
  { menu: 'pedagogy', section: 'main.pedagogy', label: 'Scolarité', emoji: '📚', mood: 'study' },
  { menu: 'finance', section: 'main.finance', label: 'Paiements', emoji: '💰', mood: 'money' },
  { menu: 'schoollife', section: 'main.schoollife', label: 'Vie scolaire', emoji: '🎒', mood: 'fun' },
];

const OPTION_EMOJI = {
  'pedagogy.tracking': '📝', 'pedagogy.grades': '📊', 'pedagogy.attendance': '📅',
  'pedagogy.unjustified': '⚠️', 'pedagogy.homework': '✍️', 'pedagogy.timetable': '🕐',
  'pedagogy.documents': '📎', 'pedagogy.bulletins': '🏅',
  'finance.balance': '💰', 'finance.last_invoice': '🧾', 'finance.history': '💳',
  'finance.due_dates': '📆', 'finance.payment_info': '🏦',
  'schoollife.extracurricular': '✨', 'schoollife.feed': '📸',
  'schoollife.lost_items': '🔍', 'schoollife.polls': '🗳️',
  'main.massar': '🆔',
};

// ── Utilitaires ───────────────────────────────────────────────────────────

async function buildParentInfo(req) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, school_id, schools(name)')
    .eq('id', req.user.id)
    .single();

  return {
    parent_id: req.user.id,
    parent_name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Parent',
    school_id: profile?.school_id || req.user.school_id || null,
    school_name: profile?.schools?.name || 'École',
  };
}

/**
 * Le texte des réponses est écrit pour WhatsApp (*gras*, séparateurs ━).
 * On le convertit en markdown standard et on retire la décoration qui n'a
 * plus de sens dans une bulle de conversation.
 */
function toMarkdown(whatsappText) {
  return String(whatsappText || '')
    .replace(/^━+$/gm, '')
    .replace(/\*([^*\n]+)\*/g, '**$1**')
    .replace(/_([^_\n]+)_/g, '*$1*')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Options accessibles d'une section, telles qu'affichées en boutons. */
async function sectionOptions(schoolId, menu) {
  const caps = CAPABILITIES.filter((c) => c.menu === menu && HANDLERS[c.id]);
  const out = [];
  for (const cap of caps) {
    if (!(await isCapabilityEnabled(schoolId, cap.id))) continue;
    out.push({ action: cap.id, label: cap.label, emoji: OPTION_EMOJI[cap.id] || '•' });
  }
  return out;
}

// ── Menu interactif ───────────────────────────────────────────────────────

router.get('/menu', async (req, res) => {
  try {
    const parentInfo = await buildParentInfo(req);
    const schoolId = parentInfo.school_id;
    const children = await listParentChildren(parentInfo.parent_id);

    const sections = [];
    for (const s of SECTIONS) {
      if (!(await isCapabilityEnabled(schoolId, s.section))) continue;
      const options = await sectionOptions(schoolId, s.menu);
      if (options.length > 0) sections.push({ ...s, options });
    }

    // Raccourcis hors section + contenus ajoutés par l'école.
    const shortcuts = [];
    if (await isCapabilityEnabled(schoolId, 'main.massar')) {
      shortcuts.push({ action: 'main.massar', label: 'Code Massar', emoji: '🆔' });
    }
    const entries = await loadCustomEntries(schoolId);
    entries.filter((e) => e.show_in_menu).forEach((e) => {
      shortcuts.push({ action: `custom:${e.id}`, label: e.title, emoji: e.emoji || '📌' });
    });

    res.json({
      sections,
      shortcuts,
      ai_enabled: await isCapabilityEnabled(schoolId, 'main.ai'),
      school_name: parentInfo.school_name,
      parent_name: parentInfo.parent_name,
      children,
    });
  } catch (error) {
    console.error('Erreur assistant /menu:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Conversation ──────────────────────────────────────────────────────────

router.post('/message', async (req, res) => {
  try {
    const { child_id: childId, action, text } = req.body;
    const parentInfo = await buildParentInfo(req);
    const schoolId = parentInfo.school_id;

    const student = childId ? await loadParentChild(parentInfo.parent_id, childId) : null;
    if (childId && !student) {
      return res.status(403).json({ error: 'Cet enfant n\'est pas rattaché à votre compte' });
    }

    // ── Bouton : contenu ajouté par l'école ──
    if (action?.startsWith('custom:')) {
      const entry = await findCustomEntry(schoolId, action.slice(7));
      if (!entry) return res.json({ blocks: [{ type: 'text', markdown: 'Ce contenu n\'est plus disponible.' }], mood: 'idle' });
      return res.json(renderCustomEntry(entry));
    }

    // ── Bouton : donnée du référentiel ──
    if (action) {
      if (!HANDLERS[action]) return res.status(400).json({ error: 'Action inconnue' });

      // Double contrôle : le bouton peut venir d'un menu affiché avant que
      // l'administration ne coupe la donnée.
      if (!(await isCapabilityEnabled(schoolId, action))) {
        return res.json({
          blocks: [{ type: 'text', markdown: `Cette information n'est plus communiquée par ${parentInfo.school_name}. Contactez l'établissement directement.` }],
          mood: 'blocked',
        });
      }
      if (!student) return res.status(400).json({ error: 'Sélectionnez un enfant' });

      const reply = await HANDLERS[action](student, parentInfo);
      return res.json({
        blocks: [{ type: 'text', markdown: toMarkdown(reply) }],
        suggestions: await suggestionsFor(schoolId, action),
        mood: moodFor(action),
      });
    }

    // ── Message libre ──
    const question = String(text || '').trim();
    if (!question) return res.status(400).json({ error: 'Message vide' });

    // Un contenu de l'école déclenché par mot-clé prime sur l'IA.
    const hit = await matchCustomEntryByKeyword(schoolId, question);
    if (hit) return res.json(renderCustomEntry(hit));

    if (!(await isCapabilityEnabled(schoolId, 'main.ai'))) {
      return res.json({
        blocks: [{ type: 'text', markdown: 'Les questions libres ne sont pas activées. Utilisez les boutons ci-dessous pour consulter les informations disponibles.' }],
        mood: 'blocked',
      });
    }
    if (!student) return res.status(400).json({ error: 'Sélectionnez un enfant' });

    // answerWithAI applique lui-même les interrupteurs : une donnée coupée
    // n'entre pas dans le contexte du modèle.
    const reply = await answerWithAI({ messageText: question, student, parentInfo });
    return res.json({
      blocks: [{ type: 'text', markdown: toMarkdown(reply) }],
      suggestions: await suggestionsFor(schoolId, null),
      mood: 'idle',
    });
  } catch (error) {
    console.error('Erreur assistant /message:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** Rendu d'un contenu de l'école : texte + pièce jointe éventuelle. */
function renderCustomEntry(entry) {
  const blocks = [];
  const parts = [`**${entry.title}**`];
  if (entry.body_text) parts.push(entry.body_text);
  blocks.push({ type: 'text', markdown: parts.join('\n\n') });

  if (entry.media_url) {
    blocks.push({
      type: entry.media_type === 'image' ? 'image' : 'file',
      url: entry.media_url,
      name: entry.file_name || entry.title,
    });
  }
  return { blocks, mood: 'idle' };
}

/** Ambiance de l'avatar selon le sujet, pour que l'assistant « réagisse ». */
function moodFor(action) {
  if (!action) return 'idle';
  if (action.startsWith('finance')) return 'money';
  if (action.startsWith('schoollife')) return 'fun';
  if (action.startsWith('pedagogy')) return 'study';
  return 'idle';
}

/**
 * Deux ou trois suites logiques après une réponse : c'est ce qui rend la
 * conversation fluide, au lieu de renvoyer le parent au menu à chaque fois.
 */
const FOLLOW_UPS = {
  'pedagogy.tracking': ['pedagogy.grades', 'pedagogy.attendance'],
  'pedagogy.grades': ['pedagogy.bulletins', 'pedagogy.tracking'],
  'pedagogy.attendance': ['pedagogy.unjustified', 'pedagogy.tracking'],
  'pedagogy.unjustified': ['pedagogy.attendance'],
  'pedagogy.homework': ['pedagogy.timetable', 'pedagogy.documents'],
  'pedagogy.timetable': ['pedagogy.homework'],
  'pedagogy.bulletins': ['pedagogy.grades'],
  'finance.balance': ['finance.last_invoice', 'finance.due_dates'],
  'finance.last_invoice': ['finance.history', 'finance.payment_info'],
  'finance.history': ['finance.balance'],
  'finance.due_dates': ['finance.payment_info'],
};

const DEFAULT_SUGGESTIONS = ['pedagogy.tracking', 'pedagogy.homework', 'finance.balance'];

async function suggestionsFor(schoolId, action) {
  const wanted = FOLLOW_UPS[action] || DEFAULT_SUGGESTIONS;
  const disabled = await disabledCapabilities(schoolId);

  const out = [];
  for (const id of wanted) {
    if (id === action || disabled.has(id)) continue;
    if (!(await isCapabilityEnabled(schoolId, id))) continue;
    const cap = CAPABILITIES.find((c) => c.id === id);
    if (cap) out.push({ action: id, label: cap.label, emoji: OPTION_EMOJI[id] || '•' });
  }
  return out.slice(0, 3);
}

export default router;
