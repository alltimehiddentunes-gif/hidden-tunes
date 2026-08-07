const { app, BrowserWindow, ipcMain, Menu, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { fetchApprovedCatalog, fetchApprovedCatalogRequest } = require('./catalogBridge');
const { getRuntimeDiagnostics } = require('./runtimeConfig');
const {
  DownloadManager,
  registerDownloadProtocol,
  attachDownloadProtocolHandler,
} = require('./downloads');
const {
  classifyDesktopNavigationTarget,
  isAppDocumentUrl,
  buildContentSecurityPolicy,
  DEV_RENDERER_ORIGIN,
} = require('./navigationPolicy');

const isDev = !app.isPackaged;
const WINDOW_TITLE = 'Hidden Tunes Desktop';
const WINDOW_BG = '#050508';

registerDownloadProtocol(() => app.getPath('userData'));

let mainWindow = null;
let downloadManager = null;
let sessionSecurityAttached = false;
let saveWindowStateTimer = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const value = JSON.parse(fs.readFileSync(getWindowStatePath(), 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function getVisibleBounds(savedState) {
  const fallback = { width: 1680, height: 1024 };
  const width = Math.max(1280, Number(savedState.width) || fallback.width);
  const height = Math.max(720, Number(savedState.height) || fallback.height);
  const proposed = {
    x: Number.isFinite(savedState.x) ? savedState.x : undefined,
    y: Number.isFinite(savedState.y) ? savedState.y : undefined,
    width,
    height,
  };
  if (proposed.x === undefined || proposed.y === undefined) return { width, height };
  const display = screen.getDisplayMatching(proposed);
  const area = display.workArea;
  return {
    width: Math.min(width, area.width),
    height: Math.min(height, area.height),
    x: Math.min(Math.max(proposed.x, area.x), area.x + area.width - Math.min(width, area.width)),
    y: Math.min(Math.max(proposed.y, area.y), area.y + area.height - Math.min(height, area.height)),
  };
}

function persistWindowState(win) {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  const value = { ...bounds, isMaximized: win.isMaximized() };
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(value));
  } catch (error) {
    logProduction('window state persistence failed', error);
  }
}

function scheduleWindowStateSave(win) {
  clearTimeout(saveWindowStateTimer);
  saveWindowStateTimer = setTimeout(() => persistWindowState(win), 180);
}

function getWindowState(win) {
  return {
    isMaximized: Boolean(win && !win.isDestroyed() && win.isMaximized()),
    isMinimized: Boolean(win && !win.isDestroyed() && win.isMinimized()),
    isFullScreen: Boolean(win && !win.isDestroyed() && win.isFullScreen()),
  };
}

function publishWindowState(win) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('ht-window-state-changed', getWindowState(win));
  }
}

function getValidatedSenderWindow(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win && win === mainWindow && !win.isDestroyed() ? win : null;
}

function restoreAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function getAppFileRoots() {
  return [
    path.join(__dirname, '..', 'dist'),
    path.join(__dirname),
  ];
}

function getNavigationContext() {
  return {
    isPackaged: app.isPackaged,
    appFileRoots: getAppFileRoots(),
  };
}

function getDownloadManager() {
  if (!downloadManager) {
    downloadManager = new DownloadManager({
      getUserDataPath: () => app.getPath('userData'),
      broadcast: (event, payload) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('ht-downloads-event', { event, payload });
          }
        }
      },
    });
  }
  return downloadManager;
}

function logProduction(message, detail) {
  if (isDev) return;
  const prefix = '[Hidden Tunes Desktop]';
  if (detail !== undefined) {
    console.error(prefix, message, detail);
  } else {
    console.error(prefix, message);
  }
}

function logSecurity(message, detail) {
  const prefix = '[Hidden Tunes Desktop][security]';
  if (detail !== undefined) {
    console.warn(prefix, message, detail);
  } else {
    console.warn(prefix, message);
  }
}

