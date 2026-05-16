export interface SnapshotRepository {
  insert(input: { generated_at: string; steam_id64: string; game_count: number; raw_json: string }): { id: number };
  /** ISO timestamp do snapshot mais recente (ou null). */
  lastGeneratedAt(): string | null;
}
