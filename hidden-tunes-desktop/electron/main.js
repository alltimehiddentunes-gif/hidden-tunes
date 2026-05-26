const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const WINDOW_TITLE = 'Hidden Tunes Desktop';
const WINDOW_BG = '#050508';

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
    },
  });

  win.setTitle(WINDOW_TITLE);

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win.show();
  });
}

app.whenReady().then(() => {
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
