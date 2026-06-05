import type { RecentlyPlayed, RecentlyOverridden } from '../out/GameRepository.js';

export type DashboardData = {
  total: number;
  installed: number;
  byTier: Record<string, number>;
  overridesCount: number;
  totalPlaytimeHours: number;
  lastSync: string | null;
  recentlyPlayed: RecentlyPlayed[];
  recentlyOverridden: RecentlyOverridden[];
};

/**
 * Inbound port: monta a visao consolidada da home.
 * Implementado por DashboardService.
 */
export interface DashboardUseCase {
  build(): DashboardData;
}
