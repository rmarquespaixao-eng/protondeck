import type { DB } from './connection.js';
import type { CacheRow, PCGWCacheRepository, ExternalCacheRepository } from '../../../../application/ports/out/CacheRepository.js';

export class PCGWCacheRepositorySqlite implements PCGWCacheRepository {
  constructor(private readonly db: DB) {}

  get(appid: string, ttlMs: number): CacheRow | null {
    const row = this.db.prepare('SELECT payload, fetched_at, status FROM pcgw_cache WHERE appid = ?')
      .get(appid) as CacheRow | undefined;
    if (!row) return null;
    if (Date.now() - new Date(row.fetched_at).getTime() > ttlMs) return null;
    return row;
  }

  set(appid: string, payload: string, status: number): void {
    this.db.prepare(`
      INSERT INTO pcgw_cache (appid, payload, fetched_at, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(appid) DO UPDATE SET
        payload = excluded.payload,
        fetched_at = excluded.fetched_at,
        status = excluded.status
    `).run(appid, payload, new Date().toISOString(), status);
  }
}

export class ExternalCacheRepositorySqlite implements ExternalCacheRepository {
  constructor(private readonly db: DB) {}

  get(scope: string, key: string, ttlMs: number): CacheRow | null {
    const row = this.db.prepare('SELECT payload, fetched_at, status FROM external_cache WHERE scope = ? AND cache_key = ?')
      .get(scope, key) as CacheRow | undefined;
    if (!row) return null;
    if (Date.now() - new Date(row.fetched_at).getTime() > ttlMs) return null;
    return row;
  }

  set(scope: string, key: string, payload: string, status: number): void {
    this.db.prepare(`
      INSERT INTO external_cache (scope, cache_key, payload, fetched_at, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(scope, cache_key) DO UPDATE SET
        payload = excluded.payload,
        fetched_at = excluded.fetched_at,
        status = excluded.status
    `).run(scope, key, payload, new Date().toISOString(), status);
  }
}
