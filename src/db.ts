import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { buildLaunchFromPreset } from './config-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'panel.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    appid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    installed INTEGER NOT NULL DEFAULT 0,
    install_path TEXT,
    playtime_minutes INTEGER NOT NULL DEFAULT 0,
    last_played TEXT,
    tier TEXT NOT NULL,
    trending_tier TEXT,
    confidence TEXT,
    reports INTEGER NOT NULL DEFAULT 0,
    engine TEXT,
    engine_source TEXT,
    proton TEXT,
    launch_options TEXT,
    config_source TEXT,
    notes_json TEXT,
    user_launch_options TEXT,
    user_notes TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_games_tier ON games(tier);
  CREATE INDEX IF NOT EXISTS idx_games_installed ON games(installed);
  CREATE INDEX IF NOT EXISTS idx_games_engine ON games(engine);

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generated_at TEXT NOT NULL,
    steam_id64 TEXT NOT NULL,
    game_count INTEGER NOT NULL,
    raw_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_info (
    id INTEGER PRIMARY KEY,
    detected_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );

  DROP TABLE IF EXISTS game_rules;

  CREATE TABLE IF NOT EXISTS ai_config (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT,
    base_url TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS steam_config (
    id INTEGER PRIMARY KEY,
    api_key TEXT NOT NULL,
    steam_id64 TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pcgw_cache (
    appid TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    status INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS external_cache (
    scope TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    status INTEGER NOT NULL,
    PRIMARY KEY (scope, cache_key)
  );
`);

export type GameRow = {
  appid: string;
  name: string;
  installed: number;
  install_path: string | null;
  playtime_minutes: number;
  last_played: string | null;
  tier: string;
  trending_tier: string | null;
  confidence: string | null;
  reports: number;
  engine: string | null;
  engine_source: string | null;
  proton: string | null;
  launch_options: string | null;
  config_source: string | null;
  notes_json: string | null;
  user_launch_options: string | null;
  user_notes: string | null;
  updated_at: string;
};

export type SnapshotGame = {
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

const upsertStmt = db.prepare(`
  INSERT INTO games (
    appid, name, installed, install_path, playtime_minutes, last_played,
    tier, trending_tier, confidence, reports,
    engine, engine_source, proton, launch_options, config_source, notes_json,
    updated_at
  ) VALUES (
    @appid, @name, @installed, @install_path, @playtime_minutes, @last_played,
    @tier, @trending_tier, @confidence, @reports,
    @engine, @engine_source, @proton, @launch_options, @config_source, @notes_json,
    @updated_at
  )
  ON CONFLICT(appid) DO UPDATE SET
    name = excluded.name,
    installed = excluded.installed,
    install_path = excluded.install_path,
    playtime_minutes = excluded.playtime_minutes,
    last_played = excluded.last_played,
    tier = excluded.tier,
    trending_tier = excluded.trending_tier,
    confidence = excluded.confidence,
    reports = excluded.reports,
    engine = excluded.engine,
    engine_source = excluded.engine_source,
    proton = excluded.proton,
    launch_options = excluded.launch_options,
    config_source = excluded.config_source,
    notes_json = excluded.notes_json,
    updated_at = excluded.updated_at
`);

function detectGpuVendor(rawSys: unknown): 'nvidia' | 'amd' | 'intel' | null {
  const sys = rawSys as { gpu?: { vendor?: string; name?: string; model?: string } } | null;
  if (!sys?.gpu) return null;
  const blob = `${sys.gpu.vendor ?? ''} ${sys.gpu.name ?? ''} ${sys.gpu.model ?? ''}`.toLowerCase();
  if (blob.includes('nvidia')) return 'nvidia';
  if (blob.includes('amd') || blob.includes('radeon')) return 'amd';
  if (blob.includes('intel')) return 'intel';
  return null;
}

// Se o sync devolveu config_source='generic' E temos engine conhecido com preset,
// gera uma launch_options enriquecida usando o preset + GPU vendor do sistema.
function enrichDefaults(g: SnapshotGame, gpuVendor: ReturnType<typeof detectGpuVendor>): { launch: string; source: string } {
  if (g.config_source !== 'generic') return { launch: g.launch_options, source: g.config_source };
  if (!g.engine) return { launch: g.launch_options, source: g.config_source };
  const built = buildLaunchFromPreset(g.engine, { gpuVendor });
  if (!built) return { launch: g.launch_options, source: g.config_source };
  return { launch: built, source: 'engine-default' };
}

export function applySnapshot(snap: Snapshot): { upserts: number; snapshot_id: number } {
  const now = new Date().toISOString();
  const gpuVendor = detectGpuVendor(snap.system);
  const tx = db.transaction((games: SnapshotGame[]) => {
    for (const g of games) {
      const enriched = enrichDefaults(g, gpuVendor);
      upsertStmt.run({
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
        updated_at: now
      });
    }
  });
  tx(snap.games);

  const snapStmt = db.prepare(`
    INSERT INTO snapshots (generated_at, steam_id64, game_count, raw_json)
    VALUES (?, ?, ?, ?)
  `);
  const info = snapStmt.run(snap.generated_at, snap.library.steam_id64, snap.library.game_count, JSON.stringify(snap));

  const sysStmt = db.prepare(`
    INSERT INTO system_info (id, detected_at, payload_json) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET detected_at = excluded.detected_at, payload_json = excluded.payload_json
  `);
  sysStmt.run(snap.generated_at, JSON.stringify(snap.system));

  return { upserts: snap.games.length, snapshot_id: Number(info.lastInsertRowid) };
}

const tierOrder = `CASE tier
  WHEN 'borked' THEN 0
  WHEN 'pending' THEN 1
  WHEN 'bronze' THEN 2
  WHEN 'silver' THEN 3
  WHEN 'gold' THEN 4
  WHEN 'platinum' THEN 5
  WHEN 'native' THEN 6
  ELSE 99
END`;

export function listGames(params: { tier?: string; search?: string; installed?: boolean } = {}): GameRow[] {
  const where: string[] = [];
  const args: Record<string, unknown> = {};
  if (params.tier) {
    const tiers = params.tier.split(',').map(s => s.trim());
    where.push(`tier IN (${tiers.map((_, i) => `@t${i}`).join(', ')})`);
    tiers.forEach((t, i) => { args[`t${i}`] = t; });
  }
  if (params.search) {
    where.push(`(name LIKE @search OR appid = @appid_exact)`);
    args.search = `%${params.search}%`;
    args.appid_exact = params.search;
  }
  if (params.installed !== undefined) {
    where.push(`installed = @installed`);
    args.installed = params.installed ? 1 : 0;
  }
  const sql = `
    SELECT * FROM games
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${tierOrder}, playtime_minutes DESC, name COLLATE NOCASE
  `;
  return db.prepare(sql).all(args) as GameRow[];
}

export function getGame(appid: string): GameRow | undefined {
  return db.prepare('SELECT * FROM games WHERE appid = ?').get(appid) as GameRow | undefined;
}

export function updateGameUserFields(appid: string, fields: { user_launch_options?: string | null; user_notes?: string | null }): void {
  db.prepare(`
    UPDATE games SET
      user_launch_options = COALESCE(@user_launch_options, user_launch_options),
      user_notes = COALESCE(@user_notes, user_notes),
      updated_at = @updated_at
    WHERE appid = @appid
  `).run({
    appid,
    user_launch_options: fields.user_launch_options ?? null,
    user_notes: fields.user_notes ?? null,
    updated_at: new Date().toISOString()
  });
}

export function clearGameUserFields(appid: string, fields: { user_launch_options?: boolean; user_notes?: boolean }): void {
  const sets: string[] = [];
  if (fields.user_launch_options) sets.push('user_launch_options = NULL');
  if (fields.user_notes) sets.push('user_notes = NULL');
  if (!sets.length) return;
  sets.push("updated_at = ?");
  db.prepare(`UPDATE games SET ${sets.join(', ')} WHERE appid = ?`).run(new Date().toISOString(), appid);
}

export type GameOverrideRow = {
  appid: string;
  name: string;
  user_launch_options: string | null;
  user_notes: string | null;
};

export function listOverrides(): GameOverrideRow[] {
  return db.prepare(`
    SELECT appid, name, user_launch_options, user_notes FROM games
    WHERE user_launch_options IS NOT NULL OR user_notes IS NOT NULL
    ORDER BY name COLLATE NOCASE
  `).all() as GameOverrideRow[];
}

export type ImportPlanEntry = {
  appid: string;
  name: string | null;
  inLibrary: boolean;
  user_launch_options: string | null;
  user_notes: string | null;
};

export function buildImportPlan(entries: { appid: string; user_launch_options?: string | null; user_notes?: string | null }[]): ImportPlanEntry[] {
  const plan: ImportPlanEntry[] = [];
  const lookup = db.prepare('SELECT name FROM games WHERE appid = ?');
  for (const e of entries) {
    const row = lookup.get(e.appid) as { name: string } | undefined;
    plan.push({
      appid: e.appid,
      name: row?.name ?? null,
      inLibrary: !!row,
      user_launch_options: e.user_launch_options ?? null,
      user_notes: e.user_notes ?? null,
    });
  }
  return plan;
}

export function applyImport(entries: ImportPlanEntry[]): { applied: number; skipped: number } {
  let applied = 0, skipped = 0;
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE games SET
      user_launch_options = @user_launch_options,
      user_notes = @user_notes,
      updated_at = @updated_at
    WHERE appid = @appid
  `);
  const tx = db.transaction((items: ImportPlanEntry[]) => {
    for (const it of items) {
      if (!it.inLibrary) { skipped++; continue; }
      stmt.run({
        appid: it.appid,
        user_launch_options: it.user_launch_options,
        user_notes: it.user_notes,
        updated_at: now,
      });
      applied++;
    }
  });
  tx(entries);
  return { applied, skipped };
}

export function getStats(): { total: number; byTier: Record<string, number>; installed: number; lastSync: string | null } {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }).n;
  const byTier: Record<string, number> = {};
  for (const row of db.prepare('SELECT tier, COUNT(*) AS n FROM games GROUP BY tier').all() as { tier: string; n: number }[]) {
    byTier[row.tier] = row.n;
  }
  const installed = (db.prepare('SELECT COUNT(*) AS n FROM games WHERE installed = 1').get() as { n: number }).n;
  const last = db.prepare('SELECT generated_at FROM snapshots ORDER BY id DESC LIMIT 1').get() as { generated_at: string } | undefined;
  return { total, byTier, installed, lastSync: last?.generated_at ?? null };
}

