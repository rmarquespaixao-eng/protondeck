import type { DB } from './connection.js';
import type { SystemInfoRepository } from '../../../ports/SystemInfoRepository.js';

export class SystemInfoRepositorySqlite implements SystemInfoRepository {
  constructor(private readonly db: DB) {}

  upsert(detectedAt: string, payloadJson: string): void {
    this.db.prepare(`
      INSERT INTO system_info (id, detected_at, payload_json) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET detected_at = excluded.detected_at, payload_json = excluded.payload_json
    `).run(detectedAt, payloadJson);
  }

  get(): unknown | null {
    const row = this.db.prepare('SELECT payload_json FROM system_info WHERE id = 1')
      .get() as { payload_json: string } | undefined;
    return row ? JSON.parse(row.payload_json) : null;
  }
}
