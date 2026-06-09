import { app, ipcMain, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

// OTA via electron-updater + GitHub Releases (provider configurado em
// package.json > build.publish). No Linux só o AppImage se autoatualiza; em
// .deb / instalações de pacote o updater apenas NOTIFICA (abre o release).
//
//   AppImage  → baixa em background + "reiniciar pra atualizar" (quitAndInstall)
//   .deb/outro → só avisa "vX disponível" com link pro release
//
// Em dev (app.isPackaged === false) o autoUpdater não roda — devolve supported:false.

const REPO_URL = 'https://github.com/rmarquespaixao-eng/protondeck';

export type UpdaterStatus =
  | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export type UpdaterState = {
  status: UpdaterStatus;
  currentVersion: string;
  newVersion: string | null;
  progressPercent: number | null;
  error: string | null;
  /** true só em AppImage empacotado — único caso que o electron-updater autoinstala no Linux. */
  canAutoInstall: boolean;
  releaseUrl: string;
  /** false em dev / app não-empacotado (sem feed de update). */
  supported: boolean;
};

let state: UpdaterState;
let getWin: () => BrowserWindow | null = () => null;

function isAppImage(): boolean {
  return !!process.env.APPIMAGE;
}

function broadcast(): void {
  getWin()?.webContents.send('updater:event', state);
}

function set(patch: Partial<UpdaterState>): void {
  state = { ...state, ...patch };
  broadcast();
}

async function check(): Promise<void> {
  if (!app.isPackaged) {
    set({ status: 'not-available', error: 'Atualizações só na versão instalada (AppImage/.deb).' });
    return;
  }
  try {
    set({ status: 'checking', error: null });
    await autoUpdater.checkForUpdates();
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  getWin = getWindow;
  const canAutoInstall = app.isPackaged && isAppImage();

  state = {
    status: 'idle',
    currentVersion: app.getVersion(),
    newVersion: null,
    progressPercent: null,
    error: null,
    canAutoInstall,
    releaseUrl: `${REPO_URL}/releases/latest`,
    supported: app.isPackaged,
  };

  ipcMain.handle('updater:state', () => state);
  ipcMain.handle('updater:check', async () => { await check(); return state; });
  ipcMain.handle('updater:install', () => {
    if (state.status !== 'downloaded') return { ok: false, error: 'nenhuma atualização baixada' };
    if (!canAutoInstall) return { ok: false, error: 'auto-instalação só disponível no AppImage' };
    // Fecha janelas (dispara window-all-closed → db.close) e reinstala.
    setImmediate(() => autoUpdater.quitAndInstall());
    return { ok: true };
  });

  if (!app.isPackaged) return; // autoUpdater não opera em dev

  autoUpdater.autoDownload = false;               // controlamos quando baixar
  autoUpdater.autoInstallOnAppQuit = canAutoInstall;

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info) => {
    set({
      status: 'available',
      newVersion: info.version,
      releaseUrl: `${REPO_URL}/releases/tag/v${info.version}`,
    });
    // AppImage: baixa em background; .deb/outro: só notifica (usuário baixa do release).
    if (canAutoInstall) {
      autoUpdater.downloadUpdate().catch((e) =>
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) }));
    }
  });
  autoUpdater.on('update-not-available', () => set({ status: 'not-available' }));
  autoUpdater.on('download-progress', (p) =>
    set({ status: 'downloading', progressPercent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) =>
    set({ status: 'downloaded', newVersion: info.version, progressPercent: 100 }));
  autoUpdater.on('error', (err) =>
    set({ status: 'error', error: err instanceof Error ? err.message : String(err) }));

  // Check silencioso no startup, após a janela assentar.
  setTimeout(() => { void check(); }, 8000);
}
