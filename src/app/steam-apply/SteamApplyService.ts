import type { GameRepository } from '../../ports/GameRepository.js';
import type { SteamConfigRepository } from '../../ports/SteamConfigRepository.js';
import type { SteamLocalConfigClient, ApplyLaunchResult } from '../../ports/SteamLocalConfigClient.js';

export type SteamLaunchInfo =
  | { configured: false; reason: string }
  | { configured: true; available: false; reason: string }
  | { configured: true; available: true; steamRunning: boolean; foundInSteam: boolean; currentInSteam: string | null; foundReason: string | null };

export class SteamApplyService {
  constructor(
    private readonly games: GameRepository,
    private readonly steamConfig: SteamConfigRepository,
    private readonly localConfig: SteamLocalConfigClient,
  ) {}

  async describe(appid: string): Promise<SteamLaunchInfo> {
    const cfg = this.steamConfig.get();
    if (!cfg) return { configured: false, reason: 'Steam credentials não configuradas (Configurações > Steam Credentials).' };
    const exists = await this.localConfig.exists(cfg.steam_id64);
    if (!exists) return { configured: true, available: false, reason: 'localconfig.vdf não encontrado/acessível pra este steamid.' };
    const steamRunning = await this.localConfig.isSteamRunning();
    const current = await this.localConfig.readLaunchOptions(cfg.steam_id64, appid);
    return {
      configured: true,
      available: true,
      steamRunning,
      currentInSteam: current.value,
      foundInSteam: current.found,
      foundReason: current.reason ?? null,
    };
  }

  async apply(appid: string): Promise<ApplyLaunchResult | { ok: false; error: string }> {
    const game = this.games.get(appid);
    if (!game) return { ok: false, error: 'jogo nao encontrado' };
    const value = game.user_launch_options;
    if (!value || !value.trim()) return { ok: false, error: 'Sem user_launch_options pra aplicar — salve override primeiro.' };
    const cfg = this.steamConfig.get();
    if (!cfg) return { ok: false, error: 'Steam credentials não configuradas (Configurações > Steam Credentials).' };
    return this.localConfig.applyLaunchOptions(cfg.steam_id64, appid, value);
  }
}
