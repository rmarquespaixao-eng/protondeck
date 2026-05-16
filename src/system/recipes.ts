import type { DistroFamily, GpuVendor, PackageManager } from './detect.js';

export type RecipeGroup = {
  id: string;
  label: string;
  description: string;
  family: DistroFamily;
  /** Quando setado, so aplica se a GPU detectada bater. */
  gpuVendor?: GpuVendor;
  /** Pacotes a instalar via pkg manager. */
  packages: string[];
  /**
   * Verifica se o grupo ja esta "ok" sem precisar checar todos os pacotes.
   * Se vazio, o grupo e considerado satisfeito quando todos os `packages` estao instalados.
   * binaries presentes contam tambem.
   */
  satisfiedWhen?: { binaries?: string[] };
  /**
   * Pre-comandos que rodam antes do install (ex: habilitar repo, adicionar arch i386).
   * Cada item: ['/path/bin', 'arg1', 'arg2']. Sempre via sudo -n.
   */
  preCommands?: string[][];
  /** Aviso pra UI antes de instalar (ex: precisa de RPMFusion). */
  warning?: string;
};

export type Recipe = {
  family: DistroFamily;
  packageManager: PackageManager;
  installCommand: (pkgs: string[]) => string[];
  groups: RecipeGroup[];
};

// ────────────────────── ARCH FAMILY ──────────────────────

const ARCH_GROUPS: RecipeGroup[] = [
  {
    id: 'multilib',
    label: 'Habilitar multilib',
    description: 'Necessario pra rodar jogos 32-bit / Steam / Wine. Edita /etc/pacman.conf.',
    family: 'arch',
    packages: [],
    preCommands: [
      ['/usr/bin/sed', '-i', '/^#\\[multilib\\]/,/^#Include = \\/etc\\/pacman.d\\/mirrorlist/ s/^#//', '/etc/pacman.conf'],
      ['/usr/bin/pacman', '-Sy'],
    ],
    warning: 'Modifica /etc/pacman.conf descomentando a section [multilib].',
  },
  {
    id: 'gaming-core',
    label: 'Gaming core (gamescope + mangohud + gamemode)',
    description: 'Compositor Valve pra forçar resoluções, HUD de FPS/temps, governor que prioriza o jogo.',
    family: 'arch',
    packages: ['gamescope', 'mangohud', 'lib32-mangohud', 'gamemode', 'lib32-gamemode'],
    satisfiedWhen: { binaries: ['gamescope', 'mangohud', 'gamemoded'] },
  },
  {
    id: 'vulkan-nvidia',
    label: 'Vulkan NVIDIA (drivers + 32-bit)',
    description: 'Drivers NVIDIA proprietarios + libs 32-bit pra jogos antigos / Proton.',
    family: 'arch',
    gpuVendor: 'nvidia',
    packages: ['nvidia-utils', 'lib32-nvidia-utils', 'nvidia-settings', 'vulkan-icd-loader', 'lib32-vulkan-icd-loader'],
    warning: 'NAO inclui o kernel module — em CachyOS use nvidia-open-dkms; em Arch puro use nvidia / nvidia-dkms conforme seu kernel.',
  },
  {
    id: 'vulkan-amd',
    label: 'Vulkan AMD (Mesa + RADV)',
    description: 'Driver Mesa open + RADV (Vulkan) + variantes 32-bit.',
    family: 'arch',
    gpuVendor: 'amd',
    packages: ['mesa', 'lib32-mesa', 'vulkan-radeon', 'lib32-vulkan-radeon', 'vulkan-icd-loader', 'lib32-vulkan-icd-loader'],
  },
  {
    id: 'vulkan-intel',
    label: 'Vulkan Intel (Mesa ANV)',
    description: 'Driver Vulkan Intel ANV + 32-bit.',
    family: 'arch',
    gpuVendor: 'intel',
    packages: ['mesa', 'lib32-mesa', 'vulkan-intel', 'lib32-vulkan-intel', 'vulkan-icd-loader', 'lib32-vulkan-icd-loader'],
  },
  {
    id: 'steam',
    label: 'Steam',
    description: 'Cliente oficial (do repo multilib). Habilite multilib primeiro.',
    family: 'arch',
    packages: ['steam'],
    satisfiedWhen: { binaries: ['steam'] },
  },
  {
    id: 'proton-tools',
    label: 'Proton tools (protontricks + winetricks)',
    description: 'Scripts pra instalar runtime deps no prefix do Proton.',
    family: 'arch',
    packages: ['protontricks', 'winetricks'],
    satisfiedWhen: { binaries: ['protontricks', 'winetricks'] },
  },
];

