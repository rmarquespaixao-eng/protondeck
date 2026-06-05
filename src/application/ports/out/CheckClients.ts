import type { SteamSearchHit, ProtonDBSummary, SteamStoreInfo } from '../../../domain/check/CheckResult.js';

export interface SteamSearchClient {
  search(query: string): Promise<SteamSearchHit[]>;
}

export interface ProtonDBClient {
  fetchSummary(appid: string): Promise<ProtonDBSummary>;
}

export interface SteamStoreClient {
  fetchDetails(appid: string): Promise<SteamStoreInfo>;
}
