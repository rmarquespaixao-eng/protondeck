import type { DB } from './connection.js';
import type {
  GameRepository, GameRow, GameListFilter, GameOverrideRow, GameUpsert,
  GameStats, RecentlyPlayed, RecentlyOverridden,
} from '../../../ports/GameRepository.js';

const tierOrder = `CASE tier
  WHEN 'borked' THEN 0
  WHEN 'pending' THEN 1
  WHEN 'bronze' THEN 2
  WHEN 'silver' THEN 3
  WHEN 'gold' THEN 4
  WHEN 'platinum' THEN 5
  WHEN 'native' THEN 6
  ELSE 99
END`;

export class GameRepositorySqlite implements GameRepository {
  private readonly upsertStmt;

  constructor(private readonly db: DB) {
    this.upsertStmt = db.prepare(`
      INSERT INTO games (
        appid, name, installed, install_path, playtime_minutes, last_played,
        tier, trending_tier, confidence, reports,
        engine, engine_source, proton, launch_options, config_source, notes_json,
        updated_at
      ) VALUES (
        @appid, @name, @installed, @install_path, @playtime_minutes, @last_played,
        @tier, @trending_tier, @confidence, @reports,
        @engine, @engine_source, @proton, @launch_options, @config_source, @notes_json,
        @updated_at
      )
      ON CONFLICT(appid) DO UPDATE SET
        name = excluded.name,
        installed = excluded.installed,
        install_path = excluded.install_path,
        playtime_minutes = excluded.playtime_minutes,
        last_played = excluded.last_played,
        tier = excluded.tier,
        trending_tier = excluded.trending_tier,
        confidence = excluded.confidence,
        reports = excluded.reports,
        engine = excluded.engine,
        engine_source = excluded.engine_source,
        proton = excluded.proton,
        launch_options = excluded.launch_options,
        config_source = excluded.config_source,
        notes_json = excluded.notes_json,
        updated_at = excluded.updated_at
    `);
  }

  list(filter: GameListFilter = {}): GameRow[] {
    const where: string[] = [];
    const args: Record<string, unknown> = {};
    if (filter.tier) {
      const tiers = filter.tier.split(',').map(s => s.trim());
      where.push(`tier IN (${tiers.map((_, i) => `@t${i}`).join(', ')})`);
      tiers.forEach((t, i) => { args[`t${i}`] = t; });
    }
    if (filter.search) {
      where.push(`(name LIKE @search OR appid = @appid_exact)`);
      args.search = `%${filter.search}%`;
      args.appid_exact = filter.search;
    }
    if (filter.installed !== undefined) {
      where.push(`installed = @installed`);
      args.installed = filter.installed ? 1 : 0;
    }
    const sql = `
      SELECT * FROM games
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${tierOrder}, playtime_minutes DESC, name COLLATE NOCASE
    `;
    return this.db.prepare(sql).all(args) as GameRow[];
  }

  get(appid: string): GameRow | undefined {
    return this.db.prepare('SELECT * FROM games WHERE appid = ?').get(appid) as GameRow | undefined;
  }

  getNameByAppid(appid: string): string | null {
    const row = this.db.prepare('SELECT name FROM games WHERE appid = ?').get(appid) as { name: string } | undefined;
    return row?.name ?? null;
  }

  upsertMany(games: GameUpsert[]): void {
    const tx = this.db.transaction((items: GameUpsert[]) => {
      for (const g of items) this.upsertStmt.run(g);
    });
    tx(games);
  }

  updateUserFields(appid: string, fields: { user_launch_options?: string | null; user_notes?: string | null }): void {
    this.db.prepare(`
      UPDATE games SET
        user_launch_options = COALESCE(@user_launch_options, user_launch_options),
        user_notes = COALESCE(@user_notes, user_notes),
        updated_at = @updated_at
      WHERE appid = @appid
    `).run({
      appid,
      user_launch_options: fields.user_launch_options ?? null,
      user_notes: fields.user_notes ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  clearUserFields(appid: string, fields: { user_launch_options?: boolean; user_notes?: boolean }): void {
    const sets: string[] = [];
    if (fields.user_launch_options) sets.push('user_launch_options = NULL');
    if (fields.user_notes) sets.push('user_notes = NULL');
    if (!sets.length) return;
    sets.push("updated_at = ?");
    this.db.prepare(`UPDATE games SET ${sets.join(', ')} WHERE appid = ?`).run(new Date().toISOString(), appid);
  }

  listOverrides(): GameOverrideRow[] {
    return this.db.prepare(`
      SELECT appid, name, user_launch_options, user_notes FROM games
      WHERE user_launch_options IS NOT NULL OR user_notes IS NOT NULL
      ORDER BY name COLLATE NOCASE
    `).all() as GameOverrideRow[];
  }

  bulkApplyOverrides(entries: { appid: string; user_launch_options: string | null; user_notes: string | null }[]): { applied: number; skipped: number } {
    let applied = 0, skipped = 0;
    const now = new Date().toISOString();
    const checkStmt = this.db.prepare('SELECT 1 AS x FROM games WHERE appid = ?');
    const updateStmt = this.db.prepare(`
      UPDATE games SET
        user_launch_options = @user_launch_options,
        user_notes = @user_notes,
        updated_at = @updated_at
      WHERE appid = @appid
    `);
    const tx = this.db.transaction((items: typeof entries) => {
      for (const it of items) {
        const exists = checkStmt.get(it.appid) as { x: 1 } | undefined;
        if (!exists) { skipped++; continue; }
        updateStmt.run({
          appid: it.appid,
          user_launch_options: it.user_launch_options,
          user_notes: it.user_notes,
          updated_at: now,
        });
        applied++;
      }
    });
    tx(entries);
    return { applied, skipped };
  }

  stats(): GameStats {
    const total = (this.db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }).n;
    const byTier: Record<string, number> = {};
    for (const row of this.db.prepare('SELECT tier, COUNT(*) AS n FROM games GROUP BY tier').all() as { tier: string; n: number }[]) {
      byTier[row.tier] = row.n;
    }
    const installed = (this.db.prepare('SELECT COUNT(*) AS n FROM games WHERE installed = 1').get() as { n: number }).n;
    return { total, byTier, installed };
  }

  overridesCount(): number {
    return (this.db.prepare(`
      SELECT COUNT(*) AS n FROM games
      WHERE user_launch_options IS NOT NULL OR user_notes IS NOT NULL
    `).get() as { n: number }).n;
  }

  totalPlaytimeMinutes(): number {
    return (this.db.prepare('SELECT COALESCE(SUM(playtime_minutes), 0) AS s FROM games').get() as { s: number }).s;
  }

  recentlyPlayed(limit: number): RecentlyPlayed[] {
    return this.db.prepare(`
      SELECT appid, name, tier, playtime_minutes, last_played FROM games
      WHERE last_played IS NOT NULL AND last_played != ''
      ORDER BY last_played DESC
      LIMIT ?
    `).all(limit) as RecentlyPlayed[];
  }

  recentlyOverridden(limit: number): RecentlyOverridden[] {
    return this.db.prepare(`
      SELECT appid, name, updated_at, user_launch_options FROM games
      WHERE user_launch_options IS NOT NULL OR user_notes IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as RecentlyOverridden[];
  }
}
