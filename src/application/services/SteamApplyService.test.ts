import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SteamApplyService } from './SteamApplyService.js';
import { InMemoryGameRepository, makeGameRow } from '../../test/fakes/InMemoryGameRepository.js';
import { InMemorySteamConfigRepository } from '../../test/fakes/InMemoryCommonRepositories.js';
import type {
  SteamLocalConfigClient, ApplyLaunchResult,
} from '../../application/ports/out/SteamLocalConfigClient.js';

function buildSvc(opts: {
  configured?: boolean;
  fileExists?: boolean;
  steamRunning?: boolean;
  currentLaunch?: string | null;
  applyResult?: ApplyLaunchResult;
} = {}) {
  const games = new InMemoryGameRepository();
  games.seed([
    makeGameRow({ appid: '620', user_launch_options: 'MANGOHUD=1 %command%' }),
    makeGameRow({ appid: '730', user_launch_options: null }),
  ]);
  const steamConfig = new InMemorySteamConfigRepository();
  if (opts.configured ?? true) {
    steamConfig.set({ api_key: 'A'.repeat(32), steam_id64: '76561198110035598' });
  }
  const localConfig: SteamLocalConfigClient = {
    configPath(id) { return `/home/test/.steam/steam/userdata/${id}/config/localconfig.vdf`; },
    async exists(_id) { return opts.fileExists ?? true; },
    async isSteamRunning() { return opts.steamRunning ?? false; },
    async readLaunchOptions(_id, _appid) {
      return { found: opts.currentLaunch !== undefined, value: opts.currentLaunch ?? null };
    },
    async applyLaunchOptions(_id, appid, _val) {
      return opts.applyResult ?? {
        ok: true,
        path: `/home/test/.steam/steam/userdata/x/config/localconfig.vdf`,
        backupPath: `/home/test/.steam/steam/userdata/x/config/localconfig.vdf.protondeck.bak`,
        steamWasRunning: false,
      };
    },
  };
  return new SteamApplyService(games, steamConfig, localConfig);
}

test('describe: sem steam_config → configured=false', async () => {
  const svc = buildSvc({ configured: false });
  const r = await svc.describe('620');
  assert.equal(r.configured, false);
});

test('describe: configured + arquivo inexistente → available=false', async () => {
  const svc = buildSvc({ fileExists: false });
  const r = await svc.describe('620');
  if (r.configured) assert.equal(r.available, false);
});

test('describe: tudo OK, steam não rodando, mostra current value', async () => {
  const svc = buildSvc({ currentLaunch: 'OLD %command%' });
  const r = await svc.describe('620');
  if (r.configured && r.available) {
    assert.equal(r.steamRunning, false);
    assert.equal(r.currentInSteam, 'OLD %command%');
    assert.equal(r.foundInSteam, true);
  } else assert.fail('expected configured=true, available=true');
});

test('describe: steam rodando vira flag', async () => {
  const svc = buildSvc({ steamRunning: true });
  const r = await svc.describe('620');
  if (r.configured && r.available) assert.equal(r.steamRunning, true);
});

test('apply: jogo inexistente → error', async () => {
  const svc = buildSvc();
  const r = await svc.apply('999');
  assert.equal(r.ok, false);
  if ('error' in r) assert.match(r.error, /n[aã]o encontrado/i);
});

test('apply: jogo sem user_launch_options → error', async () => {
  const svc = buildSvc();
  const r = await svc.apply('730'); // user_launch_options null
  assert.equal(r.ok, false);
  if ('error' in r) assert.match(r.error, /override/i);
});

test('apply: sem steam_config → error', async () => {
  const svc = buildSvc({ configured: false });
  const r = await svc.apply('620');
  assert.equal(r.ok, false);
});

test('apply: caminho feliz retorna ApplyLaunchResult ok', async () => {
  const svc = buildSvc();
  const r = await svc.apply('620');
  assert.equal(r.ok, true);
  if ('backupPath' in r) assert.match(r.backupPath ?? '', /protondeck\.bak$/);
});

test('apply: steam rodando → ok=false com reason', async () => {
  const svc = buildSvc({
    applyResult: { ok: false, path: '/tmp/x', steamWasRunning: true, reason: 'Steam está rodando' },
  });
  const r = await svc.apply('620');
  assert.equal(r.ok, false);
  if ('reason' in r) assert.match(r.reason ?? '', /rodando/);
});

test('applyMany: aplica os com override e pula os sem', async () => {
  const svc = buildSvc();
  const r = await svc.applyMany(['620', '730']);
  assert.equal(r.applied, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.failed, 0);
  assert.equal(r.items.find(i => i.appid === '620')?.status, 'applied');
  assert.equal(r.items.find(i => i.appid === '730')?.status, 'skipped');
});

test('applyMany: appid inexistente vira failed (não derruba o lote)', async () => {
  const svc = buildSvc();
  const r = await svc.applyMany(['620', '999']);
  assert.equal(r.applied, 1);
  assert.equal(r.failed, 1);
  assert.equal(r.items.find(i => i.appid === '999')?.status, 'failed');
});

test('applyMany: deduplica appids repetidos', async () => {
  const svc = buildSvc();
  const r = await svc.applyMany(['620', '620', '620']);
  assert.equal(r.items.length, 1);
  assert.equal(r.applied, 1);
});

test('applyMany: sem steam_config → lança', async () => {
  const svc = buildSvc({ configured: false });
  await assert.rejects(() => svc.applyMany(['620']), /credentials/i);
});

test('applyMany: propaga steamWasRunning se algum apply marcou', async () => {
  const svc = buildSvc({
    applyResult: { ok: true, path: '/tmp/x', steamWasRunning: true },
  });
  const r = await svc.applyMany(['620']);
  assert.equal(r.steamWasRunning, true);
});
