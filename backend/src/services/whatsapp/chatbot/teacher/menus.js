/**
 * Menus du chatbot ENSEIGNANT.
 *
 * Même format que les menus parents (`chatbot/menus.js`) : on réutilise
 * directement `sendMenu` et `matchMenuOption` pour bénéficier du rendu liste
 * cliquable de l'API Cloud et du repli texte numéroté.
 *
 * Phase 1 : CONSULTATION uniquement. Aucune option n'écrit en base.
 */

export const TEACHER_MAIN_MENU = {
  id: 'tmain',
  title: 'Espace enseignant 👨‍🏫',
  description: 'Que souhaitez-vous consulter ?',
  options: [
    { id: '1', emoji: '📅', label: 'Ma journée',              action: 'today' },
    { id: '2', emoji: '🏫', label: 'Mes classes',             action: 'classes' },
    { id: '3', emoji: '🎓', label: 'Chercher un élève',       action: 'student' },
    { id: '4', emoji: '✍️', label: 'Devoirs en cours',        action: 'homework' },
    { id: '5', emoji: '📋', label: 'Mes contrôles',           action: 'controls' },
    { id: '6', emoji: '📆', label: 'Rendez-vous parents',     action: 'appointments' },
    { id: '7', emoji: '🗓️', label: 'Mon emploi du temps',    action: 'timetable' },
  ],
};

/**
 * Menu de choix d'espace, pour un numéro qui est À LA FOIS professeur et
 * parent d'un élève de l'école. Sans lui, le chatbot parent capturerait tous
 * les messages et l'espace enseignant serait inatteignable.
 */
export const SPACE_MENU = {
  id: 'tspace',
  title: 'Vous avez deux espaces 👋',
  description: 'Choisissez celui que vous souhaitez utiliser.',
  options: [
    { id: '1', emoji: '👨‍🏫', label: 'Espace enseignant', action: 'space:teacher' },
    { id: '2', emoji: '👨‍👩‍👧', label: 'Espace parent',   action: 'space:parent' },
  ],
};

/** Rappel affiché après chaque réponse. */
export const TEACHER_FOOTER = `_Tapez *menu* pour revenir aux options._`;
