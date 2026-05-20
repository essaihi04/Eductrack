/**
 * Anti-ban middleware pour Baileys.
 *
 * Implémente les bonnes pratiques pour réduire le risque de ban WhatsApp :
 *  - Rate limit humain (délai aléatoire 8–20 s, distribution gaussienne)
 *  - Quota journalier par numéro avec warm-up progressif
 *  - Respect des horaires (pas d'envoi 22h–7h sauf urgence)
 *  - Indicateur "typing…" avant l'envoi
 *  - Variation de contenu (insertion zero-width / ponctuation)
 *  - Détection erreurs WhatsApp (timelock 463) → pause forcée
 *
 * ⚠️ Aucune solution n'est 100 % efficace. Cette couche réduit fortement
 * le risque mais l'utilisateur doit aussi :
 *   - Utiliser des numéros réels (pas VOIP)
 *   - Avoir l'opt-in explicite des destinataires
 *   - Permettre un STOP (déjà géré côté chatbot)
 *   - Surveiller les blocs (block rate < 5%)
 */

import { supabaseAdmin } from '../../config/supabase.js';

// ───── Configuration ─────────────────────────────────────────────────────
const CONFIG = {
  // Délai entre 2 messages (gaussienne tronquée)
  MIN_DELAY_MS: 8_000,
  MAX_DELAY_MS: 20_000,
  // Présence "typing…" avant envoi
  TYPING_MIN_MS: 1_500,
  TYPING_MAX_MS: 4_000,
  // Quota journalier — DÉSACTIVÉ (numéros déjà chauffés en production).
  // La protection anti-ban repose uniquement sur :
  //   - le délai humain entre messages (waitHumanDelay)
  //   - la pause forcée après erreur grave (timelock 463, 401, 403)
  //   - la variation de contenu (zero-width space)
  // Si besoin de réactiver le warm-up, mettre ENABLE_DAILY_QUOTA à true.
  ENABLE_DAILY_QUOTA: false,
  WARMUP_DAYS: [80, 150, 250, 400, 600, 800, 1000],
  STEADY_DAILY_LIMIT: 1000,
  // Plage horaire autorisée (heure locale école, 24h)
  ALLOWED_HOUR_START: 7,
  ALLOWED_HOUR_END: 21,   // dernière heure d'envoi : 20:59
  // Pause après timelock (erreur 463)
  TIMELOCK_PAUSE_MS: 60 * 60 * 1000, // 1h
};

// État en mémoire par session (school_id) — survit tant que le process tourne
// Pour multi-instance, à externaliser en Redis.
const sessionState = new Map(); // school_id -> { lastSendAt, sentToday, dayStart, pausedUntil, dayCount, warmupStart }

