export type GameRow = {
  appid: string;
  name: string;
  installed: number;
  install_path: string | null;
  playtime_minutes: number;
  last_played: string | null;
  tier: string;
  trending_tier: string | null;
  confidence: string | null;
  reports: number;
  engine: string | null;
  engine_source: string | null;
  proton: string | null;
  launch_options: string | null;
  config_source: string | null;
  notes_json: string | null;
  user_launch_options: string | null;
  user_notes: string | null;
  updated_at: string;
};

export type GameListFilter = { tier?: string; search?: string; installed?: boolean };

export type GameOverrideRow = {
  appid: string;
  name: string;
  user_launch_options: string | null;
  user_notes: string | null;
};

export type GameUpsert = {
  appid: string;
  name: string;
  installed: 0 | 1;
  install_path: string | null;
  playtime_minutes: number;
  last_played: string | null;
  tier: string;
  trending_tier: string | null;
  confidence: string | null;
  reports: number;
  engine: string | null;
  engine_source: string | null;
  proton: string | null;
  launch_options: string;
  config_source: string;
  notes_json: string;
  updated_at: string;
};

export type GameStats = { total: number; byTier: Record<string, number>; installed: number };

export type RecentlyPlayed = { appid: string; name: string; tier: string; playtime_minutes: number; last_played: string | null };
export type RecentlyOverridden = { appid: string; name: string; updated_at: string; user_launch_options: string | null };

export interface GameRepository {
  list(filter: GameListFilter): GameRow[];
  get(appid: string): GameRow | undefined;
  getNameByAppid(appid: string): string | null;
  upsertMany(games: GameUpsert[]): void;
  updateUserFields(appid: string, fields: { user_launch_options?: string | null; user_notes?: string | null }): void;
  clearUserFields(appid: string, fields: { user_launch_options?: boolean; user_notes?: boolean }): void;
  listOverrides(): GameOverrideRow[];
  /** Substitui user_launch_options + user_notes pra muitos appids; ignora os que nao existem na biblioteca. */
  bulkApplyOverrides(entries: { appid: string; user_launch_options: string | null; user_notes: string | null }[]): { applied: number; skipped: number };
  stats(): GameStats;
  overridesCount(): number;
  totalPlaytimeMinutes(): number;
  recentlyPlayed(limit: number): RecentlyPlayed[];
  recentlyOverridden(limit: number): RecentlyOverridden[];
}