function getProductionIndexPath() {
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function getFallbackHtmlPath() {
  return path.join(__dirname, 'fallback.html');
}

function getBrandIconPath() {
  const iconPath = isDev
    ? path.join(__dirname, '..', 'build', 'icon.png')
    : path.join(process.resourcesPath, 'brand', 'icon.png');
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function showFallbackPage(win) {
  const fallbackPath = getFallbackHtmlPath();
  if (!fs.existsSync(fallbackPath)) {
    logProduction('fallback.html missing', fallbackPath);
    return Promise.resolve();
  }
  return win.loadFile(fallbackPath);
}

/**
 * Open a URL in the OS browser only after policy classification.
 * Never opens allow-internal or deny targets.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function openValidatedExternalUrl(rawUrl) {
  const decision = classifyDesktopNavigationTarget(rawUrl, getNavigationContext());
  if (decision.action !== 'open-external' || typeof decision.url !== 'string') {
    logSecurity('openExternal denied', { rawUrl, reason: decision.reason });
    return { ok: false, reason: decision.reason || 'denied' };
  }
  try {
    await shell.openExternal(decision.url);
    return { ok: true };
  } catch (error) {
    logSecurity('openExternal failed', error);
    return { ok: false, reason: 'open-failed' };
  }
}

function attachSessionSecurity() {
  if (sessionSecurityAttached) return;
  sessionSecurityAttached = true;

  const csp = buildContentSecurityPolicy(app.isPackaged);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isAppDocumentUrl(details.url, { isPackaged: app.isPackaged })) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const responseHeaders = { ...(details.responseHeaders || {}) };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[key];
      }
    }
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
}

function attachWindowSecurity(win) {
  win.webContents.on('will-navigate', (event, url) => {
    const decision = classifyDesktopNavigationTarget(url, getNavigationContext());
    if (decision.action === 'allow-internal') {
      return;
    }
    event.preventDefault();
    logSecurity('will-navigate blocked', { url, reason: decision.reason });
    if (decision.action === 'open-external') {
      void openValidatedExternalUrl(decision.url || url);
    }
  });

  // Deny all Electron popup/window creation. Validated HTTPS may open externally.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const decision = classifyDesktopNavigationTarget(url, getNavigationContext());
    if (decision.action === 'open-external') {
      void openValidatedExternalUrl(decision.url || url);
    } else {
      logSecurity('window-open denied', { url, reason: decision.reason });
    }
    return { action: 'deny' };
  });
}

function attachWindowDiagnostics(win) {
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logProduction('did-fail-load', { errorCode, errorDescription, validatedURL });
    if (!isDev) {
      showFallbackPage(win);
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logProduction('render-process-gone', details);
    showFallbackPage(win);
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
  const savedState = readWindowState();
  const win = new BrowserWindow({
    title: WINDOW_TITLE,
    icon: getBrandIconPath(),
    ...getVisibleBounds(savedState),
    minWidth: 1280,
    minHeight: 720,
    frame: process.platform === 'darwin',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    backgroundColor: WINDOW_BG,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow = win;
  const publishFullScreenState = () => {
    publishWindowState(win);
    if (!win.isDestroyed()) win.webContents.send('ht-window-full-screen-changed', win.isFullScreen());
  };
  win.on('enter-full-screen', publishFullScreenState);
  win.on('leave-full-screen', publishFullScreenState);
  for (const eventName of ['maximize', 'unmaximize', 'minimize', 'restore']) {
    win.on(eventName, () => publishWindowState(win));
  }
  win.on('move', () => scheduleWindowStateSave(win));
  win.on('resize', () => scheduleWindowStateSave(win));
  win.on('close', () => persistWindowState(win));
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.setTitle(WINDOW_TITLE);
  attachWindowSecurity(win);
  attachWindowDiagnostics(win);

  if (isDev) {
    win.loadURL(DEV_RENDERER_ORIGIN);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = getProductionIndexPath();
    if (!fs.existsSync(indexPath)) {
      logProduction('dist/index.html missing', indexPath);
      showFallbackPage(win);
    } else {
      logProduction('loading production index', indexPath);
      win.loadFile(indexPath).catch((error) => {
        logProduction('loadFile failed', error);
        showFallbackPage(win);
      });
    }
  }

  win.once('ready-to-show', () => {
    if (savedState.isMaximized) win.maximize();
    win.show();
    publishWindowState(win);
  });
}

app.on('second-instance', () => {
  restoreAndFocusMainWindow();
});

function installApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' },
    ] }] : []),
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])] },
    { label: 'Help', submenu: [{ role: 'about' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  attachSessionSecurity();
  attachDownloadProtocolHandler(() => app.getPath('userData'));
  installApplicationMenu();

  ipcMain.on('ht-runtime-info', (event) => {
    event.returnValue = getRuntimeDiagnostics(app.isPackaged);
  });

  ipcMain.handle('ht-shell-open-external', async (_event, rawUrl) => {
    if (typeof rawUrl !== 'string') {
      return { ok: false, reason: 'invalid-argument' };
    }
    return openValidatedExternalUrl(rawUrl);
  });

  ipcMain.handle('ht-window-is-full-screen', (event) => {
    const win = getValidatedSenderWindow(event);
    return Boolean(win && !win.isDestroyed() && win.isFullScreen());
  });

  ipcMain.handle('ht-window-set-full-screen', (event, enabled) => {
    const win = getValidatedSenderWindow(event);
    if (!win || win.isDestroyed()) return { ok: false };
    win.setFullScreen(Boolean(enabled));
    return { ok: true, isFullScreen: win.isFullScreen() };
  });

  ipcMain.handle('ht-window-get-state', (event) => getWindowState(getValidatedSenderWindow(event)));
  ipcMain.handle('ht-window-minimize', (event) => {
    const win = getValidatedSenderWindow(event);
    if (!win) return { ok: false };
    win.minimize();
    return { ok: true };
  });
  ipcMain.handle('ht-window-toggle-maximize', (event) => {
    const win = getValidatedSenderWindow(event);
    if (!win) return { ok: false };
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
    return { ok: true, isMaximized: win.isMaximized() };
  });
  ipcMain.handle('ht-window-close', (event) => {
    const win = getValidatedSenderWindow(event);
    if (!win) return { ok: false };
    win.close();
    return { ok: true };
  });

  ipcMain.handle('ht-catalog-get', async (_event, catalogPath) => {
    const cleanPath = typeof catalogPath === 'string' ? catalogPath.trim() : '';
    if (!cleanPath.startsWith('/api/')) {
      throw new Error('Catalog path is not allowed.');
    }
    return fetchApprovedCatalog(cleanPath);
  });

  ipcMain.handle('ht-catalog-request', async (_event, options) => {
    const cleanPath = typeof options?.path === 'string' ? options.path.trim() : '';
    const methodRaw = typeof options?.method === 'string' ? options.method.trim().toUpperCase() : 'GET';
    const method = methodRaw === 'POST' ? 'POST' : methodRaw === 'GET' ? 'GET' : '';
    const body = options?.body === undefined ? null : options.body;

    if (!cleanPath.startsWith('/api/')) {
      throw new Error('Catalog path is not allowed.');
    }
    if (method !== 'GET' && method !== 'POST') {
      throw new Error('Catalog method is not allowed.');
    }
    if (body !== null && (typeof body !== 'object' || Array.isArray(body))) {
      throw new Error('Catalog body must be a plain object or null.');
    }

    return fetchApprovedCatalogRequest({
      path: cleanPath,
      method,
      body,
    });
  });

  const downloads = getDownloadManager();

  ipcMain.handle('ht-downloads-list', async () => downloads.list());
  ipcMain.handle('ht-downloads-start', async (_event, request) => downloads.start(request || {}));
  ipcMain.handle('ht-downloads-pause', async (_event, downloadId) => downloads.pause(String(downloadId || '')));
  ipcMain.handle('ht-downloads-resume', async (_event, downloadId) => downloads.resume(String(downloadId || '')));
  ipcMain.handle('ht-downloads-cancel', async (_event, downloadId) => downloads.cancel(String(downloadId || '')));
  ipcMain.handle('ht-downloads-remove', async (_event, downloadId) => downloads.remove(String(downloadId || '')));
  ipcMain.handle('ht-downloads-get-playable-url', async (_event, downloadId) => (
    downloads.getPlayableUrl(String(downloadId || ''))
  ));
  ipcMain.handle('ht-downloads-disk-usage', async () => downloads.getDiskUsage());
  ipcMain.handle('ht-downloads-reconcile', async () => downloads.reconcile());

  // Non-blocking startup reconciliation
  void downloads.reconcile();

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
