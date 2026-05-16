import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export type DB = ReturnType<typeof Database>;

export function openDatabase(dbPath: string): DB {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function runMigrations(db: DB): void {
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
}
