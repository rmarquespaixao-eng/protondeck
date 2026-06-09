import type { ApplyLaunchResult } from '../out/SteamLocalConfigClient.js';

export type SteamLaunchInfo =
  | { configured: false; reason: string }
  | { configured: true; available: false; reason: string }
  | { configured: true; available: true; steamRunning: boolean; foundInSteam: boolean; currentInSteam: string | null; foundReason: string | null };

// Resultado por jogo numa aplicação em massa. status:
//   'applied' = escrito no localconfig.vdf
//   'skipped' = sem user_launch_options (não toca)
//   'failed'  = erro ao escrever / jogo inexistente
export type BulkApplyItem = {
  appid: string;
  name: string;
  status: 'applied' | 'skipped' | 'failed';
  reason?: string;
};

export type BulkApplyResult = {
  items: BulkApplyItem[];
  applied: number;
  skipped: number;
  failed: number;
  steamWasRunning: boolean;
};

/**
 * Inbound port: aplica user_launch_options direto no localconfig.vdf do Steam.
 * Implementado por SteamApplyService.
 */
export interface SteamApplyUseCase {
  describe(appid: string): Promise<SteamLaunchInfo>;
  apply(appid: string): Promise<ApplyLaunchResult | { ok: false; error: string }>;
  /** Aplica em lote a config própria de cada jogo; pula os sem user_launch_options. */
  applyMany(appids: string[]): Promise<BulkApplyResult>;
}
