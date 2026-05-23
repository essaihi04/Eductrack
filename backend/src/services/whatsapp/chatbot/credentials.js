/**
 * Module de gestion des identifiants via chatbot WhatsApp.
 *
 * Permet au parent (déjà authentifié par son numéro WhatsApp) de :
 *   - Récupérer son login (email)
 *   - Réinitialiser son mot de passe
 *   - Faire la même chose pour son/ses enfant(s) lié(s)
 *
 * Sécurité : l'identification du parent par numéro WhatsApp + propriété
 * du téléphone est considérée comme suffisante pour cette opération
 * (équivalent à un OTP par SMS). Aucune information n'est jamais envoyée
 * sur un numéro qui n'est pas associé au profil dans la base.
 */

import { supabaseAdmin } from '../../../config/supabase.js';

// ─────────────────────────────────────────────────────────────────────────
// Détection d'intention
// ─────────────────────────────────────────────────────────────────────────

// Détection en deux passes : un mot-clé "credential" (qu'est-ce qui est demandé)
// et — pour limiter les faux positifs sur des mots ambigus comme "compte" ou
// "accès" — un mot-clé "action" optionnel. Si l'un des credentials forts est
// présent (login, mot de passe, mdp, …), on déclenche directement.

// "mot de passe" tolérant : "mot pass", "mot de pass", "mot de passe",
// "mot password", "motdepasse" (collé), etc.
const PASSWORD_RE = /(?:mot\s*(?:de\s+)?pass(?:e|word)?|motdepasse|mdp|password|pass\s*word)/i;

// Login / identifiant
const LOGIN_RE = /(?:\blogin\b|identifiant|connexion|connecter|se\s+connecter)/i;

// Mots arabes pour identifiants/mot de passe
const AR_CRED_RE = /(?:كلمة\s*(?:ال)?(?:سر|مرور)|باسو?ورد|رمز\s*الدخول|بيانات\s*الدخول|تسجيل\s*الدخول|نسيت|استرجاع|تجديد)/;

// Mots d'action (changer, réinitialiser, oublier, récupérer, voir...)
const ACTION_RE = /(?:r[ée]initialis|reset|oubli[ée]?|chang(?:er|e|é)|recuperer|récup[eé]r|nouveau|donne[rz]?|envoy|forgot)/i;

// Compte/accès — uniquement si une action est aussi présente (anti-faux-positif)
const SOFT_CRED_RE = /(?:\bcompte\b|\bacc[èe]s\b|\bحساب\b|\bالدخول\b)/i;

export function detectCredentialRequest(text) {
  if (!text) return { wants: false };
  const t = String(text);

  let wants = false;
  if (PASSWORD_RE.test(t) || LOGIN_RE.test(t) || AR_CRED_RE.test(t)) {
    wants = true;
  } else if (SOFT_CRED_RE.test(t) && ACTION_RE.test(t)) {
    wants = true;
  }
  if (!wants) return { wants: false };

  // Détermine la cible : enfant ou parent
  const lower = t.toLowerCase();
  const mentionsChild = /enfant|fils|fille|el[eè]ve|ابن|بنت|ولد|طفل|الطالب|التلميذ|wlidi|bnti|bniti|wliddi/i.test(lower);
  const mentionsParent = /\b(mon|ma|moi|je|hsabi|انا|حسابي|الخاص\s*بي)\b/i.test(lower);

  let target = 'parent';
  if (mentionsChild && mentionsParent) target = 'both';
  else if (mentionsChild) target = 'student';

  return { wants: true, target };
}

// ─────────────────────────────────────────────────────────────────────────
// Génération mot de passe lisible
// ─────────────────────────────────────────────────────────────────────────

