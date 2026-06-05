export type ExportPayload = {
  format: 'protondeck-config-export';
  version: number;
  exported_at: string;
  exported_by: string | null;
  games: { appid: string; name: string; user_launch_options: string | null; user_notes: string | null }[];
};

export type ImportEntry = { appid: string; user_launch_options: string | null; user_notes: string | null };
export type ImportPlanEntry = ImportEntry & { name: string | null; inLibrary: boolean };

/**
 * Inbound port: export e import de overrides.
 * Implementado por BackupService.
 */
export interface BackupUseCase {
  buildExport(exportedBy: string | null): ExportPayload;
  validatePayload(payload: unknown): { ok: false; error: string } | { ok: true; entries: ImportEntry[] };
  buildPlan(entries: ImportEntry[]): ImportPlanEntry[];
  apply(plan: ImportPlanEntry[]): { applied: number; skipped: number };
}
