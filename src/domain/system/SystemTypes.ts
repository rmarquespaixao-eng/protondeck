export type DistroFamily = 'arch' | 'debian' | 'fedora' | 'unknown';
export type DistroId = 'arch' | 'cachyos' | 'manjaro' | 'endeavouros' | 'ubuntu' | 'debian' | 'pop' | 'linuxmint' | 'fedora' | 'nobara' | string;
export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'unknown';
export type PackageManager = 'pacman' | 'apt' | 'dnf' | 'unknown';

export type DistroInfo = {
  id: DistroId;
  family: DistroFamily;
  versionId: string | null;
  prettyName: string | null;
  packageManager: PackageManager;
};

export type GpuInfo = {
  vendor: GpuVendor;
  model: string | null;
  vendorIds: number[];
};

export type SystemScan = {
  distro: DistroInfo;
  gpu: GpuInfo;
  user: string;
  multilibEnabled: boolean;
  binaries: Record<string, boolean>;
  packages: Record<string, boolean>;
  sudoersInstalled: boolean;
};
