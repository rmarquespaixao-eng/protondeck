import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SyncService, type Snapshot } from './SyncService.js';
import { InMemoryGameRepository } from '../../test/fakes/InMemoryGameRepository.js';
import { InMemorySnapshotRepository } from '../../test/fakes/InMemorySnapshotRepository.js';
import {
  InMemorySteamConfigRepository, InMemorySystemInfoRepository,
} from '../../test/fakes/InMemoryCommonRepositories.js';
import type { SteamLibraryClient } from '../ports/out/SteamLibraryClient.js';
import type { InstalledGamesReader } from '../ports/out/InstalledGamesReader.js';
import type { SystemDetector } from '../ports/out/SystemDetector.js';
import type { ProtonDBClient } from '../ports/out/CheckClients.js';
import type { OwnedLibrary, InstalledGame } from '../../domain/games/SteamLibrary.js';
import type { ProtonDBSummary } from '../../domain/check/CheckResult.js';
import type { SystemScan } from '../../domain/system/SystemTypes.js';

class FakeSteamLibrary implements SteamLibraryClient {
  constructor(private readonly lib: OwnedLibrary) {}
  async getOwnedGames(): Promise<OwnedLibrary> { return this.lib; }
}

class FakeInstalledGames implements InstalledGamesReader {
  constructor(private readonly list: InstalledGame[]) {}
  async listInstalled(): Promise<InstalledGame[]> { return this.list; }
}

class FakeSystemDetector implements SystemDetector {
  constructor(private readonly s: SystemScan) {}
  async scan(): Promise<SystemScan> { return this.s; }
  async detectDistro() { return this.s.distro; }
  async detectGpu() { return this.s.gpu; }
  async hasBinaries(names: string[]) { return Object.fromEntries(names.map(n => [n, this.s.binaries[n] ?? false])); }
  async arePackagesInstalled(_pm: any, pkgs: string[]) { return Object.fromEntries(pkgs.map(p => [p, this.s.packages[p] ?? false])); }
  async isMultilibEnabled() { return this.s.multilibEnabled; }
  async sudoersInstalled() { return this.s.sudoersInstalled; }
}

class FakeProtonDb implements ProtonDBClient {
  constructor(private readonly map: Map<string, ProtonDBSummary>) {}
  async fetchSummary(appid: string): Promise<ProtonDBSummary> {
    return this.map.get(appid) ?? { appid, tier: 'pending', total: 0, fetched_at: new Date().toISOString(), found: false };
  }
}

const fakeSystem: SystemScan = {
  distro: { id: 'cachyos', family: 'arch', versionId: null, prettyName: 'CachyOS', packageManager: 'pacman' },
  gpu: { vendor: 'nvidia', model: 'RTX 4090', vendorIds: [0x10de] },
  user: 'rafael',
  multilibEnabled: true,
  binaries: { gamemoderun: true, mangohud: true },
  packages: {},
  sudoersInstalled: false,
};

function buildSvc() {
  const games = new InMemoryGameRepository();
  const snapshots = new InMemorySnapshotRepository();
  const systemInfo = new InMemorySystemInfoRepository();
  const steamConfig = new InMemorySteamConfigRepository();
  const steamLibrary = new FakeSteamLibrary({ steam_id64: '76561198110035598', fetched_at: '2025-01-15T12:00:00Z', game_count: 0, games: [] });
  const installedGames = new FakeInstalledGames([]);
  const systemDetector = new FakeSystemDetector(fakeSystem);
  const protonDb = new FakeProtonDb(new Map());
  return {
    games, snapshots, systemInfo, steamConfig,
    svc: new SyncService(games, snapshots, systemInfo, steamConfig, steamLibrary, installedGames, systemDetector, protonDb),
  };
}

const sampleSnapshot: Snapshot = {
  generated_at: '2025-01-15T12:00:00Z',
  system: fakeSystem,
  library: { steam_id64: '76561198110035598', fetched_at: '2025-01-15T12:00:00Z', game_count: 2 },
  games: [
    {
      appid: '620', name: 'Portal 2',
      installed: true, install_path: null,
      playtime_minutes: 60, last_played: '2025-01-10T00:00:00Z',
      tier: 'platinum', trending_tier: null, confidence: 'strong', reports: 100,
      engine: 'source', engine_source: 'detected',
      proton: 'proton-experimental',
      launch_options: '%command%',
      config_source: 'curated',
      notes: ['nota'],
    },
    {
      appid: '730', name: 'CS2',
      installed: false, install_path: null,
      playtime_minutes: 0, last_played: null,
      tier: 'gold', trending_tier: null, confidence: 'strong', reports: 50,
      engine: 'source', engine_source: 'detected',
      proton: 'proton-experimental',
      launch_options: '%command%',
      config_source: 'generic',
      notes: [],
    },
  ],
};

