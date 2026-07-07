/**
 * Mode démo commercial « QR parent » — école principale uniquement.
 *
 * Un prospect (directeur d'une autre école) scanne le QR affiché dans l'admin :
 * il ouvre WhatsApp avec le message pré-rempli « DEMO PARENT » vers le numéro
 * Baileys de l'école démo. À la réception :
 *   1. La config demo_parent_configs de l'école est chargée (absente/désactivée
 *      → on laisse le chatbot normal traiter le message).
 *   2. Numéro déjà associé à un élève de la classe démo → on régénère son mot
 *      de passe et on renvoie le message de bienvenue (idempotent).
 *   3. Sinon → on crée un parent (numéro expéditeur), on le lie à l'ÉLÈVE
 *      SUIVANT de la classe démo (ordre import_order), et on lui envoie la
 *      bienvenue avec le nom de l'élève + ses identifiants de connexion.
 *
 * Chaque nouveau scan (nouveau numéro) consomme donc un nouvel élève, jusqu'à
 * épuisement des 50 élèves de la classe démo (message « démo complète »).
 *
 * Sécurité : la fonctionnalité n'existe QUE pour les écoles ayant une ligne
 * demo_parent_configs enabled — aucune autre école n'est affectée.
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText } from '../index.js';

// Emails tagués : le re-seed (SEED_CLASSE_DEMO.sql) supprime tout @eductrack.demo.
const DEMO_EMAIL_DOMAIN = 'eductrack.demo';

/** Normalisation tolérante du mot-clé : accents, tirets, espaces multiples. */
const normKeyword = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Mot de passe lisible basé sur le prénom de l'élève associé. */
const buildDemoPassword = (firstName) => {
  const year = new Date().getFullYear();
  const clean = String(firstName || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '').trim();
  if (!clean) return `Parent${year}`;
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() + year;
};

const welcomeMessage = ({ schoolName, student, email, password }) => [
  `🎉 *Bienvenue dans la démo ${schoolName} !*`,
  '━━━━━━━━━━━━━━━━━━━',
  '',
  `Vous êtes maintenant le parent de :`,
  `👦 *${student.first_name} ${student.last_name}*`,
  `🏫 Classe : *${student.class_name || 'CLASSE DÉMO'}*`,
  student.massar_code ? `🎓 Code Massar : ${student.massar_code}` : null,
  '',
  `🔐 *Vos identifiants d'accès (application parent) :*`,
  `📧 Email : ${email}`,
  password ? `🔑 Mot de passe : *${password}*` : `🔑 Mot de passe : celui de votre compte existant`,
  `🌐 https://etrack.ma/login`,
  '',
  `💬 Ici même sur WhatsApp, écrivez *menu* pour découvrir le chatbot :`,
  `suivi de classe, notes, absences, factures, transport…`,
  '',
  `_Ceci est un environnement de démonstration._`,
].filter((l) => l !== null).join('\n');

/**
 * Résout le parent EXACTEMENT comme le chatbot (getParentByPhone) :
 * parent_contacts (canal whatsapp) d'abord, puis profiles.phone — toujours
 * scopé à l'école. INDISPENSABLE : le parent démo doit être LE MÊME profil
 * que celui que le chatbot résoudra aux messages suivants, sinon un numéro
 * déjà connu comme parent (ancien test) recevrait « aucun enfant rattaché ».
 */
async function resolveParentByPhone(phone, schoolId) {
  const { data: contacts } = await supabaseAdmin
    .from('parent_contacts')
    .select('parent_id, parent:parent_id!inner(id, email, first_name, last_name, school_id, role)')
    .eq('phone_e164', phone)
    .eq('channel', 'whatsapp')
    .eq('parent.school_id', schoolId)
    .eq('parent.role', 'parent')
    .limit(1);
  if (contacts?.length) return contacts[0].parent;

  const { data: profs } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('role', 'parent')
    .eq('phone', phone)
    .eq('school_id', schoolId)
    .limit(1);
  return profs?.[0] || null;
}

/**
 * Point d'entrée appelé pour CHAQUE message texte entrant, AVANT
 * l'identification parent. Retourne true si le message a été consommé
 * par le mode démo (le chatbot normal ne doit alors rien faire).
 */
