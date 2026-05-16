import type { SnapshotRepository } from '../../application/ports/out/SnapshotRepository.js';

export class InMemorySnapshotRepository implements SnapshotRepository {
  private snapshots: { id: number; generated_at: string; steam_id64: string; game_count: number; raw_json: string }[] = [];

  insert(input: { generated_at: string; steam_id64: string; game_count: number; raw_json: string }): { id: number } {
    const id = this.snapshots.length + 1;
    this.snapshots.push({ id, ...input });
    return { id };
  }

  lastGeneratedAt(): string | null {
    if (!this.snapshots.length) return null;
    return this.snapshots[this.snapshots.length - 1]!.generated_at;
  }
}
