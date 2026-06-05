import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { userInfo } from 'node:os';
import type { SystemDetector } from '../../../application/ports/out/SystemDetector.js';
import type {
  DistroFamily, DistroInfo, GpuInfo, GpuVendor, PackageManager, SystemScan,
} from '../../../domain/system/SystemTypes.js';

const execFileAsync = promisify(execFile);

const FAMILY_MAP: Record<string, DistroFamily> = {
  arch: 'arch', cachyos: 'arch', manjaro: 'arch', endeavouros: 'arch', garuda: 'arch', artix: 'arch',
  ubuntu: 'debian', debian: 'debian', pop: 'debian', linuxmint: 'debian', zorin: 'debian', elementary: 'debian',
  fedora: 'fedora', nobara: 'fedora', bazzite: 'fedora', rhel: 'fedora', centos: 'fedora', rocky: 'fedora', almalinux: 'fedora',
};

const PM_MAP: Record<DistroFamily, PackageManager> = {
  arch: 'pacman', debian: 'apt', fedora: 'dnf', unknown: 'unknown',
};

const GPU_VENDOR_BY_ID: Record<number, GpuVendor> = {
  0x10de: 'nvidia', 0x1002: 'amd', 0x8086: 'intel',
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

export class LinuxSystemDetector implements SystemDetector {
  async detectDistro(): Promise<DistroInfo> {
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

  async detectGpu(): Promise<GpuInfo> {
    const vendorIds = await this.readGpuVendorsFromSys();
    let vendor: GpuVendor = 'unknown';
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
    const model = await this.readGpuModel();
    return { vendor, model, vendorIds };
  }

  private async readGpuVendorsFromSys(): Promise<number[]> {
    const vendors = new Set<number>();
    try {
      const cards = await readdir('/sys/class/drm');
      for (const card of cards) {
        if (!/^card\d+$/.test(card)) continue;
        try {
          const vendorHex = (await readFile(join('/sys/class/drm', card, 'device/vendor'), 'utf-8')).trim();
          const vendorId = parseInt(vendorHex, 16);
          if (!Number.isNaN(vendorId)) vendors.add(vendorId);
        } catch { /* */ }
      }
    } catch { /* */ }
    return [...vendors];
  }

  private async readGpuModel(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('lspci', ['-mm'], { timeout: 5000 });
      for (const line of stdout.split('\n')) {
        const m = line.match(/"(VGA compatible controller|3D controller|Display controller)" "([^"]+)" "([^"]+)"/);
        if (m && m[3]) return m[3].replace(/\[.+?\]/g, '').trim();
      }
    } catch { /* */ }
    return null;
  }

  async hasBinaries(names: string[]): Promise<Record<string, boolean>> {
    const entries = await Promise.all(names.map(async n => [n, await this.hasBinary(n)] as const));
    return Object.fromEntries(entries);
  }

  private async hasBinary(name: string): Promise<boolean> {
    try {
      await execFileAsync('command', ['-v', name], { shell: '/bin/sh', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async arePackagesInstalled(pm: PackageManager, pkgs: string[]): Promise<Record<string, boolean>> {
    const fn = pm === 'pacman' ? this.isPacmanInstalled
            : pm === 'apt'    ? this.isAptInstalled
            : pm === 'dnf'    ? this.isDnfInstalled
            : async () => false;
    const entries = await Promise.all(pkgs.map(async p => [p, await fn(p)] as const));
    return Object.fromEntries(entries);
  }

  private async isPacmanInstalled(pkg: string): Promise<boolean> {
    try { await execFileAsync('pacman', ['-Qq', pkg], { timeout: 4000 }); return true; }
    catch { return false; }
  }
  private async isAptInstalled(pkg: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('dpkg-query', ['-W', '-f=${db:Status-Status}\n', pkg], { timeout: 4000 });
      return stdout.trim() === 'installed';
    } catch { return false; }
  }
  private async isDnfInstalled(pkg: string): Promise<boolean> {
    try { await execFileAsync('rpm', ['-q', pkg], { timeout: 4000 }); return true; }
    catch { return false; }
  }

  async isMultilibEnabled(family: DistroFamily): Promise<boolean> {
    if (family === 'arch') {
      try {
        const content = await readFile('/etc/pacman.conf', 'utf-8');
        return /^\s*\[multilib\]/m.test(content) && !/^\s*#\s*\[multilib\]/m.test(content);
      } catch { return false; }
    }
    if (family === 'debian') {
      try {
        const { stdout } = await execFileAsync('dpkg', ['--print-foreign-architectures'], { timeout: 3000 });
        return stdout.split('\n').some(a => a.trim() === 'i386');
      } catch { return false; }
    }
    return family === 'fedora';
  }

  async sudoersInstalled(family: DistroFamily): Promise<boolean> {
    const testCmdMap: Partial<Record<DistroFamily, string[]>> = {
      arch:   ['/usr/bin/pacman', '-Sy'],
      debian: ['/usr/bin/apt-get', 'update'],
      fedora: ['/usr/bin/dnf', 'check-update'],
    };
    const testCmd = testCmdMap[family];
    if (!testCmd) return false;
    try {
      await execFileAsync('sudo', ['-n', '-l', ...testCmd], { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async scan(): Promise<SystemScan> {
    const [distro, gpu] = await Promise.all([this.detectDistro(), this.detectGpu()]);
    const multilibEnabled = await this.isMultilibEnabled(distro.family);
    const binaries = await this.hasBinaries(['gamescope', 'mangohud', 'gamemoded', 'steam', 'protontricks', 'winetricks', 'vulkaninfo']);
    let user: string;
    try { user = userInfo().username; } catch { user = process.env.USER ?? 'unknown'; }
    const sudoersInstalled = await this.sudoersInstalled(distro.family);
    return { distro, gpu, user, multilibEnabled, binaries, packages: {}, sudoersInstalled };
  }
}
