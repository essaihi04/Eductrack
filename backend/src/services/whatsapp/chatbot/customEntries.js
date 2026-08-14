/**
 * Contenus ajoutés par l'administration au chatbot (texte, image, PDF).
 *
 * Trois expositions possibles, combinables sur une même entrée :
 *   - show_in_menu : une ligne supplémentaire dans le menu choisi ;
 *   - keywords     : envoi automatique dès qu'un parent écrit un mot-clé ;
 *   - use_for_ai   : le texte alimente le contexte des réponses en question libre.
 *
 * Les identifiants d'option en menu sont préfixés « c » (c1, c2…) pour ne
 * jamais entrer en collision avec les options natives numérotées.
 */
import { supabaseAdmin } from '../../../config/supabase.js';
import { norm } from '../../timetableImport/normalize.js';
import { isMissingTableError } from './capabilities.js';

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // schoolId -> { entries, expiresAt }

/** Entrées actives de l'école, triées pour un affichage stable. */
export async function loadCustomEntries(schoolId) {
  if (!schoolId) return [];

  const hit = cache.get(schoolId);
  if (hit && hit.expiresAt > Date.now()) return hit.entries;

  let entries = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('chatbot_custom_entries')
      .select('*')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('menu_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    entries = data || [];
  } catch (e) {
    // Table absente (migration non exécutée) : le chatbot fonctionne sans.
    if (!isMissingTableError(e)) {
      console.warn('[chatbot] lecture des contenus personnalisés échouée:', e.message);
    }
  }

  cache.set(schoolId, { entries, expiresAt: Date.now() + CACHE_TTL_MS });
  return entries;
}

export function invalidateCustomEntriesCache(schoolId) {
  if (schoolId) cache.delete(schoolId);
  else cache.clear();
}

/** Options de menu à ajouter à un menu donné : [{ id, emoji, label, entry }]. */
export async function customOptionsForMenu(schoolId, menuId) {
  const entries = await loadCustomEntries(schoolId);
  return entries
    .filter((e) => e.show_in_menu && e.menu_id === menuId)
    .map((e, i) => ({
      id: `c${i + 1}`,
      emoji: e.emoji || '📌',
      label: e.title,
      action: `custom:${e.id}`,
    }));
}

export async function findCustomEntry(schoolId, entryId) {
  const entries = await loadCustomEntries(schoolId);
  return entries.find((e) => e.id === entryId) || null;
}

/**
 * Entrée déclenchée par le message d'un parent, ou null.
 * On compare sur la forme normalisée (sans accents ni ponctuation) et on exige
 * un mot-clé d'au moins 3 caractères pour éviter les déclenchements parasites.
 */
export async function matchCustomEntryByKeyword(schoolId, text) {
  const message = norm(text);
  if (!message) return null;

  const entries = await loadCustomEntries(schoolId);
  for (const entry of entries) {
    for (const keyword of entry.keywords || []) {
      const k = norm(keyword);
      if (k.length < 3) continue;
      // Mot entier ou expression présente dans le message.
      const boundary = new RegExp(`(^| )${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
      if (boundary.test(message)) return entry;
    }
  }
  return null;
}

/**
 * Bloc de connaissance à injecter dans le contexte du LLM, ou null.
 * Seules les entrées marquées `use_for_ai` et porteuses de texte sont reprises.
 */
export async function customKnowledgeForAi(schoolId) {
  const entries = await loadCustomEntries(schoolId);
  const usable = entries.filter((e) => e.use_for_ai && e.body_text);
  if (usable.length === 0) return null;

  return usable
    .map((e) => `— ${e.title} : ${String(e.body_text).slice(0, 1200)}`)
    .join('\n');
}
