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
import { isSuppliesQuery } from '../services/whatsapp/chatbot/suppliesQuery.js';
import {
  getActiveSections, getSectionById, matchSectionForLevel,
} from '../services/whatsapp/chatbot/knowledge.js';
import { generateSectionPdf } from '../services/whatsapp/chatbot/suppliesPdf.js';
import {
  CAPABILITIES, isCapabilityEnabled, disabledCapabilities,
} from '../services/whatsapp/chatbot/capabilities.js';
import {
  loadCustomEntries, findCustomEntry, matchCustomEntryByKeyword,
} from '../services/whatsapp/chatbot/customEntries.js';
import { listParentChildren, loadParentChild } from '../services/parentAccess.js';
import {
  actionLabel, assistantText, localizeAssistantReply, normalizeAssistantLocale, sectionLabel,
} from '../services/parentAssistantLocalization.js';

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

const SUPPLIES_ACTION = 'schoollife.supplies';

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
  'schoollife.lost_items': '🔍', 'schoollife.polls': '🗳️', 'schoollife.supplies': '🎒',
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
async function sectionOptions(schoolId, menu, locale) {
  const caps = CAPABILITIES.filter((c) => c.menu === menu && (HANDLERS[c.id] || c.id === SUPPLIES_ACTION));
  const out = [];
  for (const cap of caps) {
    if (!(await isCapabilityEnabled(schoolId, cap.id))) continue;
    out.push({ action: cap.id, label: actionLabel(cap.id, cap.label, locale), emoji: OPTION_EMOJI[cap.id] || '•' });
  }
  return out;
}

function suppliesAcademicYear(section) {
  if (section?.document?.academic_year) return section.document.academic_year;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return `${year}-${year + 1}`;
  if (month <= 2) return `${year - 1}-${year}`;
  return `${year}-${year + 1}`;
}

function suppliesPreview(content) {
  if (content && typeof content === 'object' && Array.isArray(content.groups)) {
    const output = [];
    let itemCount = 0;
    for (const group of content.groups) {
      const items = (group?.items || []).filter((item) => {
        const label = String(item?.label || '').trim();
        return label && !/^UPLOAD\b/i.test(label);
      });
      if (items.length === 0) continue;
      output.push(`**${String(group.title || '').trim() || '—'}**`);
      for (const item of items) {
        const quantity = String(item.quantity || '').trim();
        const label = String(item.label || '').trim();
        const note = String(item.note || '').trim();
        output.push(`- ${[quantity, label].filter(Boolean).join(' ')}${note ? ` — ${note}` : ''}`.slice(0, 180));
        itemCount += 1;
        if (itemCount >= 8) break;
      }
      if (itemCount >= 8) break;
    }
    return output.join('\n');
  }

  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*\s]+/, '').trim())
    .filter(Boolean);
  return lines.slice(0, 8).map((line) => `- ${line.slice(0, 150)}`).join('\n');
}

function readySuppliesResponse(section, locale) {
  const level = section.level_label || section.level_code || '—';
  const preview = suppliesPreview(section.content);
  const text = [
    assistantText('suppliesReady', locale, { level }),
    preview,
    assistantText('suppliesMore', locale),
  ].filter(Boolean).join('\n\n');

  return {
    blocks: [
      { type: 'text', markdown: text },
      {
        type: 'secure_file',
        endpoint: `/api/parent/assistant/supplies/${section.id}/pdf`,
        name: assistantText('suppliesDownload', locale, { level }),
      },
    ],
    mood: 'fun',
  };
}

