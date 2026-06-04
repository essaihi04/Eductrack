/**
 * State machine du chatbot.
 *
 * État par téléphone (en mémoire process — reset au restart).
 * Pour multi-instance / persistance, à externaliser dans Supabase.
 *
 * États possibles :
 *  - IDLE        : pas d'interaction récente → afficher menu principal
 *  - CHILD       : attente sélection enfant (parent multi-enfants)
 *  - MENU        : dans un menu (main / pedagogy / finance)
 *  - AI          : mode question libre → forward DeepSeek
 *
 * Le state expire après 30 min d'inactivité.
 */

const STATE_TTL_MS = 30 * 60 * 1000;

// phone -> { state, currentMenu, studentId, lastActivity, parentId, schoolId }
const states = new Map();

function now() { return Date.now(); }

export function getState(phone) {
  const s = states.get(phone);
  if (!s) return null;
  if (now() - s.lastActivity > STATE_TTL_MS) {
    states.delete(phone);
    return null;
  }
  return s;
}

export function setState(phone, patch) {
  const existing = states.get(phone) || {};
  const merged = { ...existing, ...patch, lastActivity: now() };
  states.set(phone, merged);
  return merged;
}

export function resetState(phone) {
  states.delete(phone);
}

export function setMenu(phone, menuId) {
  return setState(phone, { state: 'MENU', currentMenu: menuId });
}

export function setChildSelection(phone) {
  return setState(phone, { state: 'CHILD' });
}

export function setAIMode(phone) {
  return setState(phone, { state: 'AI' });
}

/** Mode vote sondage : file d'attente de sondages à présenter un par un. */
export function setPollVoting(phone, pollQueue) {
  return setState(phone, { state: 'POLL', pollQueue, pollIndex: 0 });
}

export function selectStudent(phone, studentId) {
  return setState(phone, { studentId, state: 'MENU', currentMenu: 'main' });
}

// Stats (debug / monitoring)
export function getActiveStatesCount() {
  return states.size;
}
