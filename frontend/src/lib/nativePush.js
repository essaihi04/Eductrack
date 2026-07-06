// Notifications push NATIVES (app Capacitor Android/iOS via FCM).
// Sur navigateur/PWA, c'est le Web Push (pushClient.js) qui prend le relais ;
// ici on ne gère que le cas app installée, où le service worker web ne reçoit
// jamais de push en arrière-plan (WebView). On enregistre un jeton d'appareil
// FCM que le backend utilise pour faire sonner le téléphone, app fermée.
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { pushApi } from './transportApi';

export const isNativePush = () => Capacitor?.isNativePlatform?.() === true;

let listenersReady = false;
let lastToken = null;

// ⚠️ Ne JAMAIS `await` l'objet PushNotifications : c'est un Proxy Capacitor qui
// intercepte `.then` → le moteur JS le prend pour une promesse et appelle la
// « méthode native » then, qui ne répond jamais (blocage infini constaté).
// Canal Android « school » : sonnerie de cloche d'école (school_bell.wav dans
// res/raw de l'APK) + importance max (heads-up). Créé une fois ; Android fige
// le son d'un canal après création — changer de son = nouvel id de canal.
async function ensureSchoolChannel() {
  if (Capacitor.getPlatform?.() !== 'android') return;
  try {
    await PushNotifications.createChannel({
      id: 'school',
      name: "École",
      description: "Messages et alertes de l'école",
      importance: 5,
      visibility: 1,
      sound: 'school_bell.wav',
      vibration: true,
      lights: true,
    });
  } catch (e) {
    console.warn('[nativePush] createChannel:', e?.message || e);
  }
}

function setupListeners() {
  if (listenersReady) return;
  listenersReady = true;
  ensureSchoolChannel();

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
  setupListeners();

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
    setupListeners();
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
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'granted') return 'granted';
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

/**
 * Diagnostic pas-à-pas (bouton dans l'app) : déroule tout le flux et rapporte
 * précisément où ça casse. `onStep(steps)` est appelé après chaque étape pour
 * l'affichage en direct. Retourne la liste des étapes.
 */
const withTimeout = (promise, ms, what) => Promise.race([
  promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} : aucune réponse après ${ms / 1000}s`)), ms)),
]);

export async function diagnoseNativePush(onStep) {
  const steps = [];
  const add = (label, ok, detail = '') => { steps.push({ label, ok: !!ok, detail: String(detail) }); onStep?.([...steps]); };

  if (!isNativePush()) {
    add('Plateforme native (Capacitor)', false, "isNativePlatform=false → l'app ne tourne pas en natif");
    return steps;
  }
  add('Plateforme native (v3)', true, Capacitor.getPlatform?.() || '');

  // Accès direct au plugin — surtout ne pas l'`await` (Proxy Capacitor, cf. haut du fichier).
  const PN = PushNotifications;
  add('Plugin push chargé', true);

  let perm;
  try { perm = await withTimeout(PN.checkPermissions(), 8000, 'checkPermissions'); add('Permission actuelle', true, perm.receive); }
  catch (e) { add('checkPermissions', false, e?.message || e); return steps; }

  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    try { perm = await withTimeout(PN.requestPermissions(), 60000, 'requestPermissions'); add('Réponse à la demande', true, perm.receive); }
    catch (e) { add('requestPermissions', false, e?.message || e); return steps; }
  }
  if (perm.receive !== 'granted') { add('Permission accordée', false, perm.receive); return steps; }
  add('Permission accordée', true);

  let token;
  try {
    token = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('pas de jeton après 12s — Google Play Services indisponible ?')), 12000);
      PN.addListener('registration', (t) => { clearTimeout(to); resolve(t.value); });
      PN.addListener('registrationError', (err) => { clearTimeout(to); reject(new Error(err?.error || 'registrationError')); });
      PN.register();
    });
    add('Jeton FCM obtenu', true, String(token).slice(0, 20) + '…');
  } catch (e) { add('Jeton FCM obtenu', false, e?.message || e); return steps; }

  try { await pushApi.registerDeviceToken(token, Capacitor.getPlatform()); add('Enregistré dans device_tokens', true); }
  catch (e) { add('Enregistré dans device_tokens', false, e?.message || e); return steps; }

  add('Tout est OK ✅', true);
  return steps;
}

/** Désenregistre le jeton courant (déconnexion). */
export async function disableNativePush() {
  if (!isNativePush() || !lastToken) return;
  try { await pushApi.removeDeviceToken(lastToken); } catch { /* ignore */ }
}
