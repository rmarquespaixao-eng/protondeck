import type { WidescreenInfo } from '../domain/pcgw/WidescreenInfo.js';

export interface PCGWClient {
  fetchWidescreenInfo(appid: string, opts?: { force?: boolean }): Promise<WidescreenInfo>;
}
