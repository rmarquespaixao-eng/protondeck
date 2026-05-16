import type { WidescreenInfo } from '../pcgw/WidescreenInfo.js';

export type SteamSearchHit = { appid: string; name: string; logo: string | null };

export type ProtonDBSummary = {
  appid: string;
  tier: string;
  trendingTier?: string;
  bestReportedTier?: string;
  confidence?: string;
  score?: number;
  total: number;
  fetched_at: string;
  found: boolean;
};

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

export type CheckRecommendation = 'go' | 'caution' | 'risky' | 'no-data' | 'unreleased';

export type CheckResult = {
  appid: string;
  store: SteamStoreInfo;
  protondb: ProtonDBSummary;
  pcgw: WidescreenInfo;
  recommendation: CheckRecommendation;
  reasons: string[];
};
