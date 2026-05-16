import type { WidescreenInfo } from '../../../domain/pcgw/WidescreenInfo.js';

/**
 * Inbound port: consulta info de widescreen/ultra-widescreen do PCGamingWiki.
 * Implementado por PCGWService.
 */
export interface PCGWUseCase {
  fetchWidescreen(appid: string, opts?: { force?: boolean }): Promise<WidescreenInfo>;
}
