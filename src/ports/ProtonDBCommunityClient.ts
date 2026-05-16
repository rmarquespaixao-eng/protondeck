import type { CommunityData } from '../domain/check/ProtonReport.js';

export interface ProtonDBCommunityClient {
  fetchReports(appid: string, limit?: number): Promise<CommunityData>;
}
