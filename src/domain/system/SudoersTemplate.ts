import type { DistroFamily } from './SystemTypes.js';

/**
 * Gera o conteudo do arquivo /etc/sudoers.d/protondeck pra um user/distro.
 * Whitelist STRITA: so subcomandos de install. NAO permite -R (remove) ou -U (file).
 */
export function generateSudoersContent(user: string, family: DistroFamily): string | null {
  const lines: string[] = [
    `# /etc/sudoers.d/protondeck — gerado pelo ProtonDeck`,
    `# Permite ao user '${user}' rodar comandos de install do gerenciador de pacotes`,
    `# sem senha. Whitelist restrita a subcomandos de instalacao/sync — nao permite`,
    `# remocao (-R) nem install de arquivo (-U).`,
    ``,
  ];

  if (family === 'arch') {
    lines.push(
      `${user} ALL=(root) NOPASSWD: /usr/bin/pacman -S --needed --noconfirm *`,
      `${user} ALL=(root) NOPASSWD: /usr/bin/pacman -Sy`,
      `${user} ALL=(root) NOPASSWD: /usr/bin/pacman -Syu --noconfirm`,
      `${user} ALL=(root) NOPASSWD: /usr/local/bin/protondeck-enable-multilib`,
    );
  } else if (family === 'debian') {
    lines.push(
      `${user} ALL=(root) NOPASSWD: /usr/bin/apt-get update`,
      `${user} ALL=(root) NOPASSWD: /usr/bin/apt-get install -y *`,
      `${user} ALL=(root) NOPASSWD: /usr/bin/dpkg --add-architecture i386`,
      `${user} ALL=(root) NOPASSWD: /usr/bin/dpkg --print-foreign-architectures`,
    );
  } else if (family === 'fedora') {
    lines.push(
      `${user} ALL=(root) NOPASSWD: /usr/bin/dnf install -y *`,
      `${user} ALL=(root) NOPASSWD: /usr/bin/dnf check-update`,
    );
  } else {
    return null;
  }

  lines.push(``);
  return lines.join('\n');
}

/**
 * Comando que o user deve rodar UMA VEZ no terminal pra instalar o sudoers.
 * Cria o arquivo via tee + chmod 440 (validacao com visudo).
 */
export function generateSetupCommand(user: string, family: DistroFamily): string | null {
  const content = generateSudoersContent(user, family);
  if (!content) return null;
  const parts = [
    `sudo tee /etc/sudoers.d/protondeck > /dev/null <<'EOF'`,
    content.trimEnd(),
    `EOF`,
    `sudo chmod 440 /etc/sudoers.d/protondeck`,
    `sudo visudo -c -f /etc/sudoers.d/protondeck`,
  ];
  if (family === 'arch') {
    parts.push(
      ``,
      `# Script helper para habilitar multilib (sem args problematicos no sudoers)`,
      `sudo tee /usr/local/bin/protondeck-enable-multilib > /dev/null <<'SCRIPT'`,
      `#!/bin/bash`,
      `sed -i '/^#\\[multilib\\]/s/^#//' /etc/pacman.conf`,
      `sed -i '/^\\[multilib\\]/{n;s/^#Include/Include/}' /etc/pacman.conf`,
      `SCRIPT`,
      `sudo chmod 755 /usr/local/bin/protondeck-enable-multilib`,
    );
  }
  return parts.join('\n');
}
