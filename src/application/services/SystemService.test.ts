import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SystemService } from './SystemService.js';
import type { SystemDetector } from '../../application/ports/out/SystemDetector.js';
import type { SystemRunner, RunnerEvent } from '../../application/ports/out/SystemRunner.js';
import type { SystemScan, DistroFamily, PackageManager, GpuVendor } from '../../domain/system/SystemTypes.js';

function fakeScan(overrides: Partial<SystemScan> = {}): SystemScan {
  return {
    distro: {
      id: 'arch',
      family: 'arch' as DistroFamily,
      versionId: null,
      prettyName: 'Arch Linux',
      packageManager: 'pacman' as PackageManager,
    },
    gpu: { vendor: 'nvidia' as GpuVendor, model: 'RTX 4090', vendorIds: [0x10de] },
    user: 'rafael',
    multilibEnabled: true,
    binaries: { gamescope: true, mangohud: false, gamemoded: false, steam: false, protontricks: false, winetricks: false, vulkaninfo: true },
    packages: {},
    sudoersInstalled: false,
    ...overrides,
  };
}

function buildSvc(opts: {
  scan?: SystemScan;
  pkgInstalled?: Record<string, boolean>;
  runnerOk?: boolean;
  runEvents?: RunnerEvent[];
} = {}) {
  const detector: SystemDetector = {
    async detectDistro() { return (opts.scan ?? fakeScan()).distro; },
    async detectGpu() { return (opts.scan ?? fakeScan()).gpu; },
    async hasBinaries(_n) { return (opts.scan ?? fakeScan()).binaries; },
    async arePackagesInstalled(_pm, pkgs) {
      const out: Record<string, boolean> = {};
      for (const p of pkgs) out[p] = opts.pkgInstalled?.[p] ?? false;
      return out;
    },
    async isMultilibEnabled(_f) { return (opts.scan ?? fakeScan()).multilibEnabled; },
    async sudoersInstalled(_f) { return (opts.scan ?? fakeScan()).sudoersInstalled; },
    async scan() { return opts.scan ?? fakeScan(); },
  };
  const runner: SystemRunner = {
    async runSudoSequence(_argv, onEvent, _signal) {
      for (const ev of opts.runEvents ?? []) onEvent(ev);
      return { ok: opts.runnerOk ?? true };
    },
  };
  return new SystemService(detector, runner);
}

test('scan: retorna o scan completo', async () => {
  const svc = buildSvc();
  const s = await svc.scan();
  assert.equal(s.distro.family, 'arch');
  assert.equal(s.gpu.vendor, 'nvidia');
});

test('groupStatuses: gaming-core nao satisfeito quando faltam binarios', async () => {
  const svc = buildSvc();
  const { groups } = await svc.groupStatuses();
  const gc = groups.find(g => g.id === 'gaming-core');
  assert.ok(gc);
  assert.equal(gc!.satisfied, false); // mangohud/gamemoded false
});

test('groupStatuses: multilib satisfied via flag', async () => {
  const svc = buildSvc({ scan: fakeScan({ multilibEnabled: true }) });
  const { groups } = await svc.groupStatuses();
  const ml = groups.find(g => g.id === 'multilib');
  assert.ok(ml);
  assert.equal(ml!.satisfied, true);
});

test('groupStatuses: filtra grupos por GPU vendor', async () => {
  const svc = buildSvc({ scan: fakeScan({ gpu: { vendor: 'nvidia', model: '', vendorIds: [] } }) });
  const { groups } = await svc.groupStatuses();
  // Arch group "vulkan-nvidia" deve estar; vulkan-amd/intel não
  assert.ok(groups.some(g => g.id === 'vulkan-nvidia'));
  assert.ok(!groups.some(g => g.id === 'vulkan-amd'));
  assert.ok(!groups.some(g => g.id === 'vulkan-intel'));
});

test('sudoersTemplate: arch tem pacman whitelist', async () => {
  const svc = buildSvc();
  const tpl = svc.sudoersTemplate(fakeScan());
  assert.match(tpl.content ?? '', /\/usr\/bin\/pacman/);
  assert.match(tpl.setupCommand ?? '', /sudo tee/);
});

test('buildInstallArgs: monta sequencia pre-commands + install', async () => {
  const svc = buildSvc();
  const scan = fakeScan();
  const group = svc.getGroup(scan, 'gaming-core')!;
  const argv = svc.buildInstallArgs(scan, group);
  // gaming-core arch: ['gamescope', 'mangohud', 'lib32-mangohud', 'gamemode', 'lib32-gamemode']
  // Sem preCommands. So 1 sequence — o install.
  assert.equal(argv.length, 1);
  assert.equal(argv[0]![0], '/usr/bin/pacman');
  assert.ok(argv[0]!.includes('gamescope'));
});

test('runSudoSequence: emite eventos via callback', async () => {
  const events: RunnerEvent[] = [
    { type: 'cmd', cmd: 'sudo -n /usr/bin/pacman -S gamescope' },
    { type: 'stdout', line: 'resolving deps...' },
    { type: 'exit', code: 0, signal: null },
  ];
  const svc = buildSvc({ runEvents: events, runnerOk: true });
  const captured: RunnerEvent[] = [];
  const r = await svc.runSudoSequence([['/usr/bin/pacman', '-S', 'gamescope']], (ev) => captured.push(ev));
  assert.equal(r.ok, true);
  assert.equal(captured.length, 3);
  assert.equal(captured[0]!.type, 'cmd');
});
