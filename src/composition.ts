import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { openDatabase, runMigrations, type DB } from './adapters/out/persistence/sqlite/connection.js';
import { GameRepositorySqlite } from './adapters/out/persistence/sqlite/GameRepositorySqlite.js';
import { UserRepositorySqlite } from './adapters/out/persistence/sqlite/UserRepositorySqlite.js';
import { AIConfigRepositorySqlite, AICacheRepositorySqlite } from './adapters/out/persistence/sqlite/AIRepositoriesSqlite.js';
import { SteamConfigRepositorySqlite } from './adapters/out/persistence/sqlite/SteamConfigRepositorySqlite.js';
import { PCGWCacheRepositorySqlite, ExternalCacheRepositorySqlite } from './adapters/out/persistence/sqlite/CacheRepositoriesSqlite.js';
import { SnapshotRepositorySqlite } from './adapters/out/persistence/sqlite/SnapshotRepositorySqlite.js';
import { SystemInfoRepositorySqlite } from './adapters/out/persistence/sqlite/SystemInfoRepositorySqlite.js';

import { LinuxSystemDetector } from './adapters/out/system/LinuxSystemDetector.js';
import { SudoSystemRunner } from './adapters/out/system/SudoSystemRunner.js';

import { PCGWMediaWikiClient } from './adapters/out/http-clients/PCGWMediaWikiClient.js';
import { SteamSearchHttpClient } from './adapters/out/http-clients/SteamSearchHttpClient.js';
import { ProtonDBHttpClient } from './adapters/out/http-clients/ProtonDBHttpClient.js';
import { SteamStoreHttpClient } from './adapters/out/http-clients/SteamStoreHttpClient.js';
import { ProtonDBCommunityHttpClient } from './adapters/out/http-clients/ProtonDBCommunityHttpClient.js';

import { SteamLocalConfigFs } from './adapters/out/fs/SteamLocalConfigFs.js';
import { ProtonLogFs } from './adapters/out/fs/ProtonLogFs.js';

import { GamesService } from './application/services/GamesService.js';
import { DashboardService } from './application/services/DashboardService.js';
import { CheckService } from './application/services/CheckService.js';
import { PCGWService } from './application/services/PCGWService.js';
import { SystemService } from './application/services/SystemService.js';
import { BackupService } from './application/services/BackupService.js';
import { AuthService } from './application/services/AuthService.js';
import { SteamApplyService } from './application/services/SteamApplyService.js';
import { SyncService } from './application/services/SyncService.js';
import { AIService } from './application/services/AIService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type Composition = ReturnType<typeof buildComposition>;

export function buildComposition(opts: { dbPath?: string } = {}) {
  const DB_PATH = opts.dbPath ?? process.env.PROTONDECK_DB ?? join(__dirname, '..', 'data', 'panel.db');
  const COMMUNITY_CACHE_DIR = process.env.PROTONDECK_COMMUNITY_CACHE
    ?? join(__dirname, '..', 'data', 'community-cache');

  const db: DB = openDatabase(DB_PATH);
  runMigrations(db);

  // Repos
  const gameRepo        = new GameRepositorySqlite(db);
  const userRepo        = new UserRepositorySqlite(db);
  const aiConfigRepo    = new AIConfigRepositorySqlite(db);
  const aiCacheRepo     = new AICacheRepositorySqlite(db);
  const steamConfigRepo = new SteamConfigRepositorySqlite(db);
  const pcgwCacheRepo   = new PCGWCacheRepositorySqlite(db);
  const extCacheRepo    = new ExternalCacheRepositorySqlite(db);
  const snapshotRepo    = new SnapshotRepositorySqlite(db);
  const systemInfoRepo  = new SystemInfoRepositorySqlite(db);

  // Adapters externos
  const systemDetector = new LinuxSystemDetector();
  const systemRunner   = new SudoSystemRunner();
  const pcgwClient     = new PCGWMediaWikiClient(pcgwCacheRepo);
  const steamSearch    = new SteamSearchHttpClient(extCacheRepo);
  const protonDb       = new ProtonDBHttpClient(extCacheRepo);
  const steamStore     = new SteamStoreHttpClient(extCacheRepo);
  const protonDbComm   = new ProtonDBCommunityHttpClient(COMMUNITY_CACHE_DIR);
  const steamLocal     = new SteamLocalConfigFs();
  const protonLog      = new ProtonLogFs();

  // Services
  const games       = new GamesService(gameRepo);
  const dashboard   = new DashboardService(gameRepo, snapshotRepo);
  const check       = new CheckService(steamSearch, protonDb, steamStore, pcgwClient);
  const pcgw        = new PCGWService(pcgwClient);
  const system      = new SystemService(systemDetector, systemRunner);
  const backup      = new BackupService(gameRepo);
  const auth        = new AuthService(userRepo);
  const steamApply  = new SteamApplyService(gameRepo, steamConfigRepo, steamLocal);
  const sync        = new SyncService(gameRepo, snapshotRepo, systemInfoRepo, steamConfigRepo);
  const ai          = new AIService(aiConfigRepo, aiCacheRepo, gameRepo, systemInfoRepo, protonLog, protonDbComm);

  return {
    db, DB_PATH,
    repos: { gameRepo, userRepo, aiConfigRepo, aiCacheRepo, steamConfigRepo, pcgwCacheRepo, extCacheRepo, snapshotRepo, systemInfoRepo },
    clients: { systemDetector, systemRunner, pcgwClient, steamSearch, protonDb, steamStore, protonDbComm, steamLocal, protonLog },
    services: { games, dashboard, check, pcgw, system, backup, auth, steamApply, sync, ai },
  };
}
