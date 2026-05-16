import type { DistroInfo, GpuInfo, DistroFamily, PackageManager, SystemScan } from '../../../domain/system/SystemTypes.js';

export interface SystemDetector {
  detectDistro(): Promise<DistroInfo>;
  detectGpu(): Promise<GpuInfo>;
  hasBinaries(names: string[]): Promise<Record<string, boolean>>;
  arePackagesInstalled(pm: PackageManager, pkgs: string[]): Promise<Record<string, boolean>>;
  isMultilibEnabled(family: DistroFamily): Promise<boolean>;
  sudoersInstalled(): Promise<boolean>;
  scan(): Promise<SystemScan>;
}
