import type { ApplyLaunchResult } from '../out/SteamLocalConfigClient.js';

export type SteamLaunchInfo =
  | { configured: false; reason: string }
  | { configured: true; available: false; reason: string }
  | { configured: true; available: true; steamRunning: boolean; foundInSteam: boolean; currentInSteam: string | null; foundReason: string | null };

/**
 * Inbound port: aplica user_launch_options direto no localconfig.vdf do Steam.
 * Implementado por SteamApplyService.
 */
export interface SteamApplyUseCase {
  describe(appid: string): Promise<SteamLaunchInfo>;
  apply(appid: string): Promise<ApplyLaunchResult | { ok: false; error: string }>;
}
