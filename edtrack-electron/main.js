const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://etrack.ma';

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
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    backgroundColor: '#1e3a5f'
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
