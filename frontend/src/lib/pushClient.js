// Helper d'inscription aux notifications push
import { pushApi } from './transportApi';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const base = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Votre navigateur ne supporte pas les notifications push.');
    return false;
  }
  // Demander permission
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;

  // Enregistrer le service worker
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // Récupérer la clé VAPID
  const { publicKey } = await pushApi.vapidKey();
  if (!publicKey) throw new Error('VAPID non configuré sur le serveur');

  // Subscribe
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }
  await pushApi.subscribe(sub);
  return true;
}

export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await pushApi.unsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  }
}
