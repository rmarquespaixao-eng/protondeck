export type SteamConfigRow = {
  api_key: string;
  steam_id64: string;
  updated_at: string;
};

export interface SteamConfigRepository {
  get(): SteamConfigRow | undefined;
  set(cfg: { api_key: string; steam_id64: string }): void;
}