export async function maybeHandleDemoParent({ phone, text, schoolId, providerMessageId }) {
  if (!text || !schoolId) return false;

  // 1. Config démo de l'école (table absente ou pas de ligne → inactif)
  let cfg = null;
  try {
    const { data } = await supabaseAdmin
      .from('demo_parent_configs')
      .select('id, school_id, class_id, keyword, enabled')
      .eq('school_id', schoolId)
      .eq('enabled', true)
      .maybeSingle();
    cfg = data;
  } catch {
    return false;
  }
  if (!cfg) return false;

  // 2. Le message doit être exactement le mot-clé (tolérant)
  if (normKeyword(text) !== normKeyword(cfg.keyword || 'DEMO PARENT')) return false;

  console.log(`[demo-parent] ← ${phone} (school=${schoolId}) mot-clé reçu`);

  const { data: school } = await supabaseAdmin
    .from('schools').select('name').eq('id', schoolId).single();
  const schoolName = school?.name || 'École Démo';

  try {
    // 3. Parent résolu par téléphone (même logique que le chatbot). S'il
    // existe déjà, on RÉUTILISE ce profil (pas de doublon) : le chatbot le
    // retrouvera avec son enfant démo aux messages suivants.
    const resolved = await resolveParentByPhone(phone, schoolId);

    if (resolved) {
      // 3.a Déjà lié à un élève de la classe démo → renvoi idempotent
      const existing = await demoLinkOfParent(resolved.id, cfg.class_id);
      if (existing) {
        const password = await tryResetPassword(resolved.id, existing.first_name);
        await sendText(schoolId, phone, welcomeMessage({
          schoolName, student: existing, email: resolved.email, password,
        }), { urgent: true });
        await logIncoming({ phone, schoolId, text, providerMessageId, parentId: resolved.id });
        return true;
      }

      // 3.b Parent existant sans élève démo → lui associer l'élève suivant
      const student = await nextFreeStudent(cfg.class_id);
      if (!student) return await replyDemoFull({ schoolId, phone, schoolName, text, providerMessageId });

      const { error: linkErr } = await supabaseAdmin.from('parent_students').insert({
        parent_id: resolved.id,
        student_id: student.id,
        relationship: 'tuteur',
      });
      if (linkErr) throw linkErr;
      await ensureWhatsappContact(resolved.id, phone);

      const password = await tryResetPassword(resolved.id, student.first_name);
      console.log(`[demo-parent] ✓ (parent existant) ${phone} → ${student.first_name} ${student.last_name} (${student.massar_code})`);
      await sendText(schoolId, phone, welcomeMessage({ schoolName, student, email: resolved.email, password }), { urgent: true });
      await logIncoming({ phone, schoolId, text, providerMessageId, parentId: resolved.id });
      return true;
    }

    // 4. Numéro inconnu → élève suivant + création complète du parent
    const student = await nextFreeStudent(cfg.class_id);
    if (!student) return await replyDemoFull({ schoolId, phone, schoolName, text, providerMessageId });

    const email = `parent.demo.${(student.massar_code || student.id.slice(0, 8)).toLowerCase()}@${DEMO_EMAIL_DOMAIN}`;
    const password = buildDemoPassword(student.first_name);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: 'Parent', last_name: student.last_name, role: 'parent' },
    });
    if (authError) throw authError;
    const parentId = authData.user.id;

    const { error: profErr } = await supabaseAdmin.from('profiles').insert({
      id: parentId,
      email,
      first_name: 'Parent',
      last_name: student.last_name,
      role: 'parent',
      phone,
      school_id: schoolId,
    });
    if (profErr) throw profErr;

    await ensureWhatsappContact(parentId, phone);

    const { error: linkErr } = await supabaseAdmin.from('parent_students').insert({
      parent_id: parentId,
      student_id: student.id,
      relationship: 'tuteur',
    });
    if (linkErr) throw linkErr;

    console.log(`[demo-parent] ✓ ${phone} → ${student.first_name} ${student.last_name} (${student.massar_code})`);

    await sendText(schoolId, phone, welcomeMessage({ schoolName, student, email, password }), { urgent: true });
    await logIncoming({ phone, schoolId, text, providerMessageId, parentId });
    return true;
  } catch (e) {
    console.error('[demo-parent] Erreur onboarding:', e.message);
    await sendText(schoolId, phone,
      `⚠️ Une erreur est survenue lors de l'activation de la démo. Réessayez dans un instant.`,
      { urgent: true }).catch(() => {});
    return true; // message consommé malgré l'erreur (pas de fuite vers le chatbot normal)
  }
}

