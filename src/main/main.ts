import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerAppIpc } from './ipc/app.ipc';
import { registerWorldIpc } from './ipc/world.ipc';
import { isAllowedUrl, WINDOW_SECURITY } from './security/window';

const devUrl = process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b0f14',
    title: 'DIGITAL LIFE',
    webPreferences: {
      ...WINDOW_SECURITY,
      preload: join(__dirname, '..', 'preload', 'preload.js'),
    },
  });

  const target = devUrl ?? pathToFileURL(join(__dirname, '..', 'renderer', 'index.html')).href;
  void mainWindow.loadURL(target);

  // Aucune fenêtre ouverte ni navigation externe : l'application reste locale.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url, devUrl)) event.preventDefault();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setName('DIGITAL LIFE');
registerAppIpc();
registerWorldIpc();

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
