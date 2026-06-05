import type {
  GameRepository, GameRow, GameListFilter, GameOverrideRow, GameUpsert,
  GameStats, RecentlyPlayed, RecentlyOverridden,
} from '../../application/ports/out/GameRepository.js';

/** In-memory GameRepository pra usar em testes. */
export class InMemoryGameRepository implements GameRepository {
  rows = new Map<string, GameRow>();

  seed(rows: GameRow[]) { for (const r of rows) this.rows.set(r.appid, r); return this; }

  list(filter: GameListFilter = {}): GameRow[] {
    let out = [...this.rows.values()];
    if (filter.tier) {
      const tiers = new Set(filter.tier.split(',').map(s => s.trim()));
      out = out.filter(r => tiers.has(r.tier));
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      out = out.filter(r => r.name.toLowerCase().includes(q) || r.appid === filter.search);
    }
    if (filter.installed !== undefined) {
      const want = filter.installed ? 1 : 0;
      out = out.filter(r => r.installed === want);
    }
    return out;
  }

  get(appid: string): GameRow | undefined { return this.rows.get(appid); }

  getNameByAppid(appid: string): string | null { return this.rows.get(appid)?.name ?? null; }

  upsertMany(games: GameUpsert[]): void {
    for (const g of games) {
      const existing = this.rows.get(g.appid);
      this.rows.set(g.appid, {
        ...g,
        user_launch_options: existing?.user_launch_options ?? null,
        user_notes: existing?.user_notes ?? null,
      } as GameRow);
    }
  }

  updateUserFields(appid: string, fields: { user_launch_options?: string | null; user_notes?: string | null }): void {
    const r = this.rows.get(appid);
    if (!r) return;
    if (fields.user_launch_options !== undefined) r.user_launch_options = fields.user_launch_options;
    if (fields.user_notes !== undefined) r.user_notes = fields.user_notes;
    r.updated_at = new Date().toISOString();
  }

  clearUserFields(appid: string, fields: { user_launch_options?: boolean; user_notes?: boolean }): void {
    const r = this.rows.get(appid);
    if (!r) return;
    if (fields.user_launch_options) r.user_launch_options = null;
    if (fields.user_notes) r.user_notes = null;
    r.updated_at = new Date().toISOString();
  }

  listOverrides(): GameOverrideRow[] {
    return [...this.rows.values()]
      .filter(r => r.user_launch_options !== null || r.user_notes !== null)
      .map(r => ({ appid: r.appid, name: r.name, user_launch_options: r.user_launch_options, user_notes: r.user_notes }));
  }

  bulkApplyOverrides(entries: { appid: string; user_launch_options: string | null; user_notes: string | null }[]): { applied: number; skipped: number } {
    let applied = 0, skipped = 0;
    for (const e of entries) {
      const r = this.rows.get(e.appid);
      if (!r) { skipped++; continue; }
      r.user_launch_options = e.user_launch_options;
      r.user_notes = e.user_notes;
      r.updated_at = new Date().toISOString();
      applied++;
    }
    return { applied, skipped };
  }

  stats(): GameStats {
    const byTier: Record<string, number> = {};
    let installed = 0;
    for (const r of this.rows.values()) {
      byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
      if (r.installed === 1) installed++;
    }
    return { total: this.rows.size, byTier, installed };
  }

  overridesCount(): number { return this.listOverrides().length; }

  totalPlaytimeMinutes(): number {
    let sum = 0;
    for (const r of this.rows.values()) sum += r.playtime_minutes;
    return sum;
  }

  recentlyPlayed(limit: number): RecentlyPlayed[] {
    return [...this.rows.values()]
      .filter(r => r.last_played)
      .sort((a, b) => (b.last_played ?? '').localeCompare(a.last_played ?? ''))
      .slice(0, limit)
      .map(r => ({ appid: r.appid, name: r.name, tier: r.tier, playtime_minutes: r.playtime_minutes, last_played: r.last_played }));
  }

  recentlyOverridden(limit: number): RecentlyOverridden[] {
    return [...this.rows.values()]
      .filter(r => r.user_launch_options !== null || r.user_notes !== null)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit)
      .map(r => ({ appid: r.appid, name: r.name, updated_at: r.updated_at, user_launch_options: r.user_launch_options }));
  }
}

/** Factory pra criar GameRow com defaults sensatos. */
export function makeGameRow(overrides: Partial<GameRow> = {}): GameRow {
  return {
    appid: '620',
    name: 'Portal 2',
    installed: 1,
    install_path: null,
    playtime_minutes: 120,
    last_played: '2025-01-15T12:00:00Z',
    tier: 'platinum',
    trending_tier: null,
    confidence: 'strong',
    reports: 100,
    engine: 'source',
    engine_source: 'detected',
    proton: 'proton-experimental',
    launch_options: '%command%',
    config_source: 'generic',
    notes_json: '[]',
    user_launch_options: null,
    user_notes: null,
    updated_at: '2025-01-15T12:00:00Z',
    ...overrides,
  };
}
