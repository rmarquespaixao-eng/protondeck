import { timeoutFetch } from '../shared/fetch.js';
import type { SteamLibraryClient } from '../../../application/ports/out/SteamLibraryClient.js';
import type { OwnedLibrary } from '../../../domain/games/SteamLibrary.js';

const TIMEOUT_MS = 15000;

type GetOwnedGamesResponse = {
  response?: {
    game_count?: number;
    games?: Array<{
      appid: number;
      name: string;
      playtime_forever?: number;
      rtime_last_played?: number;
    }>;
  };
};

export class SteamWebApiClient implements SteamLibraryClient {
  async getOwnedGames(apiKey: string, steamId64: string): Promise<OwnedLibrary> {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId64}&include_appinfo=1&include_played_free_games=1&format=json`;
    const res = await timeoutFetch(url, { timeoutMs: TIMEOUT_MS });
    if (!res.ok) {
      throw new Error(`Steam API HTTP ${res.status} (key invalida ou perfil inacessivel?)`);
    }
    const data = await res.json() as GetOwnedGamesResponse;
    const games = data?.response?.games;
    if (!Array.isArray(games)) {
      throw new Error('Steam API retornou resposta vazia. Perfil pode estar privado nas Privacy Settings (Game details = Private).');
    }
    return {
      steam_id64: steamId64,
      fetched_at: new Date().toISOString(),
      game_count: data.response?.game_count ?? games.length,
      games: games.map(g => ({
        appid: String(g.appid),
        name: g.name,
        playtime_minutes: g.playtime_forever ?? 0,
        last_played: g.rtime_last_played
          ? new Date(g.rtime_last_played * 1000).toISOString()
          : null,
      })),
    };
  }
}
