import { timeoutFetch } from '../shared/fetch.js';
import type { SteamStoreClient } from '../../../ports/CheckClients.js';
import type { ExternalCacheRepository } from '../../../ports/CacheRepository.js';
import type { SteamStoreInfo } from '../../../domain/check/CheckResult.js';

const TTL_OK   = 24 * 60 * 60 * 1000;
const TTL_FAIL = 60 * 60 * 1000;
const TIMEOUT_MS = 12000;

type SteamStoreRaw = {
  name?: string;
  type?: string;
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
  release_date?: { date?: string; coming_soon?: boolean };
  developers?: string[];
  publishers?: string[];
  genres?: { description: string }[];
  categories?: { description: string }[];
  price_overview?: { final_formatted?: string };
  is_free?: boolean;
  header_image?: string;
  short_description?: string;
};

export class SteamStoreHttpClient implements SteamStoreClient {
  constructor(private readonly cache: ExternalCacheRepository) {}

  async fetchDetails(appid: string): Promise<SteamStoreInfo> {
    const okCached = this.cache.get('steamstore', appid, TTL_OK);
    if (okCached?.status === 200) {
      try { return JSON.parse(okCached.payload) as SteamStoreInfo; } catch { /* */ }
    }
    const failCached = this.cache.get('steamstore', appid, TTL_FAIL);
    if (failCached && failCached.status !== 200) {
      try { return JSON.parse(failCached.payload) as SteamStoreInfo; } catch { /* */ }
    }

    const now = new Date().toISOString();
    try {
      const res = await timeoutFetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=br&l=pt-br`, { timeoutMs: TIMEOUT_MS });
      if (!res.ok) {
        const payload: SteamStoreInfo = { appid, found: false, fetched_at: now };
        this.cache.set('steamstore', appid, JSON.stringify(payload), res.status);
        return payload;
      }
      const raw = await res.json() as Record<string, { success: boolean; data?: SteamStoreRaw }>;
      const entry = raw[appid];
      if (!entry?.success || !entry.data) {
        const payload: SteamStoreInfo = { appid, found: false, fetched_at: now };
        this.cache.set('steamstore', appid, JSON.stringify(payload), 404);
        return payload;
      }
      const d = entry.data;
      const payload: SteamStoreInfo = {
        appid,
        found: true,
        fetched_at: now,
        ...(d.name ? { name: d.name } : {}),
        ...(d.type ? { type: d.type } : {}),
        ...(d.platforms ? {
          platforms: { windows: !!d.platforms.windows, mac: !!d.platforms.mac, linux: !!d.platforms.linux }
        } : {}),
        ...(d.release_date?.date ? { releaseDate: d.release_date.date } : {}),
        ...(d.release_date?.coming_soon !== undefined ? { comingSoon: d.release_date.coming_soon } : {}),
        ...(d.developers ? { developers: d.developers } : {}),
        ...(d.publishers ? { publishers: d.publishers } : {}),
        ...(d.genres ? { genres: d.genres.map(g => g.description) } : {}),
        ...(d.categories ? { categories: d.categories.map(c => c.description) } : {}),
        ...(d.price_overview?.final_formatted ? { priceFormatted: d.price_overview.final_formatted } : {}),
        ...(d.is_free !== undefined ? { isFree: d.is_free } : {}),
        ...(d.header_image ? { headerImage: d.header_image } : {}),
        ...(d.short_description ? { shortDescription: d.short_description } : {}),
      };
      this.cache.set('steamstore', appid, JSON.stringify(payload), 200);
      return payload;
    } catch {
      return { appid, found: false, fetched_at: now };
    }
  }
}
