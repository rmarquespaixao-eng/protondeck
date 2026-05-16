import type { GameRepository, GameRow, GameListFilter } from '../../ports/GameRepository.js';

export class GamesService {
  constructor(private readonly games: GameRepository) {}

  list(filter: GameListFilter = {}): GameRow[] {
    return this.games.list(filter);
  }

  get(appid: string): GameRow | undefined {
    return this.games.get(appid);
  }

  updateOverride(appid: string, fields: { user_launch_options?: string | null; user_notes?: string | null }): void {
    this.games.updateUserFields(appid, fields);
  }

  saveLaunch(appid: string, value: string | null): void {
    this.games.updateUserFields(appid, { user_launch_options: value });
  }

  saveNotes(appid: string, value: string | null): void {
    this.games.updateUserFields(appid, { user_notes: value });
  }

  clearLaunch(appid: string): void {
    this.games.clearUserFields(appid, { user_launch_options: true });
  }

  clearNotes(appid: string): void {
    this.games.clearUserFields(appid, { user_notes: true });
  }
}
