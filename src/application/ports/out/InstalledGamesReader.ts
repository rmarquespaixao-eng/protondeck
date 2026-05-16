import type { InstalledGame } from '../../../domain/games/SteamLibrary.js';

export interface InstalledGamesReader {
  listInstalled(): Promise<InstalledGame[]>;
}
