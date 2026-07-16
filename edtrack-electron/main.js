const { app, BrowserWindow, Menu, session, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://etrack.ma';

// Permet la géolocalisation sur les Chromebooks/Windows sans clé API Google
// (utilise le service Mozilla Location Service en fallback, ou ip-api)
app.commandLine.appendSwitch('enable-features', 'WebContentsForceDark');
// Autorise les API web de localisation
app.commandLine.appendSwitch('enable-geolocation');

function getLogoBase64() {
  try {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    const data = fs.readFileSync(iconPath);
    return `data:image/png;base64,${data.toString('base64')}`;
  } catch (e) {
    return '';
  }
}

function buildLoadingHTML(logoSrc) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: 'Segoe UI', sans-serif;
      color: white;
    }
    .logo-img {
      width: 120px;
      height: 120px;
      border-radius: 24px;
      object-fit: cover;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      margin-bottom: 20px;
    }
    .app-name {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 2px;
      margin-bottom: 6px;
    }
    .app-name span { color: #4fc3f7; }
    .subtitle {
      font-size: 15px;
      opacity: 0.65;
      margin-bottom: 40px;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 4px solid rgba(255,255,255,0.2);
      border-top-color: #4fc3f7;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status {
      margin-top: 18px;
      font-size: 13px;
      opacity: 0.55;
    }
  </style>
</head>
<body>
  ${logoSrc ? `<img class="logo-img" src="${logoSrc}" alt="Eductrack Logo">` : ''}
  <div class="app-name">Educ<span>Track</span></div>
  <div class="subtitle">Suivi pédagogique intelligent</div>
  <div class="spinner"></div>
  <div class="status">Connexion en cours...</div>
</body>
</html>`;
}

function buildErrorHTML(logoSrc) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: 'Segoe UI', sans-serif;
      color: white;
    }
    .logo-img {
      width: 100px;
      height: 100px;
      border-radius: 20px;
      object-fit: cover;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      margin-bottom: 16px;
    }
    .app-name {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 2px;
      margin-bottom: 20px;
    }
    .app-name span { color: #4fc3f7; }
    .error-box {
      background: rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 24px 36px;
      text-align: center;
      max-width: 420px;
    }
    .error-icon { font-size: 36px; margin-bottom: 12px; }
    .error-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    .error-msg { font-size: 14px; opacity: 0.7; margin-bottom: 20px; }
    button {
      background: #4fc3f7;
      color: #1e3a5f;
      border: none;
      padding: 10px 28px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    button:hover { background: #81d4fa; }
  </style>
</head>
<body>
  ${logoSrc ? `<img class="logo-img" src="${logoSrc}" alt="Eductrack Logo">` : ''}
  <div class="app-name">Educ<span>Track</span></div>
  <div class="error-box">
    <div class="error-icon">⚠️</div>
    <div class="error-title">Connexion impossible</div>
    <div class="error-msg">Impossible de joindre le serveur Eductrack.<br>Vérifiez votre connexion internet.</div>
    <button onclick="location.reload()">Réessayer</button>
  </div>
</body>
</html>`;
}

// Bug Electron connu (Windows) : après la fermeture d'une fenêtre enfant
// (impression PDF) ou d'une boîte de dialogue native (« Enregistrer sous »),
// la fenêtre principale ne redonne plus le focus aux champs texte au clic
// tant qu'elle n'a pas perdu puis regagné le focus (Alt-Tab). On force ce
// cycle blur → focus pour que les inputs (ex: login/mot de passe) restent
// cliquables.
function refocusWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.blur();
  win.focus();
  win.webContents.focus();
}