const getState = (schoolId) => {
  if (!sessionState.has(schoolId)) {
    sessionState.set(schoolId, {
      lastSendAt: 0,
      sentToday: 0,
      dayStart: startOfToday(),
      pausedUntil: 0,
      warmupStart: null, // chargé depuis DB
    });
  }
  return sessionState.get(schoolId);
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const rollDayIfNeeded = (state) => {
  const today = startOfToday();
  if (state.dayStart < today) {
    state.dayStart = today;
    state.sentToday = 0;
  }
};

// ───── Délai humain (gaussienne tronquée) ─────────────────────────────────
const gaussianRandom = (min, max) => {
  // Box–Muller, 2 itérations pour distribution plus naturelle
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  // Rescale ~[-3, 3] vers [min, max] avec mode autour de la médiane
  n = Math.max(-3, Math.min(3, n));
  const mid = (min + max) / 2;
  const half = (max - min) / 2;
  return Math.round(mid + (n / 3) * half);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───── Warm-up : récupère le quota journalier autorisé ─────────────────────
async function getDailyLimit(schoolId) {
  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('warmup_started_at, daily_limit_override')
    .eq('school_id', schoolId)
    .single();

  if (data?.daily_limit_override) return data.daily_limit_override;

  if (!data?.warmup_started_at) return CONFIG.WARMUP_DAYS[0]; // J1

  const startedAt = new Date(data.warmup_started_at);
  const days = Math.floor((Date.now() - startedAt.getTime()) / (24 * 3600 * 1000));
  if (days < 0) return CONFIG.WARMUP_DAYS[0];
  if (days >= CONFIG.WARMUP_DAYS.length) return CONFIG.STEADY_DAILY_LIMIT;
  return CONFIG.WARMUP_DAYS[days];
}

// ───── Compteur DB pour persistance multi-restart ─────────────────────────
async function incrementDbCounter(schoolId) {
  // Stocke dans whatsapp_quota_daily (school_id, date, sent_count)
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_quota_daily')
    .select('sent_count')
    .eq('school_id', schoolId)
    .eq('day', today)
    .single();

  if (existing) {
    await supabaseAdmin
      .from('whatsapp_quota_daily')
      .update({ sent_count: existing.sent_count + 1 })
      .eq('school_id', schoolId)
      .eq('day', today);
    return existing.sent_count + 1;
  } else {
    await supabaseAdmin
      .from('whatsapp_quota_daily')
      .insert({ school_id: schoolId, day: today, sent_count: 1 });
    return 1;
  }
}

async function getDbCount(schoolId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from('whatsapp_quota_daily')
    .select('sent_count')
    .eq('school_id', schoolId)
    .eq('day', today)
    .single();
  return data?.sent_count || 0;
}

// ───── Fenêtre horaire ────────────────────────────────────────────────────
function isWithinAllowedHours(urgent = false) {
  if (urgent) return true;
  const h = new Date().getHours();
  return h >= CONFIG.ALLOWED_HOUR_START && h < CONFIG.ALLOWED_HOUR_END;
}

// ───── Variation de contenu ───────────────────────────────────────────────
// Insère un caractère zero-width invisible à une position aléatoire pour éviter
// que 1000 messages identiques soient détectés comme spam.
function varyContent(text) {
  if (!text || typeof text !== 'string' || text.length < 10) return text;
  const ZWSP = '\u200B'; // zero-width space, invisible
  const pos = Math.floor(Math.random() * (text.length - 2)) + 1;
  return text.slice(0, pos) + ZWSP + text.slice(pos);
}

// ───── API publique ──────────────────────────────────────────────────────

/**
 * Vérifie qu'un envoi est autorisé. Retourne { allowed, reason, waitMs? }.
 */
export async function checkAllowed(schoolId, { urgent = false } = {}) {
  const state = getState(schoolId);
  rollDayIfNeeded(state);

  // Pause active (ex. après timelock 463)
  if (state.pausedUntil > Date.now()) {
    return {
      allowed: false,
      reason: 'paused',
      message: `Session en pause anti-ban jusqu'à ${new Date(state.pausedUntil).toISOString()}`,
      waitMs: state.pausedUntil - Date.now(),
    };
  }

  // Horaires
  if (!isWithinAllowedHours(urgent)) {
    return {
      allowed: false,
      reason: 'out_of_hours',
      message: `Envoi hors plage autorisée (${CONFIG.ALLOWED_HOUR_START}h–${CONFIG.ALLOWED_HOUR_END}h). Reporté.`,
    };
  }

  // Quota journalier — désactivé via CONFIG.ENABLE_DAILY_QUOTA.
  // Les numéros utilisés en production sont déjà chauffés ; le rate-limiting
  // se fait uniquement via le délai humain entre messages (waitHumanDelay).
  if (!CONFIG.ENABLE_DAILY_QUOTA) {
    return { allowed: true };
  }

  const limit = await getDailyLimit(schoolId);
  const dbCount = await getDbCount(schoolId);
  if (dbCount >= limit) {
    if (urgent) {
      console.warn(`[anti-ban] Quota dépassé (${dbCount}/${limit}) mais message urgent → autorisé`);
      return { allowed: true, dbCount, limit, overQuota: true };
    }
    return {
      allowed: false,
      reason: 'daily_quota_exceeded',
      message: `Quota journalier atteint : ${dbCount}/${limit}. Warm-up en cours.`,
    };
  }

  return { allowed: true, dbCount, limit };
}

/**
 * Applique le délai humain depuis le dernier envoi de cette session.
 * Doit être appelé juste avant `sock.sendMessage`.
 */
export async function waitHumanDelay(schoolId) {
  const state = getState(schoolId);
  const elapsed = Date.now() - state.lastSendAt;
  const target = gaussianRandom(CONFIG.MIN_DELAY_MS, CONFIG.MAX_DELAY_MS);
  const remaining = target - elapsed;
  if (remaining > 0) {
    await sleep(remaining);
  }
}

/**
 * Simule l'indicateur "typing…" pendant 1.5–4 s puis revient à 'paused'.
 * Doit être appelé juste avant l'envoi.
 */
export async function simulateTyping(sock, jid) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    const dur = gaussianRandom(CONFIG.TYPING_MIN_MS, CONFIG.TYPING_MAX_MS);
    await sleep(dur);
    await sock.sendPresenceUpdate('paused', jid);
  } catch (e) {
    // presence non critique
  }
}

/**
 * Marque un envoi réussi (incrémente compteurs).
 */
export async function recordSent(schoolId) {
  const state = getState(schoolId);
  state.lastSendAt = Date.now();
  state.sentToday += 1;
  await incrementDbCounter(schoolId);
}

/**
 * Signale une erreur WhatsApp grave → pause la session.
 * À appeler quand on reçoit une erreur 463 (timelock), 401, 403…
 */
export function pauseSession(schoolId, reason, durationMs = CONFIG.TIMELOCK_PAUSE_MS) {
  const state = getState(schoolId);
  state.pausedUntil = Date.now() + durationMs;
  console.warn(`[anti-ban] Session ${schoolId} en pause ${durationMs}ms (raison: ${reason})`);
}

/**
 * Variation de contenu (à appeler sur le texte avant envoi).
 */
export function processOutgoingText(text) {
  return varyContent(text);
}

/**
 * Démarre / reset le warm-up pour une école (appelé à la 1re connexion).
 */
export async function ensureWarmupStarted(schoolId) {
  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('warmup_started_at')
    .eq('school_id', schoolId)
    .single();
  if (!data?.warmup_started_at) {
    await supabaseAdmin
      .from('whatsapp_school_sessions')
      .update({ warmup_started_at: new Date().toISOString() })
      .eq('school_id', schoolId);
  }
}

/**
 * Stats anti-ban pour un dashboard admin.
 */
export async function getStats(schoolId) {
  const state = getState(schoolId);
  const limit = await getDailyLimit(schoolId);
  const dbCount = await getDbCount(schoolId);
  return {
    sent_today: dbCount,
    daily_limit: limit,
    remaining: Math.max(0, limit - dbCount),
    paused_until: state.pausedUntil > Date.now() ? new Date(state.pausedUntil).toISOString() : null,
    last_send_at: state.lastSendAt ? new Date(state.lastSendAt).toISOString() : null,
  };
}

export const ANTI_BAN_CONFIG = CONFIG;
