/**
 * Vérification « ce numéro existe-t-il sur WhatsApp ? » avec cache persistant.
 *
 * POURQUOI C'EST LA PROTECTION ANTI-BAN LA PLUS RENTABLE
 * ------------------------------------------------------
 * Le classement anti-spam de Meta pèse très lourdement le taux de messages
 * envoyés à des comptes inexistants : un humain n'écrit pas à des numéros qui
 * ne sont pas sur WhatsApp, un automate qui déverse une liste importée si.
 * Les numéros des parents sont saisis à la main (fautes de frappe, lignes
 * fixes, numéros résiliés) — sans filtre, chaque campagne envoie une part de
 * messages dans le vide et dégrade la réputation du numéro de l'école.
 *
 * `checkNumberExists` existait déjà dans baileysClient.js mais n'était appelé
 * nulle part.
 *
 * DEUX PIÈGES ÉVITÉS ICI
 * ----------------------
 * 1. Interroger WhatsApp pour des centaines de numéros d'affilée est
 *    lui-même un signal (énumération de contacts). D'où : cache permanent en
 *    base + intervalle minimum entre deux interrogations réseau.
 * 2. En cas d'échec de la vérification (session instable, timeout), on
 *    N'EMPÊCHE PAS l'envoi. Un doute ne doit jamais priver un parent de son
 *    message : on renvoie `null` (inconnu) et l'appelant envoie quand même.
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { getSocket, phoneToJid } from './baileysClient.js';

// Cache mémoire : évite un aller-retour Supabase par envoi.
const memCache = new Map(); // phone_e164 -> { exists: bool, at: number }

// Un numéro peut être créé sur WhatsApp après coup : on repose la question
// aux numéros « absents » au bout de 60 jours, jamais aux numéros valides.
const NEGATIVE_TTL_MS = 60 * 24 * 3600 * 1000;

// Intervalle minimum entre deux interrogations RÉSEAU (les réponses en cache
// ne sont pas concernées). Casse le motif d'énumération sur une liste
// fraîchement importée où rien n'est encore connu.
const MIN_LOOKUP_GAP_MS = 3_000;
const MAX_LOOKUP_JITTER_MS = 5_000;
let lastLookupAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @returns {Promise<boolean|null>} true = sur WhatsApp, false = absent,
 *          null = indéterminé (ne jamais bloquer l'envoi sur un null).
 */
export async function isOnWhatsApp(schoolId, phone) {
  if (!phone) return null;
  const e164 = String(phone).startsWith('+') ? String(phone) : `+${String(phone).replace(/\D/g, '')}`;

  const cached = memCache.get(e164);
  if (cached && (cached.exists || Date.now() - cached.at < NEGATIVE_TTL_MS)) {
    return cached.exists;
  }

  // Cache partagé en base (survit aux redéploiements)
  try {
    const { data } = await supabaseAdmin
      .from('whatsapp_number_checks')
      .select('exists_on_whatsapp, checked_at')
      .eq('phone_e164', e164)
      .maybeSingle();
    if (data) {
      const at = new Date(data.checked_at).getTime();
      if (data.exists_on_whatsapp || Date.now() - at < NEGATIVE_TTL_MS) {
        memCache.set(e164, { exists: data.exists_on_whatsapp, at });
        return data.exists_on_whatsapp;
      }
    }
  } catch {
    // Table absente (migration pas encore jouée) : on continue sans cache.
  }

  const sock = getSocket(schoolId);
  if (!sock) return null;

  // Étale les interrogations réseau.
  const gap = Date.now() - lastLookupAt;
  const wanted = MIN_LOOKUP_GAP_MS + Math.random() * MAX_LOOKUP_JITTER_MS;
  if (gap < wanted) await sleep(wanted - gap);
  lastLookupAt = Date.now();

  let exists;
  try {
    const [result] = await sock.onWhatsApp(phoneToJid(e164));
    exists = !!result?.exists;
  } catch (e) {
    console.warn(`[wa-check] ${e164} : vérification impossible (${e.message}) — envoi tenté quand même`);
    return null;
  }

  memCache.set(e164, { exists, at: Date.now() });
  try {
    await supabaseAdmin
      .from('whatsapp_number_checks')
      .upsert({
        phone_e164: e164,
        exists_on_whatsapp: exists,
        checked_at: new Date().toISOString(),
      }, { onConflict: 'phone_e164' });
  } catch {
    // Cache en base indisponible : le cache mémoire suffit pour la campagne.
  }

  if (!exists) console.log(`[wa-check] ${e164} n'est pas sur WhatsApp — envoi évité`);
  return exists;
}

/** Vide le cache mémoire d'un numéro (après correction d'une fiche parent). */
export function forgetNumber(phone) {
  if (phone) memCache.delete(String(phone).startsWith('+') ? phone : `+${phone}`);
}
