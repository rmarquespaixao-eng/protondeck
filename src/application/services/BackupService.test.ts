import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BackupService } from './BackupService.js';
import { InMemoryGameRepository, makeGameRow } from '../../test/fakes/InMemoryGameRepository.js';

function buildSvc() {
  const repo = new InMemoryGameRepository();
  repo.seed([
    makeGameRow({ appid: '620', name: 'Portal 2', user_launch_options: 'X %command%' }),
    makeGameRow({ appid: '730', name: 'CS2', user_notes: 'ok' }),
    makeGameRow({ appid: '440', name: 'TF2' }), // sem override — não exporta
  ]);
  return { repo, svc: new BackupService(repo) };
}

test('buildExport: inclui só jogos com override ou notas', () => {
  const { svc } = buildSvc();
  const p = svc.buildExport('admin');
  assert.equal(p.format, 'protondeck-config-export');
  assert.equal(p.version, 1);
  assert.equal(p.exported_by, 'admin');
  assert.equal(p.games.length, 2);
  const ids = p.games.map(g => g.appid).sort();
  assert.deepEqual(ids, ['620', '730']);
});

test('validatePayload: rejeita format errado', () => {
  const { svc } = buildSvc();
  const r = svc.validatePayload({ format: 'something-else', games: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /formato/i);
});

test('validatePayload: rejeita games não-array', () => {
  const { svc } = buildSvc();
  const r = svc.validatePayload({ format: 'protondeck-config-export', games: 'nope' });
  assert.equal(r.ok, false);
});

test('validatePayload: aceita payload válido', () => {
  const { svc } = buildSvc();
  const r = svc.validatePayload({
    format: 'protondeck-config-export',
    version: 1,
    games: [{ appid: '620', user_launch_options: 'X', user_notes: null }],
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.entries.length, 1);
});

test('validatePayload: ignora entries sem appid', () => {
  const { svc } = buildSvc();
  const r = svc.validatePayload({
    format: 'protondeck-config-export',
    games: [{ appid: '620' }, { name: 'no-appid' }, null],
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.entries.length, 1);
});

test('buildPlan: marca inLibrary corretamente', () => {
  const { svc } = buildSvc();
  const plan = svc.buildPlan([
    { appid: '620', user_launch_options: 'A', user_notes: null },
    { appid: '999', user_launch_options: 'B', user_notes: null },
  ]);
  assert.equal(plan[0]!.inLibrary, true);
  assert.equal(plan[0]!.name, 'Portal 2');
  assert.equal(plan[1]!.inLibrary, false);
  assert.equal(plan[1]!.name, null);
});

test('apply: aplica só inLibrary, conta skipped', () => {
  const { svc, repo } = buildSvc();
  const plan = svc.buildPlan([
    { appid: '620', user_launch_options: 'NEW', user_notes: 'note' },
    { appid: '999', user_launch_options: 'X', user_notes: 'y' },
  ]);
  const r = svc.apply(plan);
  assert.equal(r.applied, 1);
  assert.equal(r.skipped, 1);
  assert.equal(repo.get('620')?.user_launch_options, 'NEW');
  assert.equal(repo.get('620')?.user_notes, 'note');
});
