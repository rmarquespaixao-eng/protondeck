import type { SyncUseCase } from '../ports/in/SyncUseCase.js';
import type { GameRepository, GameUpsert } from '../ports/out/GameRepository.js';
import type { SnapshotRepository } from '../ports/out/SnapshotRepository.js';
import type { SystemInfoRepository } from '../ports/out/SystemInfoRepository.js';
import type { SteamConfigRepository } from '../ports/out/SteamConfigRepository.js';
import type { SteamLibraryClient } from '../ports/out/SteamLibraryClient.js';
import type { InstalledGamesReader } from '../ports/out/InstalledGamesReader.js';
import type { SystemDetector } from '../ports/out/SystemDetector.js';
import type { ProtonDBClient } from '../ports/out/CheckClients.js';
import { buildLaunchFromPreset } from '../../domain/games/ConfigCatalog.js';
import type { OwnedLibrary, InstalledGame } from '../../domain/games/SteamLibrary.js';
import type { ProtonDBSummary } from '../../domain/check/CheckResult.js';
import type { SystemScan } from '../../domain/system/SystemTypes.js';

type SnapshotGame = {
  appid: string;
  name: string;
  installed: boolean;
  install_path: string | null;
  playtime_minutes: number;
  last_played: string | null;
  tier: string;
  trending_tier: string | null;
  confidence: string | null;
  reports: number;
  engine: string;
  engine_source: string;
  proton: string;
  launch_options: string;
  config_source: string;
  notes: string[];
};

export type Snapshot = {
  generated_at: string;
  system: SystemScan;
  library: { steam_id64: string; fetched_at: string; game_count: number };
  games: SnapshotGame[];
};

const PROTONDB_CONCURRENCY = 8;

function enrichDefaults(g: SnapshotGame, gpuVendor: 'nvidia' | 'amd' | 'intel' | null): { launch: string; source: string } {
  if (g.config_source !== 'generic') return { launch: g.launch_options, source: g.config_source };
  if (!g.engine) return { launch: g.launch_options, source: g.config_source };
  const built = buildLaunchFromPreset(g.engine, { gpuVendor });
  if (!built) return { launch: g.launch_options, source: g.config_source };
  return { launch: built, source: 'engine-default' };
}

async function fetchProtonDbBatch(
  protonDb: ProtonDBClient,
  appids: string[],
  concurrency: number,
): Promise<Map<string, ProtonDBSummary>> {
  const out = new Map<string, ProtonDBSummary>();
  for (let i = 0; i < appids.length; i += concurrency) {
    const slice = appids.slice(i, i + concurrency);
    const batch = await Promise.all(
      slice.map(async appid => [appid, await protonDb.fetchSummary(appid)] as const),
    );
    for (const [appid, summary] of batch) out.set(appid, summary);
  }
  return out;
}

export class SyncService implements SyncUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly snapshots: SnapshotRepository,
    private readonly systemInfo: SystemInfoRepository,
    private readonly steamConfig: SteamConfigRepository,
    private readonly steamLibrary: SteamLibraryClient,
    private readonly installedGames: InstalledGamesReader,
    private readonly systemDetector: SystemDetector,
    private readonly protonDb: ProtonDBClient,
  ) {}

  async syncFromSteamLaunch(): Promise<{ upserts: number; snapshot_id: number; generated_at: string }> {
    const cfg = this.steamConfig.get();
    if (!cfg) {
      throw new Error('Steam credentials nao configuradas. Cadastre em /steam-settings antes de sincronizar.');
    }

    const system = await this.systemDetector.scan();
    const library = await this.steamLibrary.getOwnedGames(cfg.api_key, cfg.steam_id64);
    const installed = await this.installedGames.listInstalled();
    const installedByAppid = new Map<string, InstalledGame>(installed.map(g => [g.appid, g]));

    const appids = library.games.map(g => g.appid);
    const protonMap = await fetchProtonDbBatch(this.protonDb, appids, PROTONDB_CONCURRENCY);

    const gpuVendor = system.gpu.vendor === 'unknown' ? null : system.gpu.vendor;

    const games: SnapshotGame[] = library.games.map(g => {
      const inst = installedByAppid.get(g.appid);
      const proton = protonMap.get(g.appid);
      const base: SnapshotGame = {
        appid: g.appid,
        name: g.name,
        installed: !!inst,
        install_path: inst?.install_path ?? null,
        playtime_minutes: g.playtime_minutes,
        last_played: g.last_played,
        tier: proton?.tier ?? 'pending',
        trending_tier: proton?.trendingTier ?? null,
        confidence: proton?.confidence ?? null,
        reports: proton?.total ?? 0,
        engine: '',
        engine_source: 'fallback',
        proton: '',
        launch_options: '',
        config_source: 'generic',
        notes: [],
      };
      return base;
    });

    const snap: Snapshot = {
      generated_at: new Date().toISOString(),
      system,
      library: { steam_id64: library.steam_id64, fetched_at: library.fetched_at, game_count: library.game_count },
      games,
    };

    const result = this.applySnapshot(snap, gpuVendor);
    return { ...result, generated_at: snap.generated_at };
  }

  applySnapshot(snap: Snapshot, gpuVendorOverride?: 'nvidia' | 'amd' | 'intel' | null): { upserts: number; snapshot_id: number } {
    const now = new Date().toISOString();
    const gpuVendor = gpuVendorOverride !== undefined
      ? gpuVendorOverride
      : (snap.system.gpu.vendor === 'unknown' ? null : snap.system.gpu.vendor);
    const upserts: GameUpsert[] = snap.games.map(g => {
      const enriched = enrichDefaults(g, gpuVendor);
      return {
        appid: g.appid,
        name: g.name,
        installed: g.installed ? 1 : 0,
        install_path: g.install_path,
        playtime_minutes: g.playtime_minutes,
        last_played: g.last_played,
        tier: g.tier,
        trending_tier: g.trending_tier,
        confidence: g.confidence,
        reports: g.reports,
        engine: g.engine,
        engine_source: g.engine_source,
        proton: g.proton,
        launch_options: enriched.launch,
        config_source: enriched.source,
        notes_json: JSON.stringify(g.notes ?? []),
        updated_at: now,
      };
    });
    this.games.upsertMany(upserts);
    const snapResult = this.snapshots.insert({
      generated_at: snap.generated_at,
      steam_id64: snap.library.steam_id64,
      game_count: snap.library.game_count,
      raw_json: JSON.stringify(snap),
    });
    this.systemInfo.upsert(snap.generated_at, JSON.stringify(snap.system));
    return { upserts: snap.games.length, snapshot_id: snapResult.id };
  }
}
