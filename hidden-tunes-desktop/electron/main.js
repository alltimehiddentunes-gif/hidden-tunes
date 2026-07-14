const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { fetchApprovedCatalog } = require('./catalogBridge');

const isDev = !app.isPackaged;
const WINDOW_TITLE = 'Hidden Tunes Desktop';
const WINDOW_BG = '#050508';

function logProduction(message, detail) {
  if (isDev) return;
  const prefix = '[Hidden Tunes Desktop]';
  if (detail !== undefined) {
    console.error(prefix, message, detail);
  } else {
    console.error(prefix, message);
  }
}

function getProductionIndexPath() {
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function buildFallbackHtml(title, message) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #050508;
      color: #f5f3fa;
      font-family: "Segoe UI", system-ui, sans-serif;
      padding: 24px;
    }
    main {
      max-width: 520px;
      padding: 28px 32px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #13131d;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 12px; font-size: 1.35rem; }
    p { margin: 0; line-height: 1.6; color: rgba(245, 243, 250, 0.72); }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`;
}

function showFallbackPage(win, title, message) {
  const html = buildFallbackHtml(title, message);
  return win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function attachWindowDiagnostics(win) {
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logProduction('did-fail-load', { errorCode, errorDescription, validatedURL });
    if (!isDev) {
      showFallbackPage(
        win,
        'Hidden Tunes Desktop',
        'The desktop shell could not load. Please reinstall or contact support if this continues.',
      );
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logProduction('render-process-gone', details);
    showFallbackPage(
      win,
      'Hidden Tunes Desktop',
      'The catalog view stopped unexpectedly. Restart the app to try again.',
    );
  });

  win.webContents.on('unresponsive', () => {
    logProduction('window unresponsive');
  });

  win.webContents.on('responsive', () => {
    logProduction('window responsive again');
  });

  win.on('unresponsive', () => {
    logProduction('BrowserWindow unresponsive');
  });

  win.on('responsive', () => {
    logProduction('BrowserWindow responsive again');
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (!isDev && level >= 2) {
      logProduction('renderer console', { level, message, line, sourceId });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    title: WINDOW_TITLE,
    width: 1680,
    height: 1024,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: WINDOW_BG,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.setTitle(WINDOW_TITLE);
  attachWindowDiagnostics(win);

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = getProductionIndexPath();
    if (!fs.existsSync(indexPath)) {
      logProduction('dist/index.html missing', indexPath);
      showFallbackPage(
        win,
        'Hidden Tunes Desktop',
        'Production build files were not found. Run npm run build, then package the app again.',
      );
    } else {
      logProduction('loading production index', indexPath);
      win.loadFile(indexPath).catch((error) => {
        logProduction('loadFile failed', error);
        showFallbackPage(
          win,
          'Hidden Tunes Desktop',
          'The desktop shell could not start. Please reinstall the app.',
        );
      });
    }
  }

  win.once('ready-to-show', () => {
    win.show();
  });
}

app.whenReady().then(() => {
  ipcMain.handle('ht-catalog-get', async (_event, path) => {
    const cleanPath = typeof path === 'string' ? path.trim() : ''
    if (!cleanPath.startsWith('/api/')) {
      throw new Error('Catalog path is not allowed.')
    }
    return fetchApprovedCatalog(cleanPath)
  })

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  logProduction('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  logProduction('unhandledRejection', reason);
});
