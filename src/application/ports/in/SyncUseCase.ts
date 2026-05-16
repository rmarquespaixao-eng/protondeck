/**
 * Inbound port: sincroniza biblioteca chamando o skill steam-launch.
 * Implementado por SyncService.
 */
export interface SyncUseCase {
  syncFromSteamLaunch(): Promise<{ upserts: number; snapshot_id: number; generated_at: string }>;
}
