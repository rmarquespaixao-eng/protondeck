import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { buildComposition, type Composition } from '../composition.js';
import { registerIpc } from '../adapters/in/ipc/handlers.js';

// Processo main do Electron. Diferente da versão antiga (que embarcava um
// servidor Fastify e abria o browser num localhost), aqui o renderer Vue fala
// direto com os services via IPC — sem HTTP, sem porta, sem cookies.

let composition: Composition | null = null;
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'ProtonDeck',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Links externos (ProtonDB, PCGW, Steam...) abrem no navegador do sistema.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // electron-vite injeta ELECTRON_RENDERER_URL em dev (HMR); em prod carrega o build.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // DB + caches vivem no userData do Electron (writável no app empacotado).
    process.env.PROTONDECK_COMMUNITY_CACHE ??= join(app.getPath('userData'), 'community-cache');
    composition = buildComposition({ dbPath: join(app.getPath('userData'), 'panel.db') });
    registerIpc(composition, () => mainWindow);

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    try { composition?.db.close(); } catch { /* noop */ }
    if (process.platform !== 'darwin') app.quit();
  });
}
