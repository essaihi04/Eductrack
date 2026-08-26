/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  INTERRUPTEUR GLOBAL DES ENVOIS WHATSAPP (notifications sortantes)    ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  ACTIVÉ : tous les envois WhatsApp initiés par l'application          ║
 * ║  (absences, notes, factures, devoirs, communications, rapports        ║
 * ║  quotidiens, transport, approbations, envois manuels du hub) passent. ║
 * ║  Pour COUPER : WA_OUTBOUND=off en env, ou DEFAULT_ENABLED=false.      ║
 * ║                                                                        ║
 * ║  ✅ Le CHATBOT reste fonctionnel : toute réponse envoyée pendant le    ║
 * ║  traitement d'un message ENTRANT (parent/réceptionniste qui écrit au  ║
 * ║  numéro de l'école) passe toujours — le contexte est propagé par      ║
 * ║  AsyncLocalStorage depuis les handlers d'entrée du chatbot.           ║
 * ║                                                                        ║
 * ║  ── POUR COUPER LES NOTIFICATIONS ──                                   ║
 * ║  Option 1 : variable d'environnement  WA_OUTBOUND=off (puis redémarrer)║
 * ║  Option 2 : passer DEFAULT_ENABLED à false ci-dessous                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { AsyncLocalStorage } from 'async_hooks';

// ← Interrupteur : mettre à false pour couper toutes les notifications.
const DEFAULT_ENABLED = true;

export const WA_OUTBOUND_ENABLED =
  process.env.WA_OUTBOUND === 'on' ? true
  : process.env.WA_OUTBOUND === 'off' ? false
  : DEFAULT_ENABLED;

export const OUTBOUND_DISABLED_MESSAGE =
  'Envois WhatsApp temporairement désactivés (interrupteur WA_OUTBOUND) — seules les réponses du chatbot sont actives.';

// Contexte « chatbot » : posé au traitement d'un message entrant, il se
// propage automatiquement à travers tous les await / setTimeout imbriqués.
const als = new AsyncLocalStorage();

/** Exécute fn avec le contexte chatbot actif (réponses autorisées). */
export const runAsChatbot = (fn) => als.run({ chatbot: true }, fn);

/** True si on est dans le traitement d'un message entrant du chatbot. */
export const isChatbotContext = () => als.getStore()?.chatbot === true;

/**
 * Exécute fn dans le contexte « campagne ».
 *
 * Sert uniquement à la journalisation : une campagne a déjà sa trace dans
 * whatsapp_messages / whatsapp_message_recipients, la rejournaliser dans le
 * journal des envois l'afficherait DEUX FOIS dans le fil de conversation.
 * Tout ce qui n'est ni chatbot ni campagne (absences, notes, transport,
 * rendez-vous…) doit en revanche être journalisé : sans cela, l'école ne voit
 * jamais dans la boîte de réception ce que l'application a envoyé au parent.
 */
export const runAsCampaign = (fn) => als.run({ campaign: true }, fn);

/** True si l'envoi appartient à une campagne déjà tracée ailleurs. */
export const isCampaignContext = () => als.getStore()?.campaign === true;

/** Libellé de la source, pour le journal des envois. */
export const outgoingSource = () => (isChatbotContext() ? 'chatbot' : 'notification');

/** True si CET envoi doit être bloqué (notification hors chatbot). */
export const isOutboundBlocked = () => !WA_OUTBOUND_ENABLED && !isChatbotContext();
