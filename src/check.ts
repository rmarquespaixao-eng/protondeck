import { getExternalCache, setExternalCache } from './db.js';
import { fetchWidescreenInfo, type WidescreenInfo } from './pcgw.js';

const UA = 'ProtonDeck/0.1 (homelab, single-user)';
const TIMEOUT_MS = 12000;

const TTL_SEARCH = 60 * 60 * 1000;          // 1h — busca pode mudar
const TTL_PROTONDB_OK   = 24 * 60 * 60 * 1000;
const TTL_PROTONDB_FAIL = 60 * 60 * 1000;
const TTL_STORE_OK   = 24 * 60 * 60 * 1000;
const TTL_STORE_FAIL = 60 * 60 * 1000;

function timeoutFetch(url: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('fetch timeout')), TIMEOUT_MS);
    fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers ?? {}) } })
      .then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

// ─── Steam search ────────────────────────────────────────────

export type SteamSearchHit = { appid: string; name: string; logo: string | null };

export async function searchSteam(query: string): Promise<SteamSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const cacheKey = q.toLowerCase();

  const cached = getExternalCache('steam-search', cacheKey, TTL_SEARCH);
  if (cached?.status === 200) {
    try { return JSON.parse(cached.payload) as SteamSearchHit[]; } catch { /* */ }
  }

  try {
    const res = await timeoutFetch(`https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(q)}`);
    if (!res.ok) {
      setExternalCache('steam-search', cacheKey, JSON.stringify([]), res.status);
      return [];
    }
    const raw = await res.json() as { appid: string; name: string; logo?: string }[];
    const hits: SteamSearchHit[] = raw.slice(0, 10).map(r => ({
      appid: String(r.appid),
      name: r.name,
      logo: r.logo ?? null,
    }));
    setExternalCache('steam-search', cacheKey, JSON.stringify(hits), 200);
    return hits;
  } catch {
    return [];
  }
}

// ─── ProtonDB ────────────────────────────────────────────────

export type ProtonDBSummary = {
  appid: string;
  tier: string;          // platinum/gold/silver/bronze/borked/pending/native
  trendingTier?: string;
  bestReportedTier?: string;
  confidence?: string;
  score?: number;
  total: number;
  fetched_at: string;
  found: boolean;
};

