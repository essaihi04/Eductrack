// Helper de téléchargement unifié pour les 3 environnements :
//   - Navigateur web classique → ancre <a download> (comportement natif).
//   - App desktop Electron → l'ancre <a download> déclenche will-download
//     (géré dans edtrack-electron/main.js) → boîte « Enregistrer sous ».
//   - App mobile Capacitor (WebView) → l'attribut download est IGNORÉ. On écrit
//     le fichier via @capacitor/filesystem puis on ouvre la feuille de partage
//     (@capacitor/share) pour « Enregistrer / Ouvrir avec… ».
//
// Utiliser saveBlob(blob, filename) pour un contenu déjà en mémoire (jsPDF,
// fichiers Supabase, exports Excel) et openPdfUrl(url, filename) pour un PDF
// servi par le backend (bulletins, etc.).
import { Capacitor } from '@capacitor/core';

function isNativeMobile() {
  try {
    return Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function sanitize(name) {
  return String(name || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Lecture du blob échouée'));
    reader.onloadend = () => {
      // reader.result = "data:<mime>;base64,XXXX" → on ne garde que XXXX
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

// Enregistrement natif (mobile) : écriture dans le cache + feuille de partage.
async function saveBlobNative(blob, filename) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const name = sanitize(filename);
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path: name,
    data,
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: name, url: uri });
  } catch {
    // L'utilisateur a fermé la feuille de partage : le fichier reste dans le
    // cache, ce n'est pas une erreur bloquante.
  }
}

// Téléchargement web/Electron : ancre <a download>.
function saveBlobBrowser(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitize(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Enregistre un Blob en tenant compte de la plateforme.
 * @param {Blob} blob
 * @param {string} filename ex. "facture_2024.pdf"
 */
export async function saveBlob(blob, filename) {
  if (isNativeMobile()) {
    await saveBlobNative(blob, filename);
  } else {
    saveBlobBrowser(blob, filename);
  }
}

/**
 * Ouvre / télécharge un PDF servi par une URL (éventuellement avec ?token=).
 * Sur mobile on le récupère puis on le partage ; ailleurs on ouvre un onglet.
 * @param {string} url
 * @param {string} [filename] nom suggéré pour l'enregistrement mobile
 */
export async function openPdfUrl(url, filename = 'document.pdf') {
  if (isNativeMobile()) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur téléchargement (${res.status})`);
    const blob = await res.blob();
    await saveBlob(blob, filename);
  } else {
    window.open(url, '_blank');
  }
}

/**
 * Ouvre un Blob déjà en mémoire (ex. PDF récupéré via fetch authentifié).
 * Web/Electron : nouvel onglet (visualisation inline). Mobile : enregistre/partage.
 * @param {Blob} blob
 * @param {string} [filename]
 */
export async function openBlob(blob, filename = 'document.pdf') {
  if (isNativeMobile()) {
    await saveBlob(blob, filename);
  } else {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

/**
 * Ouvre un document HTML dans une fenêtre et lance l'impression (→ « Enregistrer
 * en PDF » côté navigateur/desktop). Sert aux docs construits à la volée :
 * factures, reçus de salaire, fiches élève/inscription.
 * La WebView mobile ne sait pas imprimer → message clair au lieu d'un échec muet.
 * @param {string} html document HTML complet
 * @param {{ title?: string }} [opts]
 * @returns {boolean} true si l'impression a été lancée
 */
export function printHtmlDocument(html, { title = 'Document' } = {}) {
  if (isNativeMobile()) {
    alert(
      "L'impression n'est pas disponible dans l'application mobile. " +
      "Ouvrez ce document depuis la version web ou l'application bureau " +
      "pour l'imprimer ou l'enregistrer en PDF."
    );
    return false;
  }
  const w = window.open('', '_blank');
  if (!w) {
    alert('Veuillez autoriser les fenêtres pop-up pour imprimer.');
    return false;
  }
  if (title) { try { w.document.title = title; } catch { /* ignore */ } }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
  return true;
}

export { isNativeMobile };