// Autorise l'ouverture de fenêtres secondaires (impression PDF côté navigateur).
// window.open(...) est utilisé de deux façons :
//   - window.open('', '_blank') puis document.write + print() → factures,
//     reçus de salaire, fiches élève/inscription. On AUTORISE une vraie fenêtre
//     enfant pour que l'impression (et le « Enregistrer en PDF ») fonctionne.
//   - window.open(urlPdfServeur, '_blank') → bulletins, exports finance. On
//     laisse Chromium l'ouvrir (visionneuse PDF intégrée + impression).
function setupDownloadsAndPopups(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 1000,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: false, nodeIntegration: false },
        },
      };
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: { width: 1000, height: 900, autoHideMenuBar: true },
    };
  });

  // À la fermeture d'une fenêtre enfant (impression), on rend le focus à la
  // fenêtre principale — sinon les champs texte deviennent incliquables.
  win.webContents.on('did-create-window', (childWin) => {
    childWin.on('closed', () => refocusWindow(win));
  });
}

// Téléchargements réels (blobs jsPDF, fichiers Supabase, exports Excel, PDF
// servis par le backend). Sans handler, rien ne s'enregistre dans Electron.
// On propose une boîte « Enregistrer sous » puis on ouvre le fichier. Enregistré
// UNE seule fois sur la session (sinon écouteurs dupliqués à chaque fenêtre).
function setupSessionDownloads() {
  session.defaultSession.on('will-download', (event, item) => {
    const suggested = item.getFilename() || 'document';
    const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const savePath = dialog.showSaveDialogSync(parent, {
      title: 'Enregistrer le fichier',
      defaultPath: path.join(app.getPath('downloads'), suggested),
    });

    // La boîte de dialogue native vole le focus : on le rend à la fenêtre
    // pour que les champs texte restent cliquables ensuite.
    refocusWindow(parent);

    if (!savePath) {
      item.cancel();
      return;
    }
    item.setSavePath(savePath);

    item.once('done', (e, state) => {
      refocusWindow(parent);
      if (state === 'completed') {
        shell.openPath(savePath).catch(() => {});
      }
    });
  });
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const logoSrc = getLogoBase64();
  const LOADING_HTML = buildLoadingHTML(logoSrc);
  const ERROR_HTML = buildErrorHTML(logoSrc);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Eductrack',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#1e3a5f'
  });

  // ── Téléchargement & impression des PDF ────────────────────────────────
  // Sans ce câblage, Electron bloque window.open (factures/reçus/bulletins) et
  // n'ouvre aucune boîte d'enregistrement pour les blobs jsPDF / fichiers.
  setupDownloadsAndPopups(win);

  // Filet de sécurité : à chaque navigation interne de l'app (React Router —
  // ex: déconnexion → page de login), on s'assure que le contenu web a bien
  // le focus, sinon les champs email/mot de passe ne réagissent pas au clic.
  win.webContents.on('did-navigate-in-page', () => {
    if (win.isFocused()) win.webContents.focus();
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(LOADING_HTML)}`);
  win.show();

  setTimeout(() => {
    win.loadURL(APP_URL).catch(() => {
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ERROR_HTML)}`);
    });
  }, 800);

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode !== -3) {
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ERROR_HTML)}`);
    }
  });
}

app.whenReady().then(() => {
  // Autorise automatiquement les permissions pour etrack.ma (géolocalisation, notifications, etc.)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (webContents && webContents.getURL && webContents.getURL()) || '';
    const allowed = ['geolocation', 'notifications', 'media', 'mediaKeySystem', 'background-sync', 'clipboard-read', 'clipboard-sanitized-write'];
    if (allowed.includes(permission) && url.startsWith('https://etrack.ma')) {
      return callback(true);
    }
    callback(false);
  });

  // Pour les vérifications synchrones (navigator.permissions.query)
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (!requestingOrigin) return false;
    const allowed = ['geolocation', 'notifications', 'media', 'background-sync', 'clipboard-read'];
    if (allowed.includes(permission) && requestingOrigin.startsWith('https://etrack.ma')) {
      return true;
    }
    return false;
  });

  // Permet l'accès aux périphériques (capteurs)
  session.defaultSession.setDevicePermissionHandler(() => true);

  // Route les téléchargements de fichiers vers une boîte « Enregistrer sous ».
  setupSessionDownloads();

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
