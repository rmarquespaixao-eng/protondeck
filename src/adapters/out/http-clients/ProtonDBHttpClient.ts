import { timeoutFetch } from '../shared/fetch.js';
import type { ProtonDBClient } from '../../../application/ports/out/CheckClients.js';
import type { ExternalCacheRepository } from '../../../application/ports/out/CacheRepository.js';
import type { ProtonDBSummary } from '../../../domain/check/CheckResult.js';

const TTL_OK   = 24 * 60 * 60 * 1000;
const TTL_FAIL = 60 * 60 * 1000;
const TIMEOUT_MS = 12000;

export class ProtonDBHttpClient implements ProtonDBClient {
  constructor(private readonly cache: ExternalCacheRepository) {}

  async fetchSummary(appid: string): Promise<ProtonDBSummary> {
    const okCached = this.cache.get('protondb', appid, TTL_OK);
    if (okCached?.status === 200) {
      try { return JSON.parse(okCached.payload) as ProtonDBSummary; } catch { /* */ }
    }
    const failCached = this.cache.get('protondb', appid, TTL_FAIL);
    if (failCached && failCached.status !== 200) {
      try { return JSON.parse(failCached.payload) as ProtonDBSummary; } catch { /* */ }
    }

    const now = new Date().toISOString();
    try {
      const res = await timeoutFetch(`https://www.protondb.com/api/v1/reports/summaries/${appid}.json`, { timeoutMs: TIMEOUT_MS });
      if (!res.ok) {
        const payload: ProtonDBSummary = { appid, tier: 'pending', total: 0, fetched_at: now, found: false };
        this.cache.set('protondb', appid, JSON.stringify(payload), res.status);
        return payload;
      }
      const data = await res.json() as {
        tier: string; trendingTier?: string; bestReportedTier?: string;
        confidence?: string; score?: number; total?: number;
      };
      const payload: ProtonDBSummary = {
        appid,
        tier: data.tier,
        total: data.total ?? 0,
        fetched_at: now,
        found: true,
        ...(data.trendingTier ? { trendingTier: data.trendingTier } : {}),
        ...(data.bestReportedTier ? { bestReportedTier: data.bestReportedTier } : {}),
        ...(data.confidence ? { confidence: data.confidence } : {}),
        ...(data.score !== undefined ? { score: data.score } : {}),
      };
      this.cache.set('protondb', appid, JSON.stringify(payload), 200);
      return payload;
    } catch {
      return { appid, tier: 'pending', total: 0, fetched_at: now, found: false };
    }
  }
}
