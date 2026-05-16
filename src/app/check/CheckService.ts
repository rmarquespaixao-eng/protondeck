import type { SteamSearchClient, ProtonDBClient, SteamStoreClient } from '../../ports/CheckClients.js';
import type { PCGWClient } from '../../ports/PCGWClient.js';
import type { CheckResult, SteamSearchHit } from '../../domain/check/CheckResult.js';
import { computeRecommendation } from '../../domain/check/Recommendation.js';

export class CheckService {
  constructor(
    private readonly steamSearch: SteamSearchClient,
    private readonly protonDb: ProtonDBClient,
    private readonly steamStore: SteamStoreClient,
    private readonly pcgw: PCGWClient,
  ) {}

  search(query: string): Promise<SteamSearchHit[]> {
    return this.steamSearch.search(query);
  }

  async check(appid: string): Promise<CheckResult> {
    const [store, protondb, pcgw] = await Promise.all([
      this.steamStore.fetchDetails(appid),
      this.protonDb.fetchSummary(appid),
      this.pcgw.fetchWidescreenInfo(appid),
    ]);
    const { rec, reasons } = computeRecommendation(store, protondb, pcgw);
    return { appid, store, protondb, pcgw, recommendation: rec, reasons };
  }
}