// ────────────────────── DEBIAN/UBUNTU FAMILY ──────────────────────

const DEBIAN_GROUPS: RecipeGroup[] = [
  {
    id: 'multilib',
    label: 'Habilitar i386 (multi-arch)',
    description: 'Habilita pacotes 32-bit necessarios pra Steam/Proton.',
    family: 'debian',
    packages: [],
    preCommands: [
      ['/usr/bin/dpkg', '--add-architecture', 'i386'],
      ['/usr/bin/apt-get', 'update'],
    ],
  },
  {
    id: 'gaming-core',
    label: 'Gaming core (gamescope + mangohud + gamemode)',
    description: 'Compositor Valve, HUD, governor — disponivel em Ubuntu 24.04+.',
    family: 'debian',
    packages: ['gamescope', 'mangohud', 'gamemode'],
    satisfiedWhen: { binaries: ['gamescope', 'mangohud', 'gamemoded'] },
    warning: 'Versoes mais antigas do Ubuntu podem nao ter gamescope nas repos; considere PPA kisak/kisak-mesa.',
  },
  {
    id: 'vulkan-nvidia',
    label: 'Vulkan NVIDIA',
    description: 'Drivers proprietarios + libs 32-bit. Use ubuntu-drivers pra detectar a melhor versao.',
    family: 'debian',
    gpuVendor: 'nvidia',
    packages: ['libvulkan1', 'libvulkan1:i386', 'mesa-vulkan-drivers:i386'],
    warning: 'O driver NVIDIA em si (nvidia-driver-XXX) varia por versao. Instale via "ubuntu-drivers autoinstall" no terminal.',
  },
  {
    id: 'vulkan-amd',
    label: 'Vulkan AMD (Mesa)',
    description: 'Mesa Vulkan drivers + 32-bit.',
    family: 'debian',
    gpuVendor: 'amd',
    packages: ['mesa-vulkan-drivers', 'mesa-vulkan-drivers:i386', 'libvulkan1', 'libvulkan1:i386'],
  },
  {
    id: 'vulkan-intel',
    label: 'Vulkan Intel (Mesa)',
    description: 'Mesa Vulkan drivers + 32-bit.',
    family: 'debian',
    gpuVendor: 'intel',
    packages: ['mesa-vulkan-drivers', 'mesa-vulkan-drivers:i386', 'libvulkan1', 'libvulkan1:i386'],
  },
  {
    id: 'steam',
    label: 'Steam',
    description: 'Cliente oficial via repos do Ubuntu (multiverse).',
    family: 'debian',
    packages: ['steam-installer'],
    satisfiedWhen: { binaries: ['steam'] },
    warning: 'Precisa do componente "multiverse" habilitado no sources.list.',
  },
  {
    id: 'proton-tools',
    label: 'Proton tools (protontricks)',
    description: 'Scripts pra instalar runtime deps no prefix do Proton.',
    family: 'debian',
    packages: ['protontricks', 'winetricks'],
    satisfiedWhen: { binaries: ['protontricks', 'winetricks'] },
  },
];

// ────────────────────── FEDORA FAMILY ──────────────────────

