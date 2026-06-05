import type { PCGWClient } from '../ports/out/PCGWClient.js';
import type { PCGWUseCase } from '../ports/in/PCGWUseCase.js';
import type { WidescreenInfo } from '../../domain/pcgw/WidescreenInfo.js';

export class PCGWService implements PCGWUseCase {
  constructor(private readonly client: PCGWClient) {}

  fetchWidescreen(appid: string, opts: { force?: boolean } = {}): Promise<WidescreenInfo> {
    return this.client.fetchWidescreenInfo(appid, opts);
  }
}