export type DashboardData = {
  total: number;
  installed: number;
  byTier: Record<string, number>;
  overridesCount: number;
  totalPlaytimeHours: number;
  lastSync: string | null;
  recentlyPlayed: { appid: string; name: string; tier: string; playtime_minutes: number; last_played: string | null }[];
  recentlyOverridden: { appid: string; name: string; updated_at: string; user_launch_options: string | null }[];
};

export function getDashboardData(): DashboardData {
  const base = getStats();
  const overridesCount = (db.prepare(`
    SELECT COUNT(*) AS n FROM games
    WHERE user_launch_options IS NOT NULL OR user_notes IS NOT NULL
  `).get() as { n: number }).n;
  const playtimeSum = (db.prepare('SELECT COALESCE(SUM(playtime_minutes), 0) AS s FROM games').get() as { s: number }).s;
  const recentlyPlayed = db.prepare(`
    SELECT appid, name, tier, playtime_minutes, last_played FROM games
    WHERE last_played IS NOT NULL AND last_played != ''
    ORDER BY last_played DESC
    LIMIT 6
  `).all() as DashboardData['recentlyPlayed'];
  const recentlyOverridden = db.prepare(`
    SELECT appid, name, updated_at, user_launch_options FROM games
    WHERE user_launch_options IS NOT NULL OR user_notes IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 6
  `).all() as DashboardData['recentlyOverridden'];
  return {
    total: base.total,
    installed: base.installed,
    byTier: base.byTier,
    overridesCount,
    totalPlaytimeHours: Math.round(playtimeSum / 6) / 10,
    lastSync: base.lastSync,
    recentlyPlayed,
    recentlyOverridden,
  };
}

