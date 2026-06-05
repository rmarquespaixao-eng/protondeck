import { ipcMain, dialog, shell, app, type BrowserWindow } from 'electron';
import { writeFile, readFile } from 'node:fs/promises';
import type { Composition } from '../../../composition.js';
import type { GameListFilter } from '../../../application/ports/out/GameRepository.js';
import { PROVIDER_MODELS, DEFAULT_BASE_URLS, type CurrentScreenState } from '../../../application/services/AIService.js';

// Adapter inbound IPC — espelha o que era a camada in/http. Cada canal chama
// os mesmos application services (transport-agnostic). O renderer (Vue) fala
// com isto via window.api (ver src/preload/index.ts).

type SaveGamePayload = {
  appid: string;
  action?: 'save' | 'save_launch' | 'save_notes' | 'clear_launch' | 'clear_notes';
  user_launch_options?: string | null;
  user_notes?: string | null;
};

export function registerIpc(composition: Composition, getWindow: () => BrowserWindow | null): void {
  const { services: s, repos: r, clients: c } = composition;
  const handle = ipcMain.handle.bind(ipcMain);

  // ──────────────── app / shell ────────────────
  handle('app:version', () => app.getVersion());
  handle('shell:openExternal', (_e, url: string) => shell.openExternal(url));

  // ──────────────── dashboard ────────────────
  handle('dashboard:get', () => ({
    dash: s.dashboard.build(),
    system: r.systemInfoRepo.get(),
    steamConfigured: !!r.steamConfigRepo.get(),
  }));

  // ──────────────── games ────────────────
  handle('games:list', (_e, filter: GameListFilter = {}) => ({
    games: s.games.list(filter),
    stats: { ...r.gameRepo.stats(), lastSync: s.dashboard.build().lastSync },
    system: r.systemInfoRepo.get(),
  }));

  handle('games:get', (_e, appid: string) => s.games.get(appid) ?? null);

  handle('games:save', (_e, p: SaveGamePayload) => {
    const appid = p.appid;
    if (!s.games.get(appid)) throw new Error('jogo nao encontrado');
    const action = p.action ?? 'save';
    if (action === 'clear_launch') s.games.clearLaunch(appid);
    else if (action === 'clear_notes') s.games.clearNotes(appid);
    else if (action === 'save_launch') s.games.saveLaunch(appid, p.user_launch_options?.trim() || null);
    else if (action === 'save_notes') s.games.saveNotes(appid, p.user_notes?.trim() || null);
    else s.games.updateOverride(appid, {
      user_launch_options: p.user_launch_options?.trim() || null,
      user_notes: p.user_notes?.trim() || null,
    });
    return s.games.get(appid) ?? null;
  });

  handle('games:community', (_e, appid: string) => c.protonDbComm.fetchReports(appid));
  handle('games:widescreen', (_e, { appid, force }: { appid: string; force?: boolean }) =>
    s.pcgw.fetchWidescreen(appid, { force: !!force }));
  handle('games:steamLaunch', (_e, appid: string) => s.steamApply.describe(appid));
  handle('games:applySteam', (_e, appid: string) => s.steamApply.apply(appid));

  // ──────────────── sync ────────────────
  handle('sync:run', () => s.sync.syncFromSteamLaunch());

  // ──────────────── check ("vai rodar?") ────────────────
  handle('check:search', async (_e, q: string) => {
    const query = (q ?? '').trim();
    if (query.length < 2) return { results: [] };
    return { results: await s.check.search(query) };
  });
  handle('check:detail', (_e, appid: string) => {
    if (!/^\d+$/.test(appid)) throw new Error('appid inválido');
    return s.check.check(appid);
  });

  // ──────────────── AI ────────────────
  handle('ai:getConfig', () => ({
    config: s.ai.getConfig(),
    providerModels: PROVIDER_MODELS,
    defaultBaseUrls: DEFAULT_BASE_URLS,
  }));
  handle('ai:setConfig', (_e, cfg: { provider: string; model: string; api_key?: string | null; base_url?: string | null }) => {
    if (!cfg?.provider || !cfg?.model) throw new Error('provider e model obrigatórios');
    if (!['anthropic', 'openai', 'ollama'].includes(cfg.provider)) throw new Error('provider inválido');
    s.ai.setConfig({
      provider: cfg.provider,
      model: cfg.model,
      api_key: cfg.api_key?.trim() || null,
      base_url: cfg.base_url?.trim() || null,
    });
    return s.ai.getConfig();
  });
  handle('ai:protonLog', (_e, appid: string) => s.ai.readProtonLog(appid));
  handle('ai:diagnose', (_e, appid: string) => s.ai.diagnose(appid));
  handle('ai:troubleshoot', (_e, { appid, problem, current_state }: { appid: string; problem: string; current_state: CurrentScreenState }) => {
    const p = (problem || '').trim();
    if (p.length < 5) throw new Error('descreva o problema (mínimo 5 caracteres)');
    if (!current_state) throw new Error('current_state ausente');
    return s.ai.troubleshoot(appid, p, current_state);
  });
  handle('ai:suggest', (_e, appid: string) => s.ai.suggest(appid));

  // ──────────────── steam credentials ────────────────
  handle('steam:getConfig', () => r.steamConfigRepo.get());
  handle('steam:setConfig', (_e, { steam_api_key, steam_id64 }: { steam_api_key?: string; steam_id64?: string }) => {
    const key = (steam_api_key ?? '').trim();
    const id = (steam_id64 ?? '').trim();
    if (!key || !id) throw new Error('api_key e steam_id64 obrigatórios');
    if (!/^[A-Fa-f0-9]{32}$/.test(key)) throw new Error('api_key inválida (precisa de 32 hex chars)');
    if (!/^7656119\d{10}$/.test(id)) throw new Error('steam_id64 inválido');
    r.steamConfigRepo.set({ api_key: key, steam_id64: id });
    return r.steamConfigRepo.get();
  });

  // ──────────────── system (wizard de pacotes) ────────────────
  handle('system:info', () => r.systemInfoRepo.get());
  handle('system:scan', () => s.system.groupStatuses());
  handle('system:sudoers', async () => {
    const scan = await s.system.scan();
    const tpl = s.system.sudoersTemplate(scan);
    return {
      user: scan.user,
      family: scan.distro.family,
      content: tpl.content,
      setupCommand: tpl.setupCommand,
      sudoersInstalled: scan.sudoersInstalled,
    };
  });

  // install com streaming de progresso via 'system:install:event'
  let installAbort: AbortController | null = null;
  handle('system:install', async (event, groupId: string) => {
    const send = (ev: unknown) => event.sender.send('system:install:event', ev);
    const scan = await s.system.scan();
    const group = s.system.getGroup(scan, groupId);
    if (!group) { send({ type: 'error', message: `grupo "${groupId}" nao existe pra distro "${scan.distro.family}"` }); send({ type: 'done', ok: false }); return { ok: false }; }
    if (!scan.sudoersInstalled) { send({ type: 'error', message: 'sudoers do ProtonDeck nao configurado. Rode o comando de setup primeiro.' }); send({ type: 'done', ok: false }); return { ok: false }; }
    const argvList = s.system.buildInstallArgs(scan, group);
    if (!argvList.length) { send({ type: 'error', message: 'grupo sem comandos a executar' }); send({ type: 'done', ok: false }); return { ok: false }; }

    installAbort = new AbortController();
    send({ type: 'start', groupId: group.id, label: group.label, commands: argvList.length });
    const result = await s.system.runSudoSequence(argvList, (ev) => send(ev), installAbort.signal);
    send({ type: 'done', ok: result.ok, failedAt: result.failedAt });
    installAbort = null;
    return { ok: result.ok, failedAt: result.failedAt };
  });
  ipcMain.on('system:install:cancel', () => installAbort?.abort());

  // ──────────────── backup & import ────────────────
  handle('backup:export', async () => {
    const payload = s.backup.buildExport(null);
    const win = getWindow();
    const filename = `protondeck-overrides-${new Date().toISOString().slice(0, 10)}.json`;
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Exportar overrides',
      defaultPath: filename,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, path: filePath };
  });

  handle('backup:import', async () => {
    const win = getWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Importar overrides',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths.length) return { phase: 'canceled' as const };
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(filePaths[0]!, 'utf8'));
    } catch {
      return { phase: 'error' as const, error: 'arquivo não é um JSON válido' };
    }
    const validation = s.backup.validatePayload(parsed);
    if (!validation.ok) return { phase: 'error' as const, error: validation.error };
    const plan = s.backup.buildPlan(validation.entries);
    const inLib = plan.filter(p => p.inLibrary).length;
    return {
      phase: 'preview' as const,
      summary: { total: plan.length, inLibrary: inLib, notInLibrary: plan.length - inLib },
      plan,
      payload: parsed,
    };
  });

  handle('backup:applyImport', (_e, payload: unknown) => {
    const validation = s.backup.validatePayload(payload);
    if (!validation.ok) throw new Error(validation.error);
    const plan = s.backup.buildPlan(validation.entries);
    const result = s.backup.apply(plan);
    return { phase: 'applied' as const, ...result, plan };
  });
}
