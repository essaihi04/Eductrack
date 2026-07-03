/**
 * State machine du chatbot.
 *
 * État par (école, téléphone) — en mémoire process, reset au restart.
 * La clé composite est indispensable : un même parent peut écrire aux
 * numéros WhatsApp de deux écoles associées (ex. primaire + collège) ;
 * avec une clé par téléphone seul, les deux conversations partageraient
 * le même état (enfant sélectionné, menu en cours) et se croiseraient.
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

// `schoolId:phone` -> { state, currentMenu, studentId, lastActivity, parentId, schoolId }
const states = new Map();

function now() { return Date.now(); }

function stateKey(schoolId, phone) {
  return `${schoolId}:${phone}`;
}

export function getState(schoolId, phone) {
  const key = stateKey(schoolId, phone);
  const s = states.get(key);
  if (!s) return null;
  if (now() - s.lastActivity > STATE_TTL_MS) {
    states.delete(key);
    return null;
  }
  return s;
}

export function setState(schoolId, phone, patch) {
  const key = stateKey(schoolId, phone);
  const existing = states.get(key) || {};
  const merged = { ...existing, ...patch, lastActivity: now() };
  states.set(key, merged);
  return merged;
}

export function resetState(schoolId, phone) {
  states.delete(stateKey(schoolId, phone));
}

export function setMenu(schoolId, phone, menuId) {
  return setState(schoolId, phone, { state: 'MENU', currentMenu: menuId });
}

export function setChildSelection(schoolId, phone) {
  return setState(schoolId, phone, { state: 'CHILD' });
}

export function setAIMode(schoolId, phone) {
  return setState(schoolId, phone, { state: 'AI' });
}

/** Mode vote sondage : file d'attente de sondages à présenter un par un. */
export function setPollVoting(schoolId, phone, pollQueue) {
  return setState(schoolId, phone, { state: 'POLL', pollQueue, pollIndex: 0 });
}

export function selectStudent(schoolId, phone, studentId) {
  return setState(schoolId, phone, { studentId, state: 'MENU', currentMenu: 'main' });
}

// Stats (debug / monitoring)
export function getActiveStatesCount() {
  return states.size;
}
