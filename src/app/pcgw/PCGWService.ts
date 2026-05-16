import type { PCGWClient } from '../../ports/PCGWClient.js';
import type { WidescreenInfo } from '../../domain/pcgw/WidescreenInfo.js';

export class PCGWService {
  constructor(private readonly client: PCGWClient) {}

  fetchWidescreen(appid: string, opts: { force?: boolean } = {}): Promise<WidescreenInfo> {
    return this.client.fetchWidescreenInfo(appid, opts);
  }
}
