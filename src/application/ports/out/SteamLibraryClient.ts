import type { OwnedLibrary } from '../../../domain/games/SteamLibrary.js';

export interface SteamLibraryClient {
  getOwnedGames(apiKey: string, steamId64: string): Promise<OwnedLibrary>;
}
