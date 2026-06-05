import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GamesService } from './GamesService.js';
import { InMemoryGameRepository, makeGameRow } from '../../test/fakes/InMemoryGameRepository.js';

function buildSvc() {
  const repo = new InMemoryGameRepository();
  repo.seed([
    makeGameRow({ appid: '620', name: 'Portal 2', tier: 'platinum', installed: 1 }),
    makeGameRow({ appid: '730', name: 'Counter-Strike 2', tier: 'gold', installed: 0 }),
    makeGameRow({ appid: '1065310', name: 'Evil West', tier: 'gold', installed: 1, user_launch_options: 'DXVK_ASYNC=1 %command%' }),
  ]);
  return { repo, svc: new GamesService(repo) };
}

test('list: sem filtro retorna tudo', () => {
  const { svc } = buildSvc();
  assert.equal(svc.list().length, 3);
});

test('list: filtra por tier', () => {
  const { svc } = buildSvc();
  const r = svc.list({ tier: 'platinum' });
  assert.equal(r.length, 1);
  assert.equal(r[0]!.appid, '620');
});

test('list: filtra installed=true', () => {
  const { svc } = buildSvc();
  const r = svc.list({ installed: true });
  assert.equal(r.length, 2);
});

test('list: filtra por search (nome)', () => {
  const { svc } = buildSvc();
  const r = svc.list({ search: 'Portal' });
  assert.equal(r.length, 1);
  assert.equal(r[0]!.appid, '620');
});

test('get: appid existente', () => {
  const { svc } = buildSvc();
  assert.equal(svc.get('620')?.name, 'Portal 2');
});

test('get: appid inexistente → undefined', () => {
  const { svc } = buildSvc();
  assert.equal(svc.get('999'), undefined);
});

test('saveLaunch + saveNotes + clear', () => {
  const { svc, repo } = buildSvc();
  svc.saveLaunch('620', 'MANGOHUD=1 %command%');
  assert.equal(repo.get('620')?.user_launch_options, 'MANGOHUD=1 %command%');

  svc.saveNotes('620', 'funciona ok');
  assert.equal(repo.get('620')?.user_notes, 'funciona ok');

  svc.clearLaunch('620');
  assert.equal(repo.get('620')?.user_launch_options, null);
  assert.equal(repo.get('620')?.user_notes, 'funciona ok'); // notes mantém

  svc.clearNotes('620');
  assert.equal(repo.get('620')?.user_notes, null);
});

test('updateOverride: atualiza launch + notes juntos', () => {
  const { svc, repo } = buildSvc();
  svc.updateOverride('620', { user_launch_options: 'X %command%', user_notes: 'ok' });
  assert.equal(repo.get('620')?.user_launch_options, 'X %command%');
  assert.equal(repo.get('620')?.user_notes, 'ok');
});
