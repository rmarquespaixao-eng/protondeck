// Barrel dos inbound ports — interfaces que o mundo externo chama.
// As implementacoes vivem em application/services/.
export type { GamesUseCase } from './GamesUseCase.js';
export type { DashboardUseCase, DashboardData } from './DashboardUseCase.js';
export type { CheckUseCase } from './CheckUseCase.js';
export type { PCGWUseCase } from './PCGWUseCase.js';
export type { SystemUseCase, GroupStatus } from './SystemUseCase.js';
export type { BackupUseCase, ExportPayload, ImportEntry, ImportPlanEntry } from './BackupUseCase.js';
export type { SteamApplyUseCase, SteamLaunchInfo } from './SteamApplyUseCase.js';
export type { SyncUseCase } from './SyncUseCase.js';
export type { AIUseCase, CurrentScreenState } from './AIUseCase.js';
