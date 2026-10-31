// Electron main process: opens a window that shows the same web app as the website,
// and adds the desktop-only features (source picker with thumbnails, native "Save as").
const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

let win;
let selectedSourceId = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 640,
    minHeight: 560,
    title: 'Tally',
    backgroundColor: '#e6ebf0',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the bundled copy of the website, so the app also works offline.
  // To always show the live site instead, use:
  //   win.loadURL('https://YOUR-GITHUB-USERNAME.github.io/tally/');
  win.loadFile(path.join(__dirname, 'web', 'index.html'));

  // Open outside links in the user's browser instead of inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  // Electron has no built-in screen picker, so we answer the page's
  // navigator.mediaDevices.getDisplayMedia() call with the source the user picked.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const source = sources.find((s) => s.id === selectedSourceId) || sources[0];
    if (!source) return callback({});
    // System audio capture ("loopback") is only supported on Windows.
    callback(process.platform === 'win32' ? { video: source, audio: 'loopback' } : { video: source });
  });

  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 400, height: 250 },
    });
    return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
  });

  ipcMain.handle('select-source', (_event, id) => {
    selectedSourceId = String(id);
  });

  ipcMain.handle('save-recording', async (_event, buffer, name) => {
    const ext = path.extname(name).slice(1) || 'webm';
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save recording',
      defaultPath: path.join(app.getPath('videos'), path.basename(name)),
      filters: [{ name: 'Video', extensions: [ext] }],
    });
    if (canceled || !filePath) return { saved: false };
    await fs.writeFile(filePath, Buffer.from(buffer));
    return { saved: true, path: filePath };
  });

  ipcMain.handle('open-external', (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://github.com/')) shell.openExternal(url);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
