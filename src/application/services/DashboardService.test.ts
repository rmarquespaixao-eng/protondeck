import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DashboardService } from './DashboardService.js';
import { InMemoryGameRepository, makeGameRow } from '../../test/fakes/InMemoryGameRepository.js';
import { InMemorySnapshotRepository } from '../../test/fakes/InMemorySnapshotRepository.js';

test('build: stats consolidadas + ultimos jogados + overrides', () => {
  const games = new InMemoryGameRepository();
  games.seed([
    makeGameRow({ appid: '620', name: 'Portal 2', tier: 'platinum', installed: 1, playtime_minutes: 60, last_played: '2025-01-15T12:00:00Z', updated_at: '2025-01-10T00:00:00Z' }),
    makeGameRow({ appid: '730', name: 'CS2', tier: 'gold', installed: 0, playtime_minutes: 180, last_played: '2025-01-20T12:00:00Z' }),
    makeGameRow({ appid: '440', name: 'TF2', tier: 'bronze', installed: 1, playtime_minutes: 0, last_played: null, user_launch_options: 'X', updated_at: '2025-01-25T00:00:00Z' }),
  ]);
  const snapshots = new InMemorySnapshotRepository();
  snapshots.insert({ generated_at: '2025-01-30T00:00:00Z', steam_id64: '7656119...', game_count: 3, raw_json: '{}' });

  const dash = new DashboardService(games, snapshots).build();
  assert.equal(dash.total, 3);
  assert.equal(dash.installed, 2);
  assert.deepEqual(dash.byTier, { platinum: 1, gold: 1, bronze: 1 });
  assert.equal(dash.overridesCount, 1);
  assert.equal(dash.totalPlaytimeHours, 4); // (60+180+0)/60 = 4
  assert.equal(dash.lastSync, '2025-01-30T00:00:00Z');
  // recentlyPlayed: CS2 (mais recente) primeiro, depois Portal 2; TF2 sai (last_played null)
  assert.equal(dash.recentlyPlayed[0]!.appid, '730');
  assert.equal(dash.recentlyPlayed.length, 2);
  // recentlyOverridden: só TF2
  assert.equal(dash.recentlyOverridden.length, 1);
  assert.equal(dash.recentlyOverridden[0]!.appid, '440');
});

test('build: banco vazio → defaults coerentes', () => {
  const games = new InMemoryGameRepository();
  const snapshots = new InMemorySnapshotRepository();
  const dash = new DashboardService(games, snapshots).build();
  assert.equal(dash.total, 0);
  assert.equal(dash.installed, 0);
  assert.equal(dash.overridesCount, 0);
  assert.equal(dash.totalPlaytimeHours, 0);
  assert.equal(dash.lastSync, null);
  assert.deepEqual(dash.recentlyPlayed, []);
  assert.deepEqual(dash.recentlyOverridden, []);
});