/** Élève de la classe démo déjà lié à ce parent (null si aucun). */
async function demoLinkOfParent(parentId, classId) {
  const { data: links } = await supabaseAdmin
    .from('parent_students')
    .select('student:student_id!inner(id, first_name, last_name, class_id, massar_code, classes!fk_profiles_class(name))')
    .eq('parent_id', parentId)
    .eq('student.class_id', classId)
    .limit(1);
  if (!links || links.length === 0) return null;
  const s = links[0].student;
  return { ...s, class_name: s.classes?.name || null };
}

/** Contact WhatsApp du parent : créé s'il n'existe pas déjà pour ce numéro. */
async function ensureWhatsappContact(parentId, phone) {
  const { data: existing } = await supabaseAdmin
    .from('parent_contacts')
    .select('id')
    .eq('parent_id', parentId)
    .eq('phone_e164', phone)
    .eq('channel', 'whatsapp')
    .limit(1);
  if (existing?.length) return;
  await supabaseAdmin.from('parent_contacts').insert({
    parent_id: parentId,
    phone_e164: phone,
    channel: 'whatsapp',
    is_primary: true,
    consent_status: 'pending',
    label: 'Démo',
  });
}

/**
 * Régénère le mot de passe du parent (compte auth existant). Renvoie le
 * nouveau mot de passe, ou null si le profil n'a pas de compte auth (le
 * message de bienvenue indique alors de garder ses identifiants actuels).
 */
async function tryResetPassword(parentId, studentFirstName) {
  try {
    const password = buildDemoPassword(studentFirstName);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(parentId, { password });
    return error ? null : password;
  } catch {
    return null;
  }
}

/** Réponse « démo complète » (plus d'élève libre) + log. Renvoie true. */
async function replyDemoFull({ schoolId, phone, schoolName, text, providerMessageId }) {
  await sendText(schoolId, phone,
    `🚫 *La démo est complète !*\n\nTous les élèves de la classe démo ont déjà un parent associé.\nContactez l'école *${schoolName}* pour réinitialiser la démonstration.`,
    { urgent: true });
  await logIncoming({ phone, schoolId, text, providerMessageId, parentId: null });
  return true;
}

/** Prochain élève de la classe démo sans AUCUN parent lié (ordre import_order). */
async function nextFreeStudent(classId) {
  const { data: students } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, massar_code, import_order, classes!fk_profiles_class(name)')
    .eq('class_id', classId)
    .eq('role', 'student')
    .order('import_order', { ascending: true, nullsFirst: false });
  if (!students || students.length === 0) return null;

  const { data: links } = await supabaseAdmin
    .from('parent_students')
    .select('student_id')
    .in('student_id', students.map((s) => s.id));
  const taken = new Set((links || []).map((l) => l.student_id));

  const free = students.find((s) => !taken.has(s.id));
  if (!free) return null;
  return { ...free, class_name: free.classes?.name || null };
}

/** Nombre d'élèves démo restants (pour l'endpoint QR côté admin). */
export async function demoRemainingCount(classId) {
  const { data: students } = await supabaseAdmin
    .from('profiles').select('id').eq('class_id', classId).eq('role', 'student');
  const ids = (students || []).map((s) => s.id);
  if (ids.length === 0) return { total: 0, remaining: 0 };
  const { data: links } = await supabaseAdmin
    .from('parent_students').select('student_id').in('student_id', ids);
  const taken = new Set((links || []).map((l) => l.student_id));
  return { total: ids.length, remaining: ids.filter((id) => !taken.has(id)).length };
}

/** Journalise le message entrant comme traité (déduplication + historique). */
async function logIncoming({ phone, schoolId, text, providerMessageId, parentId }) {
  try {
    await supabaseAdmin.from('whatsapp_incoming_messages').insert({
      phone_e164: phone,
      parent_id: parentId,
      school_id: schoolId,
      message_text: text,
      provider_message_id: providerMessageId,
      processed: true,
    });
  } catch (e) {
    console.warn('[demo-parent] log incoming échoué:', e.message);
  }
}
