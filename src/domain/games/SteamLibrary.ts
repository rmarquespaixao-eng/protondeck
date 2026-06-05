export type OwnedGame = {
  appid: string;
  name: string;
  playtime_minutes: number;
  last_played: string | null;
};

export type OwnedLibrary = {
  steam_id64: string;
  fetched_at: string;
  game_count: number;
  games: OwnedGame[];
};

export type InstalledGame = {
  appid: string;
  name: string;
  install_path: string | null;
};
