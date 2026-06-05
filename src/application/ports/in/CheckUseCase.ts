import type { CheckResult, SteamSearchHit } from '../../../domain/check/CheckResult.js';

/**
 * Inbound port: verifica se um jogo "vai rodar" antes de comprar.
 * Implementado por CheckService.
 */
export interface CheckUseCase {
  search(query: string): Promise<SteamSearchHit[]>;
  check(appid: string): Promise<CheckResult>;
}
