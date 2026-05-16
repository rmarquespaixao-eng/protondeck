import type { GameRow, GameListFilter } from '../out/GameRepository.js';

/**
 * Inbound port: operacoes sobre jogos da biblioteca.
 * Implementado por GamesService.
 */
export interface GamesUseCase {
  list(filter?: GameListFilter): GameRow[];
  get(appid: string): GameRow | undefined;
  updateOverride(appid: string, fields: { user_launch_options?: string | null; user_notes?: string | null }): void;
  saveLaunch(appid: string, value: string | null): void;
  saveNotes(appid: string, value: string | null): void;
  clearLaunch(appid: string): void;
  clearNotes(appid: string): void;
}