export function getSystemInfo(): unknown | null {
  const row = db.prepare('SELECT payload_json FROM system_info WHERE id = 1').get() as { payload_json: string } | undefined;
  return row ? JSON.parse(row.payload_json) : null;
}

// ───────── AI config + cache ─────────

export type AIConfigRow = {
  provider: string;
  model: string;
  api_key: string | null;
  base_url: string | null;
  updated_at: string;
};

export function getAIConfig(): AIConfigRow | undefined {
  return db.prepare('SELECT provider, model, api_key, base_url, updated_at FROM ai_config WHERE id = 1').get() as AIConfigRow | undefined;
}

export function setAIConfig(cfg: { provider: string; model: string; api_key: string | null; base_url: string | null }): void {
  db.prepare(`
    INSERT INTO ai_config (id, provider, model, api_key, base_url, updated_at)
    VALUES (1, @provider, @model, @api_key, @base_url, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      updated_at = excluded.updated_at
  `).run({ ...cfg, updated_at: new Date().toISOString() });
}

export function getAICache(key: string, ttlMs: number): string | null {
  const row = db.prepare('SELECT payload, created_at FROM ai_cache WHERE cache_key = ?').get(key) as { payload: string; created_at: string } | undefined;
  if (!row) return null;
  const age = Date.now() - new Date(row.created_at).getTime();
  if (age > ttlMs) return null;
  return row.payload;
}

