import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

const FAMILY_MAP: Record<string, DistroFamily> = {
  arch: 'arch',
  cachyos: 'arch',
  manjaro: 'arch',
  endeavouros: 'arch',
  garuda: 'arch',
  artix: 'arch',
  ubuntu: 'debian',
  debian: 'debian',
  pop: 'debian',
  linuxmint: 'debian',
  zorin: 'debian',
  elementary: 'debian',
  fedora: 'fedora',
  nobara: 'fedora',
  bazzite: 'fedora',
  rhel: 'fedora',
  centos: 'fedora',
  rocky: 'fedora',
  almalinux: 'fedora',
};

const PM_MAP: Record<DistroFamily, PackageManager> = {
  arch: 'pacman',
  debian: 'apt',
  fedora: 'dnf',
  unknown: 'unknown',
};

const GPU_VENDOR_BY_ID: Record<number, GpuVendor> = {
  0x10de: 'nvidia',
  0x1002: 'amd',
  0x8086: 'intel',
};

function parseOsRelease(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2] ?? '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[m[1]!] = val;
  }
  return out;
}

export async function detectDistro(): Promise<DistroInfo> {
  try {
    const content = await readFile('/etc/os-release', 'utf-8');
    const parsed = parseOsRelease(content);
    const id = (parsed.ID || 'unknown').toLowerCase();
    const idLike = (parsed.ID_LIKE || '').toLowerCase().split(/\s+/).filter(Boolean);
    let family: DistroFamily = FAMILY_MAP[id] ?? 'unknown';
    if (family === 'unknown') {
      for (const like of idLike) {
        const f = FAMILY_MAP[like];
        if (f) { family = f; break; }
      }
    }
    return {
      id,
      family,
      versionId: parsed.VERSION_ID ?? null,
      prettyName: parsed.PRETTY_NAME ?? null,
      packageManager: PM_MAP[family],
    };
  } catch {
    return { id: 'unknown', family: 'unknown', versionId: null, prettyName: null, packageManager: 'unknown' };
  }
}

async function readGpuVendorsFromSys(): Promise<number[]> {
  const vendors = new Set<number>();
  try {
    const cards = await readdir('/sys/class/drm');
    for (const card of cards) {
      if (!/^card\d+$/.test(card)) continue;
      try {
        const vendorHex = (await readFile(join('/sys/class/drm', card, 'device/vendor'), 'utf-8')).trim();
        const vendorId = parseInt(vendorHex, 16);
        if (!Number.isNaN(vendorId)) vendors.add(vendorId);
      } catch { /* card sem device */ }
    }
  } catch { /* sem /sys/class/drm */ }
  return [...vendors];
}

async function readGpuModel(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('lspci', ['-mm'], { timeout: 5000 });
    for (const line of stdout.split('\n')) {
      const m = line.match(/"(VGA compatible controller|3D controller|Display controller)" "([^"]+)" "([^"]+)"/);
      if (m && m[3]) return m[3].replace(/\[.+?\]/g, '').trim();
    }
  } catch { /* lspci ausente */ }
  return null;
}

export async function detectGpu(): Promise<GpuInfo> {
  const vendorIds = await readGpuVendorsFromSys();
  let vendor: GpuVendor = 'unknown';
  // Prioriza dGPU: nvidia/amd antes de intel (iGPU comum em laptops)
  for (const id of vendorIds) {
    const v = GPU_VENDOR_BY_ID[id];
    if (v === 'nvidia' || v === 'amd') { vendor = v; break; }
  }
  if (vendor === 'unknown') {
    for (const id of vendorIds) {
      const v = GPU_VENDOR_BY_ID[id];
      if (v) { vendor = v; break; }
    }
  }
  const model = await readGpuModel();
  return { vendor, model, vendorIds };
}

export async function hasBinary(name: string): Promise<boolean> {
  try {
    await execFileAsync('command', ['-v', name], { shell: '/bin/sh', timeout: 3000 });
    return true;
  } catch { return false; }
}

export async function hasBinaries(names: string[]): Promise<Record<string, boolean>> {
  const entries = await Promise.all(names.map(async n => [n, await hasBinary(n)] as const));
  return Object.fromEntries(entries);
}

async function isPacmanInstalled(pkg: string): Promise<boolean> {
  try {
    await execFileAsync('pacman', ['-Qq', pkg], { timeout: 4000 });
    return true;
  } catch { return false; }
}

async function isAptInstalled(pkg: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('dpkg-query', ['-W', '-f=${db:Status-Status}\n', pkg], { timeout: 4000 });
    return stdout.trim() === 'installed';
  } catch { return false; }
}

async function isDnfInstalled(pkg: string): Promise<boolean> {
  try {
    await execFileAsync('rpm', ['-q', pkg], { timeout: 4000 });
    return true;
  } catch { return false; }
}

export async function arePackagesInstalled(pm: PackageManager, pkgs: string[]): Promise<Record<string, boolean>> {
  const fn = pm === 'pacman' ? isPacmanInstalled
          : pm === 'apt'    ? isAptInstalled
          : pm === 'dnf'    ? isDnfInstalled
          : async () => false;
  const entries = await Promise.all(pkgs.map(async p => [p, await fn(p)] as const));
  return Object.fromEntries(entries);
}

export async function isMultilibEnabled(family: DistroFamily): Promise<boolean> {
  if (family === 'arch') {
    try {
      const content = await readFile('/etc/pacman.conf', 'utf-8');
      return /^\s*\[multilib\]/m.test(content) &&
             !/^\s*#\s*\[multilib\]/m.test(content);
    } catch { return false; }
  }
  if (family === 'debian') {
    try {
      const { stdout } = await execFileAsync('dpkg', ['--print-foreign-architectures'], { timeout: 3000 });
      return stdout.split('\n').some(a => a.trim() === 'i386');
    } catch { return false; }
  }
  // Fedora tem multilib (i686) habilitado por padrao
  return family === 'fedora';
}

export async function sudoersFileExists(): Promise<boolean> {
  // Nao tenta ler /etc/sudoers.d/protondeck (precisa root); checa via comando
  // que falha "Permission denied" vs "No such file or directory".
  try {
    // stat retorna 0 mesmo sem read se o arquivo existe e diretorio e listavel.
    // /etc/sudoers.d nao e world-readable. Tentamos via "sudo -n -l" que lista
    // privilegios cacheados/permitidos sem prompt.
    const { stdout } = await execFileAsync('sudo', ['-n', '-l'], { timeout: 3000 });
    return /protondeck/i.test(stdout) || /pacman|apt-get|dnf/i.test(stdout);
  } catch {
    return false;
  }
}

export async function detectSystem(): Promise<SystemScan> {
  const [distro, gpu] = await Promise.all([detectDistro(), detectGpu()]);
  const multilibEnabled = await isMultilibEnabled(distro.family);
  const binaries = await hasBinaries(['gamescope', 'mangohud', 'gamemoded', 'steam', 'protontricks', 'winetricks', 'vulkaninfo']);
  const user = process.env.USER ?? 'unknown';
  const sudoersInstalled = await sudoersFileExists();
  return {
    distro,
    gpu,
    user,
    multilibEnabled,
    binaries,
    packages: {},
    sudoersInstalled,
  };
}
