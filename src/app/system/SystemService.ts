import type { SystemDetector } from '../../ports/SystemDetector.js';
import type { SystemRunner, RunnerEvent } from '../../ports/SystemRunner.js';
import type { SystemScan } from '../../domain/system/SystemTypes.js';
import { getRecipe, getRelevantGroups, getGroupById, type RecipeGroup } from '../../domain/system/Recipes.js';
import { generateSudoersContent, generateSetupCommand } from '../../domain/system/SudoersTemplate.js';

export type GroupStatus = {
  id: string;
  label: string;
  description: string;
  satisfied: boolean;
  packages: { name: string; installed: boolean }[];
  warning?: string;
  hasPreCommands: boolean;
};

export class SystemService {
  constructor(private readonly detector: SystemDetector, private readonly runner: SystemRunner) {}

  async scan(): Promise<SystemScan> {
    return this.detector.scan();
  }

  async groupStatuses(): Promise<{ scan: SystemScan; groups: GroupStatus[] }> {
    const scan = await this.detector.scan();
    const groups = getRelevantGroups(scan.distro.family, scan.gpu.vendor);
    const allPkgs = Array.from(new Set(groups.flatMap(g => g.packages)));
    const pkgStatus = await this.detector.arePackagesInstalled(scan.distro.packageManager, allPkgs);

    const groupStatuses: GroupStatus[] = groups.map(g => {
      const pkgs = g.packages.map(p => ({ name: p, installed: pkgStatus[p] ?? false }));
      const allPkgsOk = pkgs.length === 0 || pkgs.every(p => p.installed);
      let satisfied = allPkgsOk;
      if (g.satisfiedWhen?.binaries) {
        const binsOk = g.satisfiedWhen.binaries.every(b => scan.binaries[b]);
        satisfied = satisfied || binsOk;
      }
      if (g.id === 'multilib') satisfied = scan.multilibEnabled;
      const result: GroupStatus = {
        id: g.id,
        label: g.label,
        description: g.description,
        satisfied,
        packages: pkgs,
        hasPreCommands: !!g.preCommands?.length,
      };
      if (g.warning) result.warning = g.warning;
      return result;
    });

    return { scan, groups: groupStatuses };
  }

  sudoersTemplate(scan: SystemScan): { content: string | null; setupCommand: string | null } {
    return {
      content: generateSudoersContent(scan.user, scan.distro.family),
      setupCommand: generateSetupCommand(scan.user, scan.distro.family),
    };
  }

  buildInstallArgs(scan: SystemScan, group: RecipeGroup): string[][] {
    const recipe = getRecipe(scan.distro.family);
    if (!recipe) return [];
    const argvList: string[][] = [];
    if (group.preCommands) argvList.push(...group.preCommands);
    if (group.packages.length) argvList.push(recipe.installCommand(group.packages));
    return argvList;
  }

  getGroup(scan: SystemScan, groupId: string): RecipeGroup | null {
    return getGroupById(scan.distro.family, groupId);
  }

  runSudoSequence(argvList: string[][], onEvent: (ev: RunnerEvent) => void, signal?: AbortSignal) {
    return this.runner.runSudoSequence(argvList, onEvent, signal);
  }
}