const FEDORA_GROUPS: RecipeGroup[] = [
  {
    id: 'rpmfusion',
    label: 'Habilitar RPM Fusion (free + non-free)',
    description: 'Repositorio extra obrigatorio pra Steam, drivers NVIDIA, codecs.',
    family: 'fedora',
    packages: [],
    preCommands: [
      ['/usr/bin/dnf', 'install', '-y', 'https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm', 'https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm'],
    ],
    warning: 'Em distros derivadas (Nobara, Bazzite) o RPM Fusion ja vem habilitado.',
  },
  {
    id: 'gaming-core',
    label: 'Gaming core (gamescope + mangohud + gamemode)',
    description: 'Compositor Valve, HUD, governor.',
    family: 'fedora',
    packages: ['gamescope', 'mangohud', 'mangohud.i686', 'gamemode'],
    satisfiedWhen: { binaries: ['gamescope', 'mangohud', 'gamemoded'] },
  },
  {
    id: 'vulkan-nvidia',
    label: 'Vulkan NVIDIA',
    description: 'Drivers proprietarios via RPM Fusion + 32-bit.',
    family: 'fedora',
    gpuVendor: 'nvidia',
    packages: ['akmod-nvidia', 'xorg-x11-drv-nvidia-cuda', 'xorg-x11-drv-nvidia-libs.i686', 'vulkan-loader', 'vulkan-loader.i686'],
    warning: 'akmod compila o modulo do kernel — primeira boot apos install pode demorar.',
  },
  {
    id: 'vulkan-amd',
    label: 'Vulkan AMD (Mesa)',
    description: 'Mesa Vulkan + 32-bit.',
    family: 'fedora',
    gpuVendor: 'amd',
    packages: ['mesa-vulkan-drivers', 'mesa-vulkan-drivers.i686', 'vulkan-loader', 'vulkan-loader.i686'],
  },
  {
    id: 'vulkan-intel',
    label: 'Vulkan Intel (Mesa)',
    description: 'Mesa Vulkan + 32-bit.',
    family: 'fedora',
    gpuVendor: 'intel',
    packages: ['mesa-vulkan-drivers', 'mesa-vulkan-drivers.i686', 'vulkan-loader', 'vulkan-loader.i686'],
  },
  {
    id: 'steam',
    label: 'Steam',
    description: 'Cliente oficial via RPM Fusion non-free.',
    family: 'fedora',
    packages: ['steam'],
    satisfiedWhen: { binaries: ['steam'] },
  },
  {
    id: 'proton-tools',
    label: 'Proton tools (protontricks + winetricks)',
    description: 'Scripts pra instalar runtime deps no prefix do Proton.',
    family: 'fedora',
    packages: ['protontricks', 'winetricks'],
    satisfiedWhen: { binaries: ['protontricks', 'winetricks'] },
  },
];

// ────────────────────── COMANDOS DE INSTALL ──────────────────────

const PACMAN_INSTALL = (pkgs: string[]) => ['/usr/bin/pacman', '-S', '--needed', '--noconfirm', ...pkgs];
const APT_INSTALL    = (pkgs: string[]) => ['/usr/bin/apt-get', 'install', '-y', ...pkgs];
const DNF_INSTALL    = (pkgs: string[]) => ['/usr/bin/dnf', 'install', '-y', ...pkgs];

const RECIPES: Record<DistroFamily, Recipe | null> = {
  arch:    { family: 'arch',    packageManager: 'pacman', installCommand: PACMAN_INSTALL, groups: ARCH_GROUPS },
  debian:  { family: 'debian',  packageManager: 'apt',    installCommand: APT_INSTALL,    groups: DEBIAN_GROUPS },
  fedora:  { family: 'fedora',  packageManager: 'dnf',    installCommand: DNF_INSTALL,    groups: FEDORA_GROUPS },
  unknown: null,
};

export function getRecipe(family: DistroFamily): Recipe | null {
  return RECIPES[family];
}

export function getRelevantGroups(family: DistroFamily, gpu: GpuVendor): RecipeGroup[] {
  const recipe = getRecipe(family);
  if (!recipe) return [];
  return recipe.groups.filter(g => !g.gpuVendor || g.gpuVendor === gpu);
}

export function getGroupById(family: DistroFamily, groupId: string): RecipeGroup | null {
  const recipe = getRecipe(family);
  if (!recipe) return null;
  return recipe.groups.find(g => g.id === groupId) ?? null;
}
