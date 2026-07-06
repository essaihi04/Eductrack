// Notifications push NATIVES (app Capacitor Android/iOS via FCM).
// Sur navigateur/PWA, c'est le Web Push (pushClient.js) qui prend le relais ;
// ici on ne gère que le cas app installée, où le service worker web ne reçoit
// jamais de push en arrière-plan (WebView). On enregistre un jeton d'appareil
// FCM que le backend utilise pour faire sonner le téléphone, app fermée.
import { Capacitor } from '@capacitor/core';
import { pushApi } from './transportApi';

export const isNativePush = () => Capacitor?.isNativePlatform?.() === true;

let listenersReady = false;
let lastToken = null;

async function loadPlugin() {
  const mod = await import('@capacitor/push-notifications');
  return mod.PushNotifications;
}

async function setupListeners(PushNotifications) {
  if (listenersReady) return;
  listenersReady = true;

  // Jeton d'appareil reçu → on l'envoie au backend (table device_tokens).
  PushNotifications.addListener('registration', async (token) => {
    lastToken = token.value;
    try {
      await pushApi.registerDeviceToken(token.value, Capacitor.getPlatform());
    } catch (e) {
      console.error('[nativePush] enregistrement du jeton échoué:', e?.message || e);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[nativePush] registrationError:', err?.error || err);
  });

  // Tap sur la notification (app en arrière-plan) → ouvrir l'écran ciblé.
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = action?.notification?.data?.url;
    if (url && typeof url === 'string') {
      // SPA chargée depuis etrack.ma : un simple changement d'URL suffit.
      window.location.href = url.startsWith('http') ? url : url;
    }
  });
}

/**
 * Demande la permission (si nécessaire) et enregistre l'appareil.
 * Déclenché par le bouton du bandeau. Retourne true si la permission est accordée.
 */
export async function enableNativePush() {
  if (!isNativePush()) return false;
  const PushNotifications = await loadPlugin();
  await setupListeners(PushNotifications);

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return false;

  await PushNotifications.register(); // → déclenche l'évènement 'registration'
  return true;
}

/**
 * Au démarrage (après login) sur l'app installée :
 *  - permission jamais demandée  → on l'affiche automatiquement (1ʳᵉ ouverture) ;
 *  - permission accordée         → on (re)enregistre l'appareil (rafraîchit le jeton) ;
 *  - permission refusée          → rien (l'utilisateur devra l'activer dans les réglages).
 */
export async function ensureNativePushRegistered() {
  if (!isNativePush()) return;
  try {
    const PushNotifications = await loadPlugin();
    await setupListeners(PushNotifications);
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions(); // pop-up système
    }
    if (perm.receive === 'granted') await PushNotifications.register();
  } catch (e) {
    console.error('[nativePush] ensureRegistered:', e?.message || e);
  }
}

/** État de la permission native pour le bandeau : 'granted' | 'denied' | 'prompt' | 'unsupported'. */
export async function nativePushState() {
  if (!isNativePush()) return 'unsupported';
  try {
    const PushNotifications = await loadPlugin();
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'granted') return 'granted';
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** Désenregistre le jeton courant (déconnexion). */
export async function disableNativePush() {
  if (!isNativePush() || !lastToken) return;
  try { await pushApi.removeDeviceToken(lastToken); } catch { /* ignore */ }
}
