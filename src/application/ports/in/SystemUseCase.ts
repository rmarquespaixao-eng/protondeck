import type { SystemScan } from '../../../domain/system/SystemTypes.js';
import type { RecipeGroup } from '../../../domain/system/Recipes.js';
import type { RunnerEvent } from '../out/SystemRunner.js';

export type GroupStatus = {
  id: string;
  label: string;
  description: string;
  satisfied: boolean;
  packages: { name: string; installed: boolean }[];
  warning?: string;
  hasPreCommands: boolean;
};

/**
 * Inbound port: detector + instalador do stack Proton.
 * Implementado por SystemService.
 */
export interface SystemUseCase {
  scan(): Promise<SystemScan>;
  groupStatuses(): Promise<{ scan: SystemScan; groups: GroupStatus[] }>;
  sudoersTemplate(scan: SystemScan): { content: string | null; setupCommand: string | null };
  buildInstallArgs(scan: SystemScan, group: RecipeGroup): string[][];
  getGroup(scan: SystemScan, groupId: string): RecipeGroup | null;
  runSudoSequence(argvList: string[][], onEvent: (ev: RunnerEvent) => void, signal?: AbortSignal): Promise<{ ok: boolean; failedAt?: number }>;
}
