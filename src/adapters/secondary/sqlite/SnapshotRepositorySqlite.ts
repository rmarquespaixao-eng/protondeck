import type { DB } from './connection.js';
import type { SnapshotRepository } from '../../../ports/SnapshotRepository.js';

export class SnapshotRepositorySqlite implements SnapshotRepository {
  constructor(private readonly db: DB) {}

  insert(input: { generated_at: string; steam_id64: string; game_count: number; raw_json: string }): { id: number } {
    const info = this.db.prepare(`
      INSERT INTO snapshots (generated_at, steam_id64, game_count, raw_json)
      VALUES (?, ?, ?, ?)
    `).run(input.generated_at, input.steam_id64, input.game_count, input.raw_json);
    return { id: Number(info.lastInsertRowid) };
  }

  lastGeneratedAt(): string | null {
    const row = this.db.prepare('SELECT generated_at FROM snapshots ORDER BY id DESC LIMIT 1')
      .get() as { generated_at: string } | undefined;
    return row?.generated_at ?? null;
  }
}
