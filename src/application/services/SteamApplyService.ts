import type { GameRepository } from '../ports/out/GameRepository.js';
import type { SteamApplyUseCase, BulkApplyResult, BulkApplyItem } from '../ports/in/SteamApplyUseCase.js';
import type { SteamConfigRepository } from '../ports/out/SteamConfigRepository.js';
import type { SteamLocalConfigClient, ApplyLaunchResult } from '../ports/out/SteamLocalConfigClient.js';

export type SteamLaunchInfo =
  | { configured: false; reason: string }
  | { configured: true; available: false; reason: string }
  | { configured: true; available: true; steamRunning: boolean; foundInSteam: boolean; currentInSteam: string | null; foundReason: string | null };

export class SteamApplyService implements SteamApplyUseCase {
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

  async applyMany(appids: string[]): Promise<BulkApplyResult> {
    const cfg = this.steamConfig.get();
    if (!cfg) throw new Error('Steam credentials não configuradas (Configurações > Steam Credentials).');

    const unique = [...new Set(appids)];
    const items: BulkApplyItem[] = [];
    let steamWasRunning = false;

    for (const appid of unique) {
      const game = this.games.get(appid);
      if (!game) { items.push({ appid, name: appid, status: 'failed', reason: 'jogo não encontrado' }); continue; }
      const value = game.user_launch_options;
      // Decisão de produto: sem override do usuário → pula (não cai na config curada).
      if (!value || !value.trim()) { items.push({ appid, name: game.name, status: 'skipped', reason: 'sem override' }); continue; }
      try {
        const res = await this.localConfig.applyLaunchOptions(cfg.steam_id64, appid, value);
        if (res.steamWasRunning) steamWasRunning = true;
        if (res.ok) items.push({ appid, name: game.name, status: 'applied' });
        else items.push({ appid, name: game.name, status: 'failed', reason: res.reason ?? 'falha ao escrever' });
      } catch (e) {
        items.push({ appid, name: game.name, status: 'failed', reason: e instanceof Error ? e.message : String(e) });
      }
    }

    return {
      items,
      applied: items.filter(i => i.status === 'applied').length,
      skipped: items.filter(i => i.status === 'skipped').length,
      failed: items.filter(i => i.status === 'failed').length,
      steamWasRunning,
    };
  }
}
