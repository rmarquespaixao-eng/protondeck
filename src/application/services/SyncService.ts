import { execFile } from 'node:child_process';
import type { SyncUseCase } from '../ports/in/SyncUseCase.js';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { GameRepository, GameUpsert } from '../ports/out/GameRepository.js';
import type { SnapshotRepository } from '../ports/out/SnapshotRepository.js';
import type { SystemInfoRepository } from '../ports/out/SystemInfoRepository.js';
import type { SteamConfigRepository } from '../ports/out/SteamConfigRepository.js';
import { buildLaunchFromPreset } from '../../domain/games/ConfigCatalog.js';

const execFileAsync = promisify(execFile);

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
  system: unknown;
  library: { steam_id64: string; fetched_at: string; game_count: number };
  games: SnapshotGame[];
};

function detectGpuVendor(rawSys: unknown): 'nvidia' | 'amd' | 'intel' | null {
  const sys = rawSys as { gpu?: { vendor?: string; name?: string; model?: string } } | null;
  if (!sys?.gpu) return null;
  const blob = `${sys.gpu.vendor ?? ''} ${sys.gpu.name ?? ''} ${sys.gpu.model ?? ''}`.toLowerCase();
  if (blob.includes('nvidia')) return 'nvidia';
  if (blob.includes('amd') || blob.includes('radeon')) return 'amd';
  if (blob.includes('intel')) return 'intel';
  return null;
}

function enrichDefaults(g: SnapshotGame, gpuVendor: ReturnType<typeof detectGpuVendor>): { launch: string; source: string } {
  if (g.config_source !== 'generic') return { launch: g.launch_options, source: g.config_source };
  if (!g.engine) return { launch: g.launch_options, source: g.config_source };
  const built = buildLaunchFromPreset(g.engine, { gpuVendor });
  if (!built) return { launch: g.launch_options, source: g.config_source };
  return { launch: built, source: 'engine-default' };
}

export class SyncService implements SyncUseCase {
  private readonly TOOL_PATH = process.env.STEAM_LAUNCH_TOOL
    ?? join(homedir(), '.claude', 'tools', 'steam-launch', 'steam-launch.mjs');
  private readonly CREDENTIALS_PATH = process.env.STEAM_LAUNCH_CREDENTIALS
    ?? join(homedir(), '.claude', 'tools', 'steam-launch', 'data', 'credentials.json');

  constructor(
    private readonly games: GameRepository,
    private readonly snapshots: SnapshotRepository,
    private readonly systemInfo: SystemInfoRepository,
    private readonly steamConfig: SteamConfigRepository,
  ) {}

  private writeCredentialsFromDB(): void {
    const cfg = this.steamConfig.get();
    if (!cfg) return;
    mkdirSync(dirname(this.CREDENTIALS_PATH), { recursive: true });
    writeFileSync(this.CREDENTIALS_PATH, JSON.stringify({
      steam_api_key: cfg.api_key,
      steam_id64: cfg.steam_id64,
    }, null, 2));
  }

  async syncFromSteamLaunch(): Promise<{ upserts: number; snapshot_id: number; generated_at: string }> {
    this.writeCredentialsFromDB();
    const { stdout } = await execFileAsync('node', [this.TOOL_PATH, 'dashboard:snapshot'], {
      maxBuffer: 50 * 1024 * 1024,
    });
    const snap = JSON.parse(stdout) as Snapshot;
    const result = this.applySnapshot(snap);
    return { ...result, generated_at: snap.generated_at };
  }

  applySnapshot(snap: Snapshot): { upserts: number; snapshot_id: number } {
    const now = new Date().toISOString();
    const gpuVendor = detectGpuVendor(snap.system);
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
