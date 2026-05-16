import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateSudoersContent, generateSetupCommand } from './SudoersTemplate.js';

test('arch: pacman whitelist + multilib sed', () => {
  const c = generateSudoersContent('rafael', 'arch');
  assert.ok(c !== null);
  assert.match(c!, /rafael ALL=\(root\) NOPASSWD: \/usr\/bin\/pacman -S --needed --noconfirm \*/);
  assert.match(c!, /\/usr\/bin\/pacman -Sy/);
  assert.match(c!, /\/usr\/bin\/sed.*multilib.*\/etc\/pacman.conf/);
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

test('setupCommand: null pra distro unknown', () => {
  assert.equal(generateSetupCommand('rafael', 'unknown'), null);
});