export function setAICache(key: string, payload: string): void {
  db.prepare(`
    INSERT INTO ai_cache (cache_key, payload, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at
  `).run(key, payload, new Date().toISOString());
}

// ───────── Steam credentials ─────────

export type SteamConfigRow = {
  api_key: string;
  steam_id64: string;
  updated_at: string;
};

export function getSteamConfig(): SteamConfigRow | undefined {
  return db.prepare('SELECT api_key, steam_id64, updated_at FROM steam_config WHERE id = 1').get() as SteamConfigRow | undefined;
}

export function setSteamConfig(cfg: { api_key: string; steam_id64: string }): void {
  db.prepare(`
    INSERT INTO steam_config (id, api_key, steam_id64, updated_at)
    VALUES (1, @api_key, @steam_id64, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      api_key = excluded.api_key,
      steam_id64 = excluded.steam_id64,
      updated_at = excluded.updated_at
  `).run({ ...cfg, updated_at: new Date().toISOString() });
}

// ───────── Users / auth ─────────

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
};

export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function getUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function createUser(username: string, passwordHash: string): UserRow {
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, passwordHash, now);
  return { id: Number(info.lastInsertRowid), username, password_hash: passwordHash, created_at: now };
}

// ───────── PCGamingWiki cache ─────────

export type PCGWCacheRow = {
  appid: string;
  payload: string;
  fetched_at: string;
  status: number;
};

export function getPCGWCache(appid: string, ttlMs: number): PCGWCacheRow | null {
  const row = db.prepare('SELECT appid, payload, fetched_at, status FROM pcgw_cache WHERE appid = ?').get(appid) as PCGWCacheRow | undefined;
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (age > ttlMs) return null;
  return row;
}

export function setPCGWCache(appid: string, payload: string, status: number): void {
  db.prepare(`
    INSERT INTO pcgw_cache (appid, payload, fetched_at, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(appid) DO UPDATE SET
      payload = excluded.payload,
      fetched_at = excluded.fetched_at,
      status = excluded.status
  `).run(appid, payload, new Date().toISOString(), status);
}

// ───────── Cache externo generico (protondb, steamstore, steam-search) ─────────

export type ExternalCacheRow = {
  scope: string;
  cache_key: string;
  payload: string;
  fetched_at: string;
  status: number;
};

export function getExternalCache(scope: string, key: string, ttlMs: number): ExternalCacheRow | null {
  const row = db.prepare('SELECT scope, cache_key, payload, fetched_at, status FROM external_cache WHERE scope = ? AND cache_key = ?')
    .get(scope, key) as ExternalCacheRow | undefined;
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (age > ttlMs) return null;
  return row;
}

export function setExternalCache(scope: string, key: string, payload: string, status: number): void {
  db.prepare(`
    INSERT INTO external_cache (scope, cache_key, payload, fetched_at, status)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope, cache_key) DO UPDATE SET
      payload = excluded.payload,
      fetched_at = excluded.fetched_at,
      status = excluded.status
  `).run(scope, key, payload, new Date().toISOString(), status);
}