async function suppliesResponse({ schoolId, student, locale, sectionId = null }) {
  const sections = await getActiveSections(schoolId, 'fournitures');
  if (sections.length === 0) {
    return {
      blocks: [{ type: 'text', markdown: assistantText('suppliesUnavailable', locale) }],
      mood: 'fun',
    };
  }

  let section = sectionId ? sections.find((item) => item.id === sectionId) : null;
  if (sectionId && !section) {
    return {
      blocks: [{ type: 'text', markdown: assistantText('contentUnavailable', locale) }],
      mood: 'idle',
    };
  }

  if (!section) {
    const studentLevel = student?.classes?.level || student?.class_name || student?.classes?.name;
    section = matchSectionForLevel(studentLevel, sections);
  }
  if (!section && sections.length === 1) section = sections[0];
  if (section) return readySuppliesResponse(section, locale);

  return {
    blocks: [{ type: 'text', markdown: assistantText('suppliesChooseLevel', locale) }],
    suggestions: sections.map((item) => ({
      action: `${SUPPLIES_ACTION}:${item.id}`,
      label: item.level_label || item.level_code || '—',
      emoji: '📘',
    })),
    mood: 'fun',
  };
}

// ── Menu interactif ───────────────────────────────────────────────────────

router.get('/menu', async (req, res) => {
  try {
    const parentInfo = await buildParentInfo(req);
    const schoolId = parentInfo.school_id;
    const children = await listParentChildren(parentInfo.parent_id);
    const locale = normalizeAssistantLocale(req.query.lang);

    const sections = [];
    for (const s of SECTIONS) {
      if (!(await isCapabilityEnabled(schoolId, s.section))) continue;
      const options = await sectionOptions(schoolId, s.menu, locale);
      if (options.length > 0) sections.push({ ...s, label: sectionLabel(s.menu, s.label, locale), options });
    }

    // Raccourcis hors section + contenus ajoutés par l'école.
    const shortcuts = [];
    if (await isCapabilityEnabled(schoolId, 'main.massar')) {
      shortcuts.push({ action: 'main.massar', label: actionLabel('main.massar', 'Code Massar', locale), emoji: '🆔' });
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
    res.status(500).json({ error: assistantText('serverError', req.query.lang) });
  }
});

// PDF généré à la demande. L'URL reste derrière l'authentification parent :
// le frontend le télécharge avec le jeton courant au lieu de publier un lien.
router.get('/supplies/:sectionId/pdf', async (req, res) => {
  try {
    const parentInfo = await buildParentInfo(req);
    if (!(await isCapabilityEnabled(parentInfo.school_id, SUPPLIES_ACTION))) {
      return res.status(403).json({ error: assistantText('contentUnavailable', req.query.lang) });
    }

    const section = await getSectionById(req.params.sectionId);
    if (!section || section.school_id !== parentInfo.school_id || section.document?.category !== 'fournitures') {
      return res.status(404).json({ error: assistantText('contentUnavailable', req.query.lang) });
    }

    const { buffer, fileName } = await generateSectionPdf({
      schoolId: parentInfo.school_id,
      section,
      title: 'Fournitures scolaires',
      academicYear: suppliesAcademicYear(section),
    });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Erreur assistant fournitures PDF:', error);
    return res.status(500).json({ error: assistantText('serverError', req.query.lang) });
  }
});

// ── Conversation ──────────────────────────────────────────────────────────

router.post('/message', async (req, res) => {
  try {
    const { child_id: childId, action, text } = req.body;
    const locale = normalizeAssistantLocale(req.body.lang);
    const parentInfo = await buildParentInfo(req);
    const schoolId = parentInfo.school_id;

    const student = childId ? await loadParentChild(parentInfo.parent_id, childId) : null;
    if (childId && !student) {
      return res.status(403).json({ error: assistantText('childForbidden', locale) });
    }

    // ── Bouton : contenu ajouté par l'école ──
    if (action?.startsWith('custom:')) {
      const entry = await findCustomEntry(schoolId, action.slice(7));
      if (!entry) return res.json({ blocks: [{ type: 'text', markdown: assistantText('contentUnavailable', locale) }], mood: 'idle' });
      return res.json(renderCustomEntry(entry));
    }

    // ── Bouton : donnée du référentiel ──
    if (action) {
      if (action === SUPPLIES_ACTION || action.startsWith(`${SUPPLIES_ACTION}:`)) {
        if (!(await isCapabilityEnabled(schoolId, SUPPLIES_ACTION))) {
          return res.json({
            blocks: [{ type: 'text', markdown: assistantText('disabledInfo', locale, { school: parentInfo.school_name }) }],
            mood: 'blocked',
          });
        }
        if (!student) return res.status(400).json({ error: assistantText('selectChild', locale) });
        const sectionId = action.startsWith(`${SUPPLIES_ACTION}:`) ? action.slice(SUPPLIES_ACTION.length + 1) : null;
        return res.json(await suppliesResponse({ schoolId, student, locale, sectionId }));
      }

      if (!HANDLERS[action]) return res.status(400).json({ error: assistantText('unknownAction', locale) });

      // Double contrôle : le bouton peut venir d'un menu affiché avant que
      // l'administration ne coupe la donnée.
      if (!(await isCapabilityEnabled(schoolId, action))) {
        return res.json({
          blocks: [{ type: 'text', markdown: assistantText('disabledInfo', locale, { school: parentInfo.school_name }) }],
          mood: 'blocked',
        });
      }
      if (!student) return res.status(400).json({ error: assistantText('selectChild', locale) });

      const reply = await HANDLERS[action](student, parentInfo);
      return res.json({
        blocks: [{ type: 'text', markdown: toMarkdown(localizeAssistantReply(reply, locale)) }],
        suggestions: await suggestionsFor(schoolId, action, locale),
        mood: moodFor(action),
      });
    }

    // ── Message libre ──
    const question = String(text || '').trim();
    if (!question) return res.status(400).json({ error: assistantText('emptyMessage', locale) });

    if (isSuppliesQuery(question)) {
      if (!(await isCapabilityEnabled(schoolId, SUPPLIES_ACTION))) {
        return res.json({
          blocks: [{ type: 'text', markdown: assistantText('disabledInfo', locale, { school: parentInfo.school_name }) }],
          mood: 'blocked',
        });
      }
      if (!student) return res.status(400).json({ error: assistantText('selectChild', locale) });
      return res.json(await suppliesResponse({ schoolId, student, locale }));
    }

    // Un contenu de l'école déclenché par mot-clé prime sur l'IA.
    const hit = await matchCustomEntryByKeyword(schoolId, question);
    if (hit) return res.json(renderCustomEntry(hit));

    if (!(await isCapabilityEnabled(schoolId, 'main.ai'))) {
      return res.json({
        blocks: [{ type: 'text', markdown: assistantText('aiDisabled', locale) }],
        mood: 'blocked',
      });
    }
    if (!student) return res.status(400).json({ error: assistantText('selectChild', locale) });

    // answerWithAI applique lui-même les interrupteurs : une donnée coupée
    // n'entre pas dans le contexte du modèle.
    const reply = await answerWithAI({ messageText: question, student, parentInfo });
    return res.json({
      blocks: [{ type: 'text', markdown: toMarkdown(reply) }],
      suggestions: await suggestionsFor(schoolId, null, locale),
      mood: 'idle',
    });
  } catch (error) {
    console.error('Erreur assistant /message:', error);
    res.status(500).json({ error: assistantText('serverError', req.body?.lang) });
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
  'schoollife.supplies': ['schoollife.extracurricular'],
};

const DEFAULT_SUGGESTIONS = ['pedagogy.tracking', 'pedagogy.homework', 'finance.balance'];

async function suggestionsFor(schoolId, action, locale) {
  const wanted = FOLLOW_UPS[action] || DEFAULT_SUGGESTIONS;
  const disabled = await disabledCapabilities(schoolId);

  const out = [];
  for (const id of wanted) {
    if (id === action || disabled.has(id)) continue;
    if (!(await isCapabilityEnabled(schoolId, id))) continue;
    const cap = CAPABILITIES.find((c) => c.id === id);
    if (cap) out.push({ action: id, label: actionLabel(id, cap.label, locale), emoji: OPTION_EMOJI[id] || '•' });
  }
  return out.slice(0, 3);
}

export default router;