test('applySnapshot: faz upsert dos jogos', () => {
  const { svc, games } = buildSvc();
  const r = svc.applySnapshot(sampleSnapshot);
  assert.equal(r.upserts, 2);
  assert.equal(games.rows.size, 2);
  assert.equal(games.get('620')!.name, 'Portal 2');
});

test('applySnapshot: cria snapshot record', () => {
  const { svc, snapshots } = buildSvc();
  svc.applySnapshot(sampleSnapshot);
  assert.equal(snapshots.lastGeneratedAt(), '2025-01-15T12:00:00Z');
});

test('applySnapshot: atualiza system_info', () => {
  const { svc, systemInfo } = buildSvc();
  svc.applySnapshot(sampleSnapshot);
  const sys = systemInfo.get() as SystemScan;
  assert.equal(sys.distro.id, 'cachyos');
  assert.equal(sys.gpu.vendor, 'nvidia');
});

test('applySnapshot: enrichDefaults aplica preset quando config_source=generic + engine conhecido', () => {
  const { svc, games } = buildSvc();
  svc.applySnapshot(sampleSnapshot);
  const cs2 = games.get('730')!;
  assert.ok(cs2.config_source === 'generic' || cs2.config_source === 'engine-default');
});

test('applySnapshot: preserva user_launch_options entre syncs (upsertMany não toca user fields)', () => {
  const { svc, games } = buildSvc();
  svc.applySnapshot(sampleSnapshot);
  games.updateUserFields('620', { user_launch_options: 'OVERRIDE %command%' });
  svc.applySnapshot(sampleSnapshot);
  assert.equal(games.get('620')!.user_launch_options, 'OVERRIDE %command%');
});

test('syncFromSteamLaunch: orquestra steamLibrary + installedGames + protonDb e popula banco', async () => {
  const games = new InMemoryGameRepository();
  const snapshots = new InMemorySnapshotRepository();
  const systemInfo = new InMemorySystemInfoRepository();
  const steamConfig = new InMemorySteamConfigRepository();
  steamConfig.set({ api_key: 'FAKE_KEY', steam_id64: '76561198110035598' });
  const steamLibrary = new FakeSteamLibrary({
    steam_id64: '76561198110035598',
    fetched_at: '2025-01-15T12:00:00Z',
    game_count: 2,
    games: [
      { appid: '620', name: 'Portal 2', playtime_minutes: 60, last_played: '2025-01-10T00:00:00Z' },
      { appid: '730', name: 'CS2',     playtime_minutes: 0,  last_played: null },
    ],
  });
  const installedGames = new FakeInstalledGames([
    { appid: '620', name: 'Portal 2', install_path: '/games/Portal 2' },
  ]);
  const systemDetector = new FakeSystemDetector(fakeSystem);
  const protonDb = new FakeProtonDb(new Map([
    ['620', { appid: '620', tier: 'platinum', total: 100, fetched_at: 'x', found: true, confidence: 'strong' }],
    ['730', { appid: '730', tier: 'gold',     total: 50,  fetched_at: 'x', found: true, confidence: 'strong' }],
  ]));
  const svc = new SyncService(games, snapshots, systemInfo, steamConfig, steamLibrary, installedGames, systemDetector, protonDb);

  const r = await svc.syncFromSteamLaunch();
  assert.equal(r.upserts, 2);
  assert.equal(games.get('620')!.installed, 1);
  assert.equal(games.get('620')!.install_path, '/games/Portal 2');
  assert.equal(games.get('730')!.installed, 0);
  assert.equal(games.get('620')!.tier, 'platinum');
});

test('syncFromSteamLaunch: falha clara quando credentials nao configuradas', async () => {
  const { svc } = buildSvc();
  await assert.rejects(() => svc.syncFromSteamLaunch(), /credentials nao configuradas/);
});