function buildReadablePassword(firstName, fallback = 'User') {
  const year = new Date().getFullYear();
  const clean = String(firstName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .trim();
  if (!clean) return `${fallback}${year}`;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() + year;
}

// ─────────────────────────────────────────────────────────────────────────
// Détection langue
// ─────────────────────────────────────────────────────────────────────────

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
function isArabic(text) {
  if (!text) return false;
  const arabic = (text.match(ARABIC_RE) || []).length;
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  return letters > 0 && arabic / letters >= 0.3;
}

// ─────────────────────────────────────────────────────────────────────────
// Réinitialisation effective
// ─────────────────────────────────────────────────────────────────────────

/**
 * Réinitialise le mot de passe d'un profil et retourne son email + nouveau mdp.
 * @returns {Promise<{success:boolean, email?:string, password?:string, error?:string}>}
 */
async function resetProfilePassword(profileId, firstName, fallbackPrefix) {
  try {
    // Récupère email actuel via auth.users
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(profileId);
    if (userErr || !userRes?.user) {
      return { success: false, error: 'utilisateur introuvable' };
    }
    const email = userRes.user.email;
    if (!email) {
      return { success: false, error: 'email absent' };
    }

    const newPassword = buildReadablePassword(firstName, fallbackPrefix);

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(profileId, {
      password: newPassword,
    });
    if (updateErr) {
      console.error('[credentials] updateUserById error:', updateErr);
      return { success: false, error: 'échec mise à jour mot de passe' };
    }

    return { success: true, email, password: newPassword };
  } catch (e) {
    console.error('[credentials] resetProfilePassword exception:', e);
    return { success: false, error: e.message || 'erreur inattendue' };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Construction du message
// ─────────────────────────────────────────────────────────────────────────

function buildCredentialMessage({ ar, items, parentName, schoolName }) {
  if (ar) {
    const lines = [
      `🔐 *بيانات الدخول*`,
      ``,
      `مرحباً ${parentName} 👋`,
      `هذه بيانات الدخول الخاصة بكم لمنصة ${schoolName}:`,
      ``,
    ];
    items.forEach((it) => {
      lines.push(`👤 *${it.role}* — ${it.name}`);
      lines.push(`📧 البريد: ${it.email}`);
      lines.push(`🔑 كلمة السر الجديدة: *${it.password}*`);
      lines.push(``);
    });
    lines.push(`🌐 رابط الدخول: https://etrack.ma/login`);
    lines.push(``);
    lines.push(`⚠️ احتفظوا بهذه المعلومات في مكان آمن.`);
    lines.push(`_تم تجديد كلمة السر آلياً. كلمة السر القديمة لم تعد صالحة._`);
    return lines.join('\n');
  }

  const lines = [
    `🔐 *Vos identifiants de connexion*`,
    ``,
    `Bonjour ${parentName} 👋`,
    `Voici les identifiants pour la plateforme *${schoolName}* :`,
    ``,
  ];
  items.forEach((it) => {
    lines.push(`👤 *${it.role}* — ${it.name}`);
    lines.push(`📧 Email : ${it.email}`);
    lines.push(`🔑 Nouveau mot de passe : *${it.password}*`);
    lines.push(``);
  });
  lines.push(`🌐 Lien de connexion : https://etrack.ma/login`);
  lines.push(``);
  lines.push(`⚠️ Conservez ces informations en sécurité.`);
  lines.push(`_Le mot de passe a été régénéré automatiquement — l'ancien n'est plus valide._`);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// API publique : handleCredentialRequest
// ─────────────────────────────────────────────────────────────────────────

/**
 * Traite une demande d'identifiants : régénère le mot de passe du parent
 * (et éventuellement de l'enfant) et renvoie un message formaté.
 *
 * @param {object} param0
 * @param {string} param0.text          - message original du parent (pour la langue)
 * @param {object} param0.parentInfo    - { parent_id, parent_name, school_name, school_id }
 * @param {object|null} param0.student  - élève courant (peut être null)
 * @param {'parent'|'student'|'both'} param0.target
 * @returns {Promise<string>} message texte à envoyer au parent
 */
export async function handleCredentialRequest({ text, parentInfo, student, target = 'parent' }) {
  const ar = isArabic(text);

  // Récupère le profil du parent (first_name pour génération du mdp)
  const { data: parentProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('id', parentInfo.parent_id)
    .single();

  const items = [];

  // Parent
  if (target === 'parent' || target === 'both') {
    const res = await resetProfilePassword(
      parentInfo.parent_id,
      parentProfile?.first_name || parentInfo.parent_name,
      'Parent',
    );
    if (res.success) {
      items.push({
        role: ar ? 'الوالد(ة)' : 'Parent',
        name: `${parentProfile?.first_name || ''} ${parentProfile?.last_name || ''}`.trim() || parentInfo.parent_name,
        email: res.email,
        password: res.password,
      });
    } else {
      console.warn('[credentials] reset parent failed:', res.error);
    }
  }

  // Enfant (si demandé ou si seul cas demandé)
  if ((target === 'student' || target === 'both') && student) {
    const res = await resetProfilePassword(student.id, student.first_name, 'Eleve');
    if (res.success) {
      items.push({
        role: ar ? 'التلميذ(ة)' : 'Élève',
        name: `${student.first_name} ${student.last_name}`,
        email: res.email,
        password: res.password,
      });
    } else {
      console.warn('[credentials] reset student failed:', res.error);
    }
  }

  if (items.length === 0) {
    return ar
      ? `⚠️ تعذّر استرجاع بيانات الدخول. يرجى التواصل مع إدارة *${parentInfo.school_name}*.`
      : `⚠️ Impossible de récupérer vos identifiants pour le moment. Veuillez contacter l'administration de *${parentInfo.school_name}*.`;
  }

  return buildCredentialMessage({
    ar,
    items,
    parentName: parentInfo.parent_name,
    schoolName: parentInfo.school_name,
  });
}
