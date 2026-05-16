import type { GameRepository, RecentlyPlayed, RecentlyOverridden } from '../../ports/GameRepository.js';
import type { SnapshotRepository } from '../../ports/SnapshotRepository.js';

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

export class DashboardService {
  constructor(private readonly games: GameRepository, private readonly snapshots: SnapshotRepository) {}

  build(): DashboardData {
    const stats = this.games.stats();
    return {
      total: stats.total,
      installed: stats.installed,
      byTier: stats.byTier,
      overridesCount: this.games.overridesCount(),
      totalPlaytimeHours: Math.round(this.games.totalPlaytimeMinutes() / 6) / 10,
      lastSync: this.snapshots.lastGeneratedAt(),
      recentlyPlayed: this.games.recentlyPlayed(6),
      recentlyOverridden: this.games.recentlyOverridden(6),
    };
  }
}
