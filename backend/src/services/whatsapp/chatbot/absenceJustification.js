/**
 * Justification d'absence par WhatsApp.
 *
 * Quand un parent répond à une notification d'absence :
 *  - il a forcément vu l'absence → on marque `seen_by_parent = true` ;
 *  - DeepSeek analyse le texte pour savoir si c'est une justification et en
 *    extraire le motif → on renseigne `justified` + `justification_comment`
 *    (source = 'ai'). Le staff peut toujours corriger manuellement ensuite.
 *
 * Rattaché aux absences RÉCENTES et NON traitées des enfants du parent.
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '../../../config/supabase.js';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
});

/** Absences des enfants du parent sur une fenêtre (par défaut 60 jours). */
export async function getRecentAbsences(parentId, days = 60) {
  const { data: links } = await supabaseAdmin
    .from('parent_students')
    .select('student_id')
    .eq('parent_id', parentId);
  const studentIds = [...new Set((links || []).map((l) => l.student_id).filter(Boolean))];
  if (studentIds.length === 0) return { absences: [], studentIds: [] };

  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const { data: rows } = await supabaseAdmin
    .from('session_tracking')
    .select('id, student_id, justified, seen_by_parent, sessions!inner(date)')
    .eq('presence', 'absent')
    .in('student_id', studentIds)
    .gte('sessions.date', since);
  return { absences: rows || [], studentIds };
}

/** Marque « vue » (le parent a répondu, il a donc vu l'absence). */
async function markSeen(ids) {
  if (!ids || ids.length === 0) return;
  await supabaseAdmin
    .from('session_tracking')
    .update({ seen_by_parent: true, seen_at: new Date().toISOString() })
    .in('id', ids)
    .eq('seen_by_parent', false);
}

/** Analyse DeepSeek : le message est-il une justification ? Motif ? Enfant ? */
async function analyzeJustification({ text, childNames }) {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  const sys = `Tu analyses le message d'un parent qui répond à une notification d'absence de son enfant à l'école. Le message peut être en français, en arabe standard ou en darija marocaine (éventuellement en lettres latines/arabizi).
Réponds STRICTEMENT en JSON, sans texte autour :
{"is_justification": boolean, "justified": boolean, "reason": "motif NORMALISÉ EN FRANÇAIS (max 10 mots)", "child": "prénom mentionné ou vide"}
Règles :
- is_justification = true si le parent explique/justifie l'absence, envoie un motif, ou répond au sujet de cette absence (maladie, rendez-vous médical, voyage, raison familiale, décès, urgence, certificat…). false s'il pose une question sans rapport ou demande le menu.
- justified = true si le motif est une justification recevable ; false si le parent dit que l'enfant était présent / que c'est une erreur / refuse de justifier.
- reason = motif TOUJOURS traduit et résumé EN FRANÇAIS, jamais le texte brut du parent, jamais en arabe/darija. Exemples : "Maladie", "Rendez-vous médical", "Raison familiale", "Voyage", "Décès dans la famille", "Fièvre". Si is_justification est false, reason doit être "".`;
  try {
    const c = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: sys },
        childNames && childNames.length ? { role: 'system', content: `Enfants concernés : ${childNames.join(', ')}` } : null,
        { role: 'user', content: String(text || '').slice(0, 500) },
      ].filter(Boolean),
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    });
    const raw = c.choices[0]?.message?.content?.trim();
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('[absenceJustif] DeepSeek:', e.message);
    return null;
  }
}

/**
 * Tente de traiter un message entrant comme réponse à une absence.
 * @returns {Promise<{handled:boolean, reply?:string}>}
 *  - handled=true → le message a été consommé (justification enregistrée),
 *    l'appelant doit envoyer `reply` et s'arrêter.
 *  - handled=false → laisser le flux chatbot normal continuer (le « vu » a
 *    quand même pu être marqué s'il y avait des absences récentes).
 */
export async function handleAbsenceReply({ parentInfo, text }) {
  const { absences } = await getRecentAbsences(parentInfo.parent_id, 60);
  if (absences.length === 0) return { handled: false };

  // « Vue » : le parent répond → il a vu la/les notification(s) récente(s)
  // (absences des 3 derniers jours).
  const recentCutoff = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
  await markSeen(absences.filter((a) => (a.sessions?.date || '') >= recentCutoff).map((a) => a.id));

  // N'analyse que s'il reste des absences non traitées (justified NULL).
  const pending = absences.filter((a) => a.justified === null || a.justified === undefined);
  if (pending.length === 0) return { handled: false };

  const childIds = [...new Set(pending.map((a) => a.student_id))];
  const { data: kids } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name')
    .in('id', childIds);

  const analysis = await analyzeJustification({ text, childNames: (kids || []).map((k) => k.first_name) });
  if (!analysis || analysis.is_justification !== true) return { handled: false };

  // Cible : enfant nommé si détecté, sinon toutes les absences en attente.
  let targetIds = pending.map((a) => a.id);
  if (analysis.child) {
    const kid = (kids || []).find((k) => (k.first_name || '').toLowerCase() === String(analysis.child).toLowerCase());
    if (kid) {
      const filtered = pending.filter((a) => a.student_id === kid.id).map((a) => a.id);
      if (filtered.length) targetIds = filtered;
    }
  }

  // On stocke UNIQUEMENT le motif normalisé en français par l'IA — jamais le
  // texte brut du parent (qui peut être en arabe/darija).
  const reasonFr = (analysis.reason && analysis.reason.trim())
    || (analysis.justified === true ? 'Justification reçue (motif non précisé)' : 'Réponse du parent enregistrée');
  await supabaseAdmin
    .from('session_tracking')
    .update({
      justified: analysis.justified === true,
      justification_comment: reasonFr,
      justification_source: 'ai',
      seen_by_parent: true,
      seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', targetIds);

  const reply = analysis.justified === true
    ? `✅ Merci, votre justification a bien été enregistrée${analysis.reason ? ` : *${analysis.reason}*` : ''}. L'établissement en est informé.`
    : `✅ Votre message concernant l'absence a bien été transmis à l'établissement.`;
  return { handled: true, reply };
}
