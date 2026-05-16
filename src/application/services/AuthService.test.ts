import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AuthService } from './AuthService.js';
import { InMemoryUserRepository } from '../../test/fakes/InMemoryUserRepository.js';

function buildSvc() {
  const repo = new InMemoryUserRepository();
  return { repo, svc: new AuthService(repo) };
}

test('hasAdmin: false quando banco vazio', () => {
  const { svc } = buildSvc();
  assert.equal(svc.hasAdmin(), false);
});

test('createAdmin: cria com senha hash + auto-login', async () => {
  const { svc, repo } = buildSvc();
  const r = await svc.createAdmin('admin', 'protondeck123', 'protondeck123');
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.user.username, 'admin');
    assert.ok(r.user.password_hash.startsWith('$2'));
  }
  assert.equal(repo.count(), 1);
});

test('createAdmin: rejeita username curto', async () => {
  const { svc } = buildSvc();
  const r = await svc.createAdmin('ab', 'protondeck123', 'protondeck123');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /3 caracteres/);
});

test('createAdmin: rejeita senha curta', async () => {
  const { svc } = buildSvc();
  const r = await svc.createAdmin('admin', 'short', 'short');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /8 caracteres/);
});

test('createAdmin: rejeita senhas que não conferem', async () => {
  const { svc } = buildSvc();
  const r = await svc.createAdmin('admin', 'protondeck123', 'protondeck456');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /conferem/);
});

test('createAdmin: bloqueia se admin já existe', async () => {
  const { svc } = buildSvc();
  await svc.createAdmin('admin', 'protondeck123', 'protondeck123');
  const r = await svc.createAdmin('admin2', 'protondeck123', 'protondeck123');
  assert.equal(r.ok, false);
});

test('authenticate: credencial válida', async () => {
  const { svc } = buildSvc();
  await svc.createAdmin('admin', 'protondeck123', 'protondeck123');
  const r = await svc.authenticate('admin', 'protondeck123');
  assert.equal(r.ok, true);
});

test('authenticate: senha errada', async () => {
  const { svc } = buildSvc();
  await svc.createAdmin('admin', 'protondeck123', 'protondeck123');
  const r = await svc.authenticate('admin', 'wrongpass');
  assert.equal(r.ok, false);
});

test('authenticate: usuário inexistente', async () => {
  const { svc } = buildSvc();
  await svc.createAdmin('admin', 'protondeck123', 'protondeck123');
  const r = await svc.authenticate('hacker', 'protondeck123');
  assert.equal(r.ok, false);
});
