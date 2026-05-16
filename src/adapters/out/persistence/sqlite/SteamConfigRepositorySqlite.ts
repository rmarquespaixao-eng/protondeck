import type { DB } from './connection.js';
import type { SteamConfigRepository, SteamConfigRow } from '../../../../application/ports/out/SteamConfigRepository.js';

export class SteamConfigRepositorySqlite implements SteamConfigRepository {
  constructor(private readonly db: DB) {}

  get(): SteamConfigRow | undefined {
    return this.db.prepare('SELECT api_key, steam_id64, updated_at FROM steam_config WHERE id = 1')
      .get() as SteamConfigRow | undefined;
  }

  set(cfg: { api_key: string; steam_id64: string }): void {
    this.db.prepare(`
      INSERT INTO steam_config (id, api_key, steam_id64, updated_at)
      VALUES (1, @api_key, @steam_id64, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        api_key = excluded.api_key,
        steam_id64 = excluded.steam_id64,
        updated_at = excluded.updated_at
    `).run({ ...cfg, updated_at: new Date().toISOString() });
  }
}
