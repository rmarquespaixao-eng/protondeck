import type { GameRepository } from '../../ports/GameRepository.js';

const FORMAT = 'protondeck-config-export';
const VERSION = 1;

export type ExportPayload = {
  format: typeof FORMAT;
  version: number;
  exported_at: string;
  exported_by: string | null;
  games: { appid: string; name: string; user_launch_options: string | null; user_notes: string | null }[];
};

export type ImportEntry = { appid: string; user_launch_options: string | null; user_notes: string | null };
export type ImportPlanEntry = ImportEntry & { name: string | null; inLibrary: boolean };

export class BackupService {
  static readonly FORMAT = FORMAT;
  static readonly VERSION = VERSION;

  constructor(private readonly games: GameRepository) {}

  buildExport(exportedBy: string | null): ExportPayload {
    const overrides = this.games.listOverrides();
    return {
      format: FORMAT,
      version: VERSION,
      exported_at: new Date().toISOString(),
      exported_by: exportedBy,
      games: overrides.map(g => ({
        appid: g.appid,
        name: g.name,
        user_launch_options: g.user_launch_options,
        user_notes: g.user_notes,
      })),
    };
  }

  validatePayload(payload: unknown): { ok: false; error: string } | { ok: true; entries: ImportEntry[] } {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'payload obrigatório' };
    const p = payload as Partial<ExportPayload>;
    if (p.format !== FORMAT) return { ok: false, error: `formato inválido: esperado "${FORMAT}"` };
    if (!Array.isArray(p.games)) return { ok: false, error: '"games" deve ser array' };
    const entries: ImportEntry[] = [];
    for (const g of p.games as Array<{ appid?: unknown; user_launch_options?: string | null; user_notes?: string | null }>) {
      if (!g || typeof g.appid !== 'string') continue;
      entries.push({
        appid: g.appid,
        user_launch_options: g.user_launch_options ?? null,
        user_notes: g.user_notes ?? null,
      });
    }
    return { ok: true, entries };
  }

  buildPlan(entries: ImportEntry[]): ImportPlanEntry[] {
    return entries.map(e => {
      const name = this.games.getNameByAppid(e.appid);
      return { ...e, name, inLibrary: name !== null };
    });
  }

  apply(plan: ImportPlanEntry[]): { applied: number; skipped: number } {
    return this.games.bulkApplyOverrides(plan);
  }
}
