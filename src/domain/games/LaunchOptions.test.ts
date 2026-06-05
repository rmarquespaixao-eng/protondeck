import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseLaunchString } from './LaunchOptions.js';

test('parseLaunchString: string vazia → tudo default', () => {
  const r = parseLaunchString('');
  assert.deepEqual(r.currentEnv, {});
  assert.deepEqual(r.currentArgs, []);
  assert.deepEqual(r.currentWrappers, []);
  assert.equal(r.gamescopeEnabled, false);
  assert.deepEqual(r.gamescopeValues, {});
  assert.deepEqual(r.currentResFormats, []);
  assert.equal(r.currentResWidth, '3440');
  assert.equal(r.currentResHeight, '1440');
});

test('parseLaunchString: env vars antes de %command%', () => {
  const r = parseLaunchString('DXVK_ASYNC=1 PROTON_ENABLE_NVAPI=1 %command%');
  assert.deepEqual(r.currentEnv, { DXVK_ASYNC: '1', PROTON_ENABLE_NVAPI: '1' });
});

test('parseLaunchString: gamescope com -W/-H', () => {
  const r = parseLaunchString('gamescope -W 3440 -H 1440 -f -- %command%');
  assert.equal(r.gamescopeEnabled, true);
  assert.equal(r.gamescopeValues['-W'], '3440');
  assert.equal(r.gamescopeValues['-H'], '1440');
  assert.equal(r.gamescopeValues['-f'], '1');
});

test('parseLaunchString: args após %command%', () => {
  const r = parseLaunchString('%command% -dx12 -novid -fullscreen');
  assert.deepEqual(r.currentArgs.sort(), ['-dx12', '-fullscreen', '-novid']);
});

test('parseLaunchString: -width/-height parse e exclui de args', () => {
  const r = parseLaunchString('%command% -width 3440 -height 1440 -dx12');
  assert.equal(r.currentResWidth, '3440');
  assert.equal(r.currentResHeight, '1440');
  assert.ok(r.currentResFormats.includes('width_height'));
  assert.deepEqual(r.currentArgs, ['-dx12']);
});

test('parseLaunchString: combinação real (Evil West)', () => {
  const launch = 'DXVK_ASYNC=1 DXVK_ENABLE_NVAPI=1 gamescope -w 3440 -h 1440 -f --force-grab-cursor -- mangohud %command% -dx12';
  const r = parseLaunchString(launch);
  assert.equal(r.currentEnv.DXVK_ASYNC, '1');
  assert.equal(r.currentEnv.DXVK_ENABLE_NVAPI, '1');
  assert.equal(r.gamescopeEnabled, true);
  assert.equal(r.gamescopeValues['-w'], '3440');
  assert.equal(r.gamescopeValues['-h'], '1440');
  assert.equal(r.gamescopeValues['-f'], '1');
  assert.equal(r.gamescopeValues['--force-grab-cursor'], '1');
  assert.ok(r.currentWrappers.includes('mangohud'));
  assert.ok(r.currentArgs.includes('-dx12'));
});
