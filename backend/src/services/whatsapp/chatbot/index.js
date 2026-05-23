/**
 * Orchestrateur du chatbot WhatsApp v2.
 *
 * Architecture :
 *   1. Message entrant Baileys → handleBaileysIncoming
 *   2. Identification du parent via numéro
 *   3. State machine :
 *        - Pas d'enfant sélectionné → menu de sélection enfant
 *        - Enfant sélectionné → menu principal (pédago / finance / IA)
 *        - Sous-menu → réponses prédéfinies déterministes (DB)
 *        - Mode IA → DeepSeek avec contexte élève
 *
 * IMPORTANT : DeepSeek IA n'est invoqué QUE si l'utilisateur choisit
 * explicitement "💬 Question libre" dans le menu principal.
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText } from '../index.js';
import { categorizeIncoming } from '../../../utils/whatsappCategory.js';
import * as State from './state.js';
import { MENUS, sendMenu, matchMenuOption } from './menus.js';
import { answerWithAI, detectSpecialCommand, menuFooterForText } from './ai.js';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function normalizePhone(phone) {
  let p = String(phone || '').replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\s+/g, '');
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

async function getParentByPhone(phone, schoolId = null) {
  // Cherche d'abord dans parent_contacts (numéro WhatsApp dédié)
  let parentId = null;
  let resolvedSchoolId = schoolId;

  const { data: contacts } = await supabaseAdmin
    .from('parent_contacts')
    .select('parent_id, profiles:parent_id(id, school_id, first_name, last_name)')
    .eq('phone_e164', phone)
    .eq('channel', 'whatsapp')
    .limit(1);

  if (contacts && contacts.length > 0) {
    parentId = contacts[0].parent_id;
    resolvedSchoolId = contacts[0].profiles?.school_id || schoolId;
  } else {
    // Fallback : profiles.phone
    let q = supabaseAdmin
      .from('profiles')
      .select('id, school_id, first_name, last_name, schools(name)')
      .eq('role', 'parent')
      .eq('phone', phone);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data: profs } = await q.limit(1);
    if (profs && profs.length > 0) {
      parentId = profs[0].id;
      resolvedSchoolId = profs[0].school_id;
    }
  }

  if (!parentId) return null;

  // Charge nom + école
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, school_id, schools(name)')
    .eq('id', parentId)
    .single();

  if (!profile) return null;

  return {
    parent_id: profile.id,
    parent_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    school_id: profile.school_id,
    school_name: profile.schools?.name || 'École',
  };
}

async function getParentChildren(parentId) {
  const { data: links } = await supabaseAdmin
    .from('parent_students')
    .select('student:student_id(id, first_name, last_name, class_id, classes!fk_profiles_class(name))')
    .eq('parent_id', parentId);

  return (links || [])
    .map((l) => l.student)
    .filter(Boolean)
    .map((s) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      class_id: s.class_id,
      class_name: s.classes?.name || null,
    }));
}

async function getStudentById(studentId) {
  const { data: s } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, class_id, classes!fk_profiles_class(name)')
    .eq('id', studentId)
    .single();
  if (!s) return null;
  return { ...s, class_name: s.classes?.name || null };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers : conversion chiffres arabes-indic + matching enfant
// ─────────────────────────────────────────────────────────────────────────

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXT_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Convertit les chiffres arabes-indic (٠-٩) et persans (۰-۹) en chiffres ASCII.
 * Ex: "١" → "1", "٢" → "2".
 */
function normalizeDigits(text) {
  if (!text) return '';
  return String(text)
    .replace(/[٠-٩]/g, (c) => ARABIC_INDIC.indexOf(c).toString())
    .replace(/[۰-۹]/g, (c) => EXT_ARABIC_INDIC.indexOf(c).toString());
}

/**
 * Tente d'identifier un enfant à partir d'une saisie texte du parent.
 * Accepte :
 *   - un numéro (1, 2, ١, ٢, …)
 *   - le prénom ou nom de famille (FR ou AR), même partiel
 *   - le nom complet dans n'importe quel ordre
 */
