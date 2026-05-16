export type ApplyLaunchResult = {
  ok: boolean;
  path: string;
  backupPath?: string;
  steamWasRunning: boolean;
  reason?: string;
};

export interface SteamLocalConfigClient {
  configPath(steamId64: string): string;
  exists(steamId64: string): Promise<boolean>;
  isSteamRunning(): Promise<boolean>;
  readLaunchOptions(steamId64: string, appid: string): Promise<{ found: boolean; value: string | null; reason?: string }>;
  applyLaunchOptions(steamId64: string, appid: string, launchOptions: string): Promise<ApplyLaunchResult>;
}
