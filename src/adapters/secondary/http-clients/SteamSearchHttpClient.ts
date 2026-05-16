import { timeoutFetch } from '../shared/fetch.js';
import type { SteamSearchClient } from '../../../ports/CheckClients.js';
import type { ExternalCacheRepository } from '../../../ports/CacheRepository.js';
import type { SteamSearchHit } from '../../../domain/check/CheckResult.js';

const TTL = 60 * 60 * 1000;
const TIMEOUT_MS = 12000;

export class SteamSearchHttpClient implements SteamSearchClient {
  constructor(private readonly cache: ExternalCacheRepository) {}

  async search(query: string): Promise<SteamSearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const cacheKey = q.toLowerCase();

    const cached = this.cache.get('steam-search', cacheKey, TTL);
    if (cached?.status === 200) {
      try { return JSON.parse(cached.payload) as SteamSearchHit[]; } catch { /* */ }
    }

    try {
      const res = await timeoutFetch(`https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(q)}`, { timeoutMs: TIMEOUT_MS });
      if (!res.ok) {
        this.cache.set('steam-search', cacheKey, JSON.stringify([]), res.status);
        return [];
      }
      const raw = await res.json() as { appid: string; name: string; logo?: string }[];
      const hits: SteamSearchHit[] = raw.slice(0, 10).map(r => ({
        appid: String(r.appid),
        name: r.name,
        logo: r.logo ?? null,
      }));
      this.cache.set('steam-search', cacheKey, JSON.stringify(hits), 200);
      return hits;
    } catch {
      return [];
    }
  }
}