function matchChildFromInput(rawText, children) {
  if (!children || children.length === 0) return null;
  const text = normalizeDigits(String(rawText || '').trim());
  if (!text) return null;

  // 1. Tentative index numérique
  const idx = parseInt(text, 10);
  if (Number.isFinite(idx) && idx >= 1 && idx <= children.length) {
    return children[idx - 1];
  }

  // 2. Tentative match par nom (insensible à la casse / espaces multiples)
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const t = norm(text);
  if (t.length < 2) return null;

  for (const c of children) {
    const first = norm(c.first_name);
    const last = norm(c.last_name);
    const full1 = `${first} ${last}`;
    const full2 = `${last} ${first}`;
    if (
      t === first ||
      t === last ||
      t === full1 ||
      t === full2 ||
      full1.includes(t) ||
      full2.includes(t) ||
      (first.length >= 3 && t.includes(first)) ||
      (last.length >= 3 && t.includes(last))
    ) {
      return c;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Envoi du menu de sélection enfant
// ─────────────────────────────────────────────────────────────────────────

async function sendChildSelectionMenu(schoolId, phone, children, parentInfo) {
  if (children.length === 0) {
    await sendText(schoolId, phone, `Aucun enfant n'est rattaché à votre numéro.\n\nVeuillez contacter ${parentInfo.school_name} pour configurer votre compte.`, { urgent: true });
    return;
  }

  if (children.length === 1) {
    // Un seul enfant → sélection auto
    State.selectStudent(phone, children[0].id);
    await sendMainMenu(schoolId, phone, children[0], parentInfo);
    return;
  }

  // Plusieurs enfants → menu numéroté
  const lines = [
    `*👨‍👩‍👧 Sélection de l'enfant*`,
    '━━━━━━━━━━━━━━━━━━━',
    `Bonjour ${parentInfo.parent_name} 👋`,
    `Pour quel enfant souhaitez-vous des informations ?`,
    '',
  ];
  children.forEach((c, i) => {
    lines.push(`*${i + 1}.* 👶 ${c.first_name} ${c.last_name}${c.class_name ? ` _(${c.class_name})_` : ''}`);
  });
  lines.push('');
  lines.push(`_Répondez avec le numéro de l'enfant._`);

  State.setChildSelection(phone);
  // Stocke la liste pour résoudre la sélection
  State.setState(phone, { childrenList: children.map((c) => c.id) });

  await sendText(schoolId, phone, lines.join('\n'), { urgent: true });
}

// ─────────────────────────────────────────────────────────────────────────
// Envoi du menu principal
// ─────────────────────────────────────────────────────────────────────────

async function sendMainMenu(schoolId, phone, student, parentInfo) {
  State.setMenu(phone, 'main');
  await sendMenu(schoolId, phone, MENUS.main, {
    studentName: `${student.first_name} ${student.last_name}`,
    schoolName: parentInfo.school_name,
  });
}

async function sendSubMenu(schoolId, phone, menuId, student, parentInfo) {
  State.setMenu(phone, menuId);
  await sendMenu(schoolId, phone, MENUS[menuId], {
    studentName: `${student.first_name} ${student.last_name}`,
    schoolName: parentInfo.school_name,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Dispatcher d'action de menu
// ─────────────────────────────────────────────────────────────────────────

async function executeOption(option, schoolId, phone, student, parentInfo) {
  // Action de navigation : "goto:menuId"
  if (typeof option.action === 'string' && option.action.startsWith('goto:')) {
    const target = option.action.split(':')[1];
    if (target === 'main') {
      return sendMainMenu(schoolId, phone, student, parentInfo);
    }
    if (target === 'pedagogy' || target === 'finance') {
      return sendSubMenu(schoolId, phone, target, student, parentInfo);
    }
    if (target === 'ai') {
      State.setAIMode(phone);
      const msg = `*💬 Question libre*\n━━━━━━━━━━━━━━━━━━━\n\nPosez votre question sur ${student.first_name} en tant que parent.\n\nExemples :\n• "Comment se débrouille-t-il en maths ?"\n• "Que dois-je payer ce mois-ci ?"\n\n_L'IA répond en se basant uniquement sur les données de votre enfant._\n\nTapez *menu* à tout moment pour revenir au menu principal.`;
      return sendText(schoolId, phone, msg, { urgent: true });
    }
    if (target === 'child') {
      const children = await getParentChildren(parentInfo.parent_id);
      return sendChildSelectionMenu(schoolId, phone, children, parentInfo);
    }
  }

  // Action = fonction (réponse prédéfinie)
  if (typeof option.action === 'function') {
    try {
      const reply = await option.action(student, parentInfo);
      await sendText(schoolId, phone, reply, { urgent: true });

      // Petit menu de rappel à la fin
      setTimeout(() => {
        sendText(schoolId, phone, `_Tapez *menu* pour d'autres options ou choisissez directement un autre numéro._`, { urgent: true });
      }, 1500);
      return;
    } catch (e) {
      console.error('[chatbot] Erreur exécution option:', e);
      await sendText(schoolId, phone, `⚠️ Erreur lors de la récupération des données. Veuillez réessayer.`, { urgent: true });
      return;
    }
  }

  // Aucune action reconnue
  await sendText(schoolId, phone, `Option non reconnue. Tapez *menu* pour recommencer.`, { urgent: true });
}

// ─────────────────────────────────────────────────────────────────────────
// Entry point principal
// ─────────────────────────────────────────────────────────────────────────

/**
 * Point d'entrée appelé pour chaque message WhatsApp entrant.
 * @param {object} param0
 * @param {string} param0.from        - numéro E.164 du parent
 * @param {string} param0.text        - corps du message
 * @param {string} param0.id          - ID Baileys du message
 * @param {string} param0.schoolId    - school_id résolu via la session Baileys
 */
export async function handleIncomingWhatsAppMessage({ from, text, id, schoolId }) {
  const phone = normalizePhone(from);
  console.log(`[chatbot] ← ${phone} (school=${schoolId}): "${text?.substring(0, 80)}"`);

  // 0. Déduplication
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .select('id, processed')
    .eq('provider_message_id', id)
    .maybeSingle();
  if (existing?.processed) {
    console.log('[chatbot] Message déjà traité, ignoré:', id);
    return;
  }

  // 1. Identifier le parent
  const parentInfo = await getParentByPhone(phone, schoolId);
  if (!parentInfo) {
    console.log('[chatbot] Numéro non autorisé:', phone);
    return; // Silence total pour les inconnus (anti-bruit)
  }

  // 2. Logger le message entrant
  const incomingCategory = categorizeIncoming?.(text) || 'pedagogical';
  const { data: incomingMsg } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .insert({
      phone_e164: phone,
      parent_id: parentInfo.parent_id,
      school_id: parentInfo.school_id,
      message_text: text,
      provider_message_id: id,
      processed: false,
      category: incomingCategory,
    })
    .select()
    .single();

  // 3. Commandes spéciales (toujours prioritaires)
  const cmd = detectSpecialCommand(text);
  if (cmd === 'menu' || cmd === 'help') {
    const state = State.getState(phone);
    let student = state?.studentId ? await getStudentById(state.studentId) : null;
    if (!student) {
      const children = await getParentChildren(parentInfo.parent_id);
      await sendChildSelectionMenu(parentInfo.school_id, phone, children, parentInfo);
    } else {
      await sendMainMenu(parentInfo.school_id, phone, student, parentInfo);
    }
    await markProcessed(incomingMsg?.id);
    return;
  }
  if (cmd === 'stop') {
    State.resetState(phone);
    await sendText(parentInfo.school_id, phone, `✅ Vous ne recevrez plus de notifications WhatsApp.\n\nPour réactiver, contactez ${parentInfo.school_name}.`, { urgent: true });
    // TODO: marquer parent_contacts.opted_out = true
    await markProcessed(incomingMsg?.id);
    return;
  }

  // 4. State machine
  let state = State.getState(phone);

  // Pas d'état (1re interaction, expiré, ou redémarrage serveur) → essayer
  // d'abord d'interpréter la saisie comme une sélection d'enfant (numéro ou
  // nom), sinon afficher le menu de sélection.
  if (!state || !state.studentId) {
    const children = await getParentChildren(parentInfo.parent_id);
    if (children.length === 1) {
      State.selectStudent(phone, children[0].id);
      state = State.getState(phone);

      // Détecte si la 1re saisie est une vraie question (et non une simple
      // salutation type "bonjour", "salam", "hi"…). Si oui, on répond
      // directement à la question puis on affiche le menu, comme demandé.
      const trimmed = String(text || '').trim();
      const lower = trimmed.toLowerCase();
      const greetings = /^(bonjour|bonsoir|salut|coucou|hi|hello|hey|salam|salem|sa?lam|marhaba|ahlan|ا?لسلام|مرحبا|سلام|اهلا)[\s!.?,؟]*$/i;
      const isGreeting = greetings.test(lower) || trimmed.length < 5;
      const looksLikeQuestion = !isGreeting && (trimmed.includes(' ') || trimmed.length > 8);

      // Accueil
      await sendText(parentInfo.school_id, phone, `Bonjour ${parentInfo.parent_name} 👋\nBienvenue sur le service WhatsApp de *${parentInfo.school_name}*.`, { urgent: true });

      if (looksLikeQuestion) {
        try {
          const student = children[0];
          const reply = await answerWithAI({ messageText: text, student, parentInfo });
          await sendText(parentInfo.school_id, phone, reply, { urgent: true });
          await supabaseAdmin
            .from('whatsapp_incoming_messages')
            .update({ ai_response_sent: true, ai_response_text: reply })
            .eq('id', incomingMsg?.id);
        } catch (e) {
          console.error('[chatbot] Erreur IA 1re question:', e);
        }
      }

      // Menu principal après l'accueil (et la réponse IA si applicable)
      await sendMainMenu(parentInfo.school_id, phone, children[0], parentInfo);
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Plusieurs enfants : tenter de matcher la saisie courante (utile quand
    // l'état en mémoire a été perdu après un redémarrage PM2 alors que le
    // parent vient de recevoir le menu de sélection).
    const matched = matchChildFromInput(text, children);
    if (matched) {
      State.selectStudent(phone, matched.id);
      await sendText(
        parentInfo.school_id,
        phone,
        `✅ Enfant sélectionné : *${matched.first_name} ${matched.last_name}*`,
        { urgent: true }
      );
      await sendMainMenu(parentInfo.school_id, phone, matched, parentInfo);
      await markProcessed(incomingMsg?.id);
      return;
    }

    await sendChildSelectionMenu(parentInfo.school_id, phone, children, parentInfo);
    await markProcessed(incomingMsg?.id);
    return;
  }

  const student = await getStudentById(state.studentId);
  if (!student) {
    State.resetState(phone);
    await sendText(parentInfo.school_id, phone, `Erreur : élève introuvable. Tapez *menu* pour recommencer.`, { urgent: true });
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode CHILD : attente sélection enfant (numéro OU nom, FR/AR/Darija)
  if (state.state === 'CHILD') {
    const childrenList = state.childrenList || [];
    // Reconstitue la liste d'objets enfants pour pouvoir matcher par nom
    const children = await getParentChildren(parentInfo.parent_id);
    const orderedChildren = childrenList.length
      ? childrenList
          .map((id) => children.find((c) => c.id === id))
          .filter(Boolean)
      : children;

    const matched = matchChildFromInput(text, orderedChildren);
    if (matched) {
      State.selectStudent(phone, matched.id);
      await sendText(
        parentInfo.school_id,
        phone,
        `✅ Enfant sélectionné : *${matched.first_name} ${matched.last_name}*`,
        { urgent: true }
      );
      await sendMainMenu(parentInfo.school_id, phone, matched, parentInfo);
      await markProcessed(incomingMsg?.id);
      return;
    }

    await sendText(
      parentInfo.school_id,
      phone,
      `🤔 Sélection non reconnue. Répondez avec :\n• le *numéro* de l'enfant (1, 2, ١, ٢…)\n• ou son *prénom* / *nom*`,
      { urgent: true }
    );
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode AI : forward DeepSeek (l'utilisateur a explicitement choisi cette option)
  if (state.state === 'AI') {
    const reply = await answerWithAI({ messageText: text, student, parentInfo });
    await sendText(parentInfo.school_id, phone, reply, { urgent: true });
    await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .update({ ai_response_sent: true, ai_response_text: reply })
      .eq('id', incomingMsg.id);
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode MENU : essayer de matcher une option du menu en cours
  if (state.state === 'MENU') {
    const menu = MENUS[state.currentMenu] || MENUS.main;
    const opt = matchMenuOption(menu, text);
    if (opt) {
      await executeOption(opt, parentInfo.school_id, phone, student, parentInfo);
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Pas de correspondance avec une option. Heuristique : si l'utilisateur a
    // tapé une vraie phrase / question (> 4 caractères, contient au moins 1
    // espace OU plus de 8 caractères), on considère que c'est une question
    // libre (français, arabe, darja, etc.) et on la route vers l'IA au lieu
    // de répondre "Option non reconnue".
    const trimmed = text.trim();
    const looksLikeQuestion =
      trimmed.length >= 5 && (trimmed.includes(' ') || trimmed.length > 8);

    if (looksLikeQuestion) {
      console.log(`[chatbot] MENU → IA fallback (texte libre): "${trimmed.substring(0, 40)}"`);
      const reply = await answerWithAI({ messageText: text, student, parentInfo });
      await sendText(parentInfo.school_id, phone, reply, { urgent: true });
      await supabaseAdmin
        .from('whatsapp_incoming_messages')
        .update({ ai_response_sent: true, ai_response_text: reply })
        .eq('id', incomingMsg.id);
      // Petit rappel pour revenir au menu
      setTimeout(() => {
        sendText(
          parentInfo.school_id,
          phone,
          menuFooterForText(text),
          { urgent: true }
        );
      }, 1500);
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Saisie courte non reconnue (probable typo de numéro de menu) :
    // ré-afficher le menu courant.
    await sendText(parentInfo.school_id, phone, `🤔 Option non reconnue : "${text.substring(0, 30)}".`, { urgent: true });
    await sendMenu(parentInfo.school_id, phone, menu, {
      studentName: `${student.first_name} ${student.last_name}`,
      schoolName: parentInfo.school_name,
    });
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Sécurité : état inconnu
  State.resetState(phone);
  await sendMainMenu(parentInfo.school_id, phone, student, parentInfo);
  await markProcessed(incomingMsg?.id);
}

async function markProcessed(incomingMsgId) {
  if (!incomingMsgId) return;
  await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .update({ processed: true })
    .eq('id', incomingMsgId);
}

// ─────────────────────────────────────────────────────────────────────────
// Adapter Baileys (callback fourni à baileysClient.startSession)
// ─────────────────────────────────────────────────────────────────────────

export async function handleBaileysIncoming({ schoolId, msg }) {
  const m = msg.message || {};
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    // Réponse à un listMessage : rowId stocké dans selectedRowId
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.buttonsResponseMessage?.selectedButtonId ||
    '';

  if (!text) return;

  const remoteJid = msg.key?.remoteJid || '';

  // Ignore les groupes (toujours @g.us)
  if (remoteJid.endsWith('@g.us')) {
    console.log(`[chatbot] Ignoré (groupe): ${remoteJid}`);
    return;
  }

  // Pour les messages 1-à-1, WhatsApp utilise désormais 2 formats :
  //   - @s.whatsapp.net : ancien format, le JID = phone E.164
  //   - @lid           : nouveau "Linked Identity" pour la confidentialité
  // Pour @lid, Baileys expose le vrai téléphone dans key.senderPn / participantPn
  // ou via remoteJidAlt selon la version. On tente chaque champ dans l'ordre.
  let phoneJid = null;
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    phoneJid = remoteJid;
  } else if (remoteJid.endsWith('@lid')) {
    phoneJid =
      msg.key?.senderPn ||
      msg.key?.participantPn ||
      msg.key?.remoteJidAlt ||
      null;
    if (!phoneJid) {
      console.warn(
        `[chatbot] ⚠️  Message @lid sans numéro résoluble — clés disponibles: ${JSON.stringify(Object.keys(msg.key || {}))}`
      );
      return;
    }
    console.log(`[chatbot] 🔗 LID résolu: ${remoteJid} → ${phoneJid}`);
  } else {
    console.log(`[chatbot] Ignoré (format JID inconnu): ${remoteJid}`);
    return;
  }

  const from = '+' + phoneJid.split('@')[0];
  const id = msg.key?.id || `${Date.now()}`;

  return handleIncomingWhatsAppMessage({ from, text, id, schoolId });
}
