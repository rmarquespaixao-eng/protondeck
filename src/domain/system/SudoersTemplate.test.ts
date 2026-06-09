import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateSudoersContent, generateSetupCommand } from './SudoersTemplate.js';

test('arch: pacman whitelist + helper de multilib (sem sed no sudoers)', () => {
  const c = generateSudoersContent('rafael', 'arch');
  assert.ok(c !== null);
  assert.match(c!, /rafael ALL=\(root\) NOPASSWD: \/usr\/bin\/pacman -S --needed --noconfirm \*/);
  assert.match(c!, /\/usr\/bin\/pacman -Sy/);
  // Multilib agora via script helper whitelisted — sem sed/args problemáticos dentro do sudoers.
  assert.match(c!, /\/usr\/local\/bin\/protondeck-enable-multilib/);
  assert.doesNotMatch(c!, /sed/);
});

test('debian: apt + dpkg', () => {
  const c = generateSudoersContent('rafael', 'debian');
  assert.ok(c !== null);
  assert.match(c!, /\/usr\/bin\/apt-get update/);
  assert.match(c!, /\/usr\/bin\/apt-get install -y \*/);
  assert.match(c!, /\/usr\/bin\/dpkg --add-architecture i386/);
});

test('fedora: dnf', () => {
  const c = generateSudoersContent('rafael', 'fedora');
  assert.ok(c !== null);
  assert.match(c!, /\/usr\/bin\/dnf install -y \*/);
  assert.match(c!, /\/usr\/bin\/dnf check-update/);
});

test('unknown: retorna null', () => {
  assert.equal(generateSudoersContent('rafael', 'unknown'), null);
});

test('NÃO permite -R nem -U (whitelist estrita)', () => {
  for (const family of ['arch', 'debian', 'fedora'] as const) {
    const c = generateSudoersContent('rafael', family);
    assert.ok(c !== null);
    assert.doesNotMatch(c!, /pacman -R/);
    assert.doesNotMatch(c!, /pacman -U /);
    assert.doesNotMatch(c!, /apt-get remove/);
    assert.doesNotMatch(c!, /dnf remove/);
  }
});

test('setupCommand: encapsula em heredoc + chmod + visudo', () => {
  const cmd = generateSetupCommand('rafael', 'arch');
  assert.ok(cmd !== null);
  assert.match(cmd!, /sudo tee \/etc\/sudoers.d\/protondeck/);
  assert.match(cmd!, /chmod 440/);
  assert.match(cmd!, /visudo -c -f/);
});

test('setupCommand arch: instala o helper de multilib com os dois sed', () => {
  const cmd = generateSetupCommand('rafael', 'arch');
  assert.ok(cmd !== null);
  assert.match(cmd!, /sudo tee \/usr\/local\/bin\/protondeck-enable-multilib/);
  assert.ok(cmd!.includes("sed -i '/^#\\[multilib\\]/s/^#//' /etc/pacman.conf"));
  assert.ok(cmd!.includes("sed -i '/^\\[multilib\\]/{n;s/^#Include/Include/}' /etc/pacman.conf"));
  assert.match(cmd!, /chmod 755 \/usr\/local\/bin\/protondeck-enable-multilib/);
});

test('setupCommand debian: sem helper de multilib (só arch)', () => {
  const cmd = generateSetupCommand('rafael', 'debian');
  assert.ok(cmd !== null);
  assert.doesNotMatch(cmd!, /protondeck-enable-multilib/);
});

test('setupCommand: null pra distro unknown', () => {
  assert.equal(generateSetupCommand('rafael', 'unknown'), null);
});
