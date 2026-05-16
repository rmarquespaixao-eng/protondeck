/**
 * Fakes in-memory pros outbound ports stateful que sao usados em mais de um teste.
 * Pros clients HTTP stateless, declaramos object literals nos proprios test files.
 */
import type { SteamConfigRepository, SteamConfigRow } from '../../application/ports/out/SteamConfigRepository.js';
import type { SystemInfoRepository } from '../../application/ports/out/SystemInfoRepository.js';
import type { AIConfigRepository, AICacheRepository, AIConfigRow } from '../../application/ports/out/AIConfigRepository.js';
import type { PCGWCacheRepository, ExternalCacheRepository, CacheRow } from '../../application/ports/out/CacheRepository.js';

export class InMemorySteamConfigRepository implements SteamConfigRepository {
  private row: SteamConfigRow | undefined;
  get(): SteamConfigRow | undefined { return this.row; }
  set(cfg: { api_key: string; steam_id64: string }): void {
    this.row = { ...cfg, updated_at: new Date().toISOString() };
  }
}

export class InMemorySystemInfoRepository implements SystemInfoRepository {
  private payload: { detectedAt: string; json: string } | null = null;
  upsert(detectedAt: string, payloadJson: string): void {
    this.payload = { detectedAt, json: payloadJson };
  }
  get(): unknown | null {
    return this.payload ? JSON.parse(this.payload.json) : null;
  }
}

export class InMemoryAIConfigRepository implements AIConfigRepository {
  private row: AIConfigRow | undefined;
  get(): AIConfigRow | undefined { return this.row; }
  set(cfg: { provider: string; model: string; api_key: string | null; base_url: string | null }): void {
    this.row = { ...cfg, updated_at: new Date().toISOString() };
  }
}

export class InMemoryAICacheRepository implements AICacheRepository {
  private store = new Map<string, { payload: string; created_at: number }>();
  get(key: string, ttlMs: number): string | null {
    const row = this.store.get(key);
    if (!row) return null;
    if (Date.now() - row.created_at > ttlMs) return null;
    return row.payload;
  }
  set(key: string, payload: string): void {
    this.store.set(key, { payload, created_at: Date.now() });
  }
  /** Helper pros testes — pre-popula cache. */
  preseed(key: string, payload: string): void {
    this.store.set(key, { payload, created_at: Date.now() });
  }
}

export class InMemoryPCGWCacheRepository implements PCGWCacheRepository {
  private store = new Map<string, CacheRow>();
  get(appid: string, ttlMs: number): CacheRow | null {
    const row = this.store.get(appid);
    if (!row) return null;
    if (Date.now() - new Date(row.fetched_at).getTime() > ttlMs) return null;
    return row;
  }
  set(appid: string, payload: string, status: number): void {
    this.store.set(appid, { payload, fetched_at: new Date().toISOString(), status });
  }
}

export class InMemoryExternalCacheRepository implements ExternalCacheRepository {
  private store = new Map<string, CacheRow>();
  private k(scope: string, key: string): string { return `${scope}::${key}`; }
  get(scope: string, key: string, ttlMs: number): CacheRow | null {
    const row = this.store.get(this.k(scope, key));
    if (!row) return null;
    if (Date.now() - new Date(row.fetched_at).getTime() > ttlMs) return null;
    return row;
  }
  set(scope: string, key: string, payload: string, status: number): void {
    this.store.set(this.k(scope, key), { payload, fetched_at: new Date().toISOString(), status });
  }
}
