import type { DB } from './connection.js';
import type { AIConfigRepository, AIConfigRow, AICacheRepository } from '../../../../application/ports/out/AIConfigRepository.js';

export class AIConfigRepositorySqlite implements AIConfigRepository {
  constructor(private readonly db: DB) {}

  get(): AIConfigRow | undefined {
    return this.db.prepare('SELECT provider, model, api_key, base_url, updated_at FROM ai_config WHERE id = 1')
      .get() as AIConfigRow | undefined;
  }

  set(cfg: { provider: string; model: string; api_key: string | null; base_url: string | null }): void {
    this.db.prepare(`
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
}

export class AICacheRepositorySqlite implements AICacheRepository {
  constructor(private readonly db: DB) {}

  get(key: string, ttlMs: number): string | null {
    const row = this.db.prepare('SELECT payload, created_at FROM ai_cache WHERE cache_key = ?')
      .get(key) as { payload: string; created_at: string } | undefined;
    if (!row) return null;
    const age = Date.now() - new Date(row.created_at).getTime();
    if (age > ttlMs) return null;
    return row.payload;
  }

  set(key: string, payload: string): void {
    this.db.prepare(`
      INSERT INTO ai_cache (cache_key, payload, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at
    `).run(key, payload, new Date().toISOString());
  }
}
