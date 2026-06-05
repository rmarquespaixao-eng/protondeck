import { contextBridge, ipcRenderer } from 'electron';

// Ponte segura renderer↔main (contextIsolation). Espelha os canais de
// src/adapters/in/ipc/handlers.ts. O renderer só enxerga window.api.
const api = {
  app: {
    version: () => ipcRenderer.invoke('app:version') as Promise<string>,
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  dashboard: {
    get: () => ipcRenderer.invoke('dashboard:get'),
  },
  games: {
    list: (filter = {}) => ipcRenderer.invoke('games:list', filter),
    get: (appid: string) => ipcRenderer.invoke('games:get', appid),
    save: (payload: unknown) => ipcRenderer.invoke('games:save', payload),
    community: (appid: string) => ipcRenderer.invoke('games:community', appid),
    widescreen: (appid: string, force = false) => ipcRenderer.invoke('games:widescreen', { appid, force }),
    steamLaunch: (appid: string) => ipcRenderer.invoke('games:steamLaunch', appid),
    applySteam: (appid: string) => ipcRenderer.invoke('games:applySteam', appid),
  },
  sync: {
    run: () => ipcRenderer.invoke('sync:run'),
  },
  check: {
    search: (q: string) => ipcRenderer.invoke('check:search', q),
    detail: (appid: string) => ipcRenderer.invoke('check:detail', appid),
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setConfig: (cfg: unknown) => ipcRenderer.invoke('ai:setConfig', cfg),
    protonLog: (appid: string) => ipcRenderer.invoke('ai:protonLog', appid),
    diagnose: (appid: string) => ipcRenderer.invoke('ai:diagnose', appid),
    troubleshoot: (appid: string, problem: string, current_state: unknown) =>
      ipcRenderer.invoke('ai:troubleshoot', { appid, problem, current_state }),
    suggest: (appid: string) => ipcRenderer.invoke('ai:suggest', appid),
  },
  steam: {
    getConfig: () => ipcRenderer.invoke('steam:getConfig'),
    setConfig: (cfg: unknown) => ipcRenderer.invoke('steam:setConfig', cfg),
  },
  system: {
    info: () => ipcRenderer.invoke('system:info'),
    scan: () => ipcRenderer.invoke('system:scan'),
    sudoers: () => ipcRenderer.invoke('system:sudoers'),
    // streaming: onEvent recebe {type:'start'|'cmd'|'stdout'|'stderr'|'exit'|'error'|'done', ...}
    install: (groupId: string, onEvent: (ev: unknown) => void) => {
      const listener = (_e: unknown, ev: unknown) => onEvent(ev);
      ipcRenderer.on('system:install:event', listener);
      return ipcRenderer.invoke('system:install', groupId)
        .finally(() => ipcRenderer.removeListener('system:install:event', listener));
    },
    cancelInstall: () => ipcRenderer.send('system:install:cancel'),
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import'),
    applyImport: (payload: unknown) => ipcRenderer.invoke('backup:applyImport', payload),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