export async function fetchProtonDB(appid: string): Promise<ProtonDBSummary> {
  const okCached = getExternalCache('protondb', appid, TTL_PROTONDB_OK);
  if (okCached?.status === 200) {
    try { return JSON.parse(okCached.payload) as ProtonDBSummary; } catch { /* */ }
  }
  const failCached = getExternalCache('protondb', appid, TTL_PROTONDB_FAIL);
  if (failCached && failCached.status !== 200) {
    try { return JSON.parse(failCached.payload) as ProtonDBSummary; } catch { /* */ }
  }

  const now = new Date().toISOString();
  try {
    const res = await timeoutFetch(`https://www.protondb.com/api/v1/reports/summaries/${appid}.json`);
    if (res.status === 404) {
      const payload: ProtonDBSummary = { appid, tier: 'pending', total: 0, fetched_at: now, found: false };
      setExternalCache('protondb', appid, JSON.stringify(payload), 404);
      return payload;
    }
    if (!res.ok) {
      const payload: ProtonDBSummary = { appid, tier: 'pending', total: 0, fetched_at: now, found: false };
      setExternalCache('protondb', appid, JSON.stringify(payload), res.status);
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
    setExternalCache('protondb', appid, JSON.stringify(payload), 200);
    return payload;
  } catch {
    return { appid, tier: 'pending', total: 0, fetched_at: now, found: false };
  }
}

// ─── Steam Store appdetails ──────────────────────────────────

export type SteamStoreInfo = {
  appid: string;
  found: boolean;
  name?: string;
  type?: string;
  platforms?: { windows: boolean; mac: boolean; linux: boolean };
  releaseDate?: string;
  comingSoon?: boolean;
  developers?: string[];
  publishers?: string[];
  genres?: string[];
  categories?: string[];
  priceFormatted?: string;
  isFree?: boolean;
  headerImage?: string;
  shortDescription?: string;
  fetched_at: string;
};

export async function fetchSteamStore(appid: string): Promise<SteamStoreInfo> {
  const okCached = getExternalCache('steamstore', appid, TTL_STORE_OK);
  if (okCached?.status === 200) {
    try { return JSON.parse(okCached.payload) as SteamStoreInfo; } catch { /* */ }
  }
  const failCached = getExternalCache('steamstore', appid, TTL_STORE_FAIL);
  if (failCached && failCached.status !== 200) {
    try { return JSON.parse(failCached.payload) as SteamStoreInfo; } catch { /* */ }
  }

  const now = new Date().toISOString();
  try {
    const res = await timeoutFetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=br&l=pt-br`);
    if (!res.ok) {
      const payload: SteamStoreInfo = { appid, found: false, fetched_at: now };
      setExternalCache('steamstore', appid, JSON.stringify(payload), res.status);
      return payload;
    }
    const raw = await res.json() as Record<string, { success: boolean; data?: SteamStoreRaw }>;
    const entry = raw[appid];
    if (!entry?.success || !entry.data) {
      const payload: SteamStoreInfo = { appid, found: false, fetched_at: now };
      setExternalCache('steamstore', appid, JSON.stringify(payload), 404);
      return payload;
    }
    const d = entry.data;
    const payload: SteamStoreInfo = {
      appid,
      found: true,
      fetched_at: now,
      ...(d.name ? { name: d.name } : {}),
      ...(d.type ? { type: d.type } : {}),
      ...(d.platforms ? { platforms: {
        windows: !!d.platforms.windows,
        mac: !!d.platforms.mac,
        linux: !!d.platforms.linux,
      } } : {}),
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
    setExternalCache('steamstore', appid, JSON.stringify(payload), 200);
    return payload;
  } catch {
    return { appid, found: false, fetched_at: now };
  }
}

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

// ─── Result consolidado ──────────────────────────────────────

export type CheckRecommendation = 'go' | 'caution' | 'risky' | 'no-data' | 'unreleased';

export type CheckResult = {
  appid: string;
  store: SteamStoreInfo;
  protondb: ProtonDBSummary;
  pcgw: WidescreenInfo;
  recommendation: CheckRecommendation;
  reasons: string[];
};

const GO_TIERS    = new Set(['platinum', 'gold', 'native']);
const CAUTION_TIERS = new Set(['silver']);
const RISKY_TIERS = new Set(['bronze', 'borked']);

function computeRecommendation(store: SteamStoreInfo, proton: ProtonDBSummary, pcgw: WidescreenInfo): { rec: CheckRecommendation; reasons: string[] } {
  const reasons: string[] = [];

  if (store.comingSoon) {
    reasons.push('Jogo ainda nao foi lancado (coming soon na Steam).');
    return { rec: 'unreleased', reasons };
  }

  const linuxNative = store.platforms?.linux === true;
  if (linuxNative) reasons.push('Suporte Linux nativo declarado na Steam.');

  if (proton.found && GO_TIERS.has(proton.tier)) {
    reasons.push(`ProtonDB: tier ${proton.tier} (${proton.total} relatos).`);
    return { rec: 'go', reasons };
  }
  if (linuxNative && (!proton.found || proton.tier === 'pending')) {
    reasons.push('Suporte nativo + sem dados ProtonDB suficientes (assume nativo funciona).');
    return { rec: 'go', reasons };
  }
  if (proton.found && CAUTION_TIERS.has(proton.tier)) {
    reasons.push(`ProtonDB tier silver (${proton.total} relatos) — funciona mas pode exigir tweaks.`);
    const uw = pcgw.features.ultrawidescreen;
    if (uw?.state === 'hackable') reasons.push('Ultra-widescreen 21:9 requer mod (PCGamingWiki).');
    if (uw?.state === 'unsupported') reasons.push('Ultra-widescreen 21:9 nao suportado nativamente.');
    return { rec: 'caution', reasons };
  }
  if (proton.found && RISKY_TIERS.has(proton.tier)) {
    reasons.push(`ProtonDB tier ${proton.tier} (${proton.total} relatos) — historico ruim em Proton.`);
    if (!linuxNative) reasons.push('Sem suporte Linux nativo declarado.');
    return { rec: 'risky', reasons };
  }

  reasons.push('Sem dados suficientes (ProtonDB pending/sem relatos).');
  if (linuxNative) reasons.push('Mas o jogo declara suporte Linux nativo.');
  return { rec: linuxNative ? 'go' : 'no-data', reasons };
}

export async function fetchCheck(appid: string): Promise<CheckResult> {
  const [store, protondb, pcgw] = await Promise.all([
    fetchSteamStore(appid),
    fetchProtonDB(appid),
    fetchWidescreenInfo(appid),
  ]);
  const { rec, reasons } = computeRecommendation(store, protondb, pcgw);
  return { appid, store, protondb, pcgw, recommendation: rec, reasons };
}
