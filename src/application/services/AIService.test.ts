import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AIService } from './AIService.js';
import { InMemoryGameRepository, makeGameRow } from '../../test/fakes/InMemoryGameRepository.js';
import {
  InMemoryAIConfigRepository, InMemoryAICacheRepository, InMemorySystemInfoRepository,
} from '../../test/fakes/InMemoryCommonRepositories.js';
import type { ProtonLogReader, ProtonLogResult } from '../../application/ports/out/ProtonLogReader.js';
import type { ProtonDBCommunityClient } from '../../application/ports/out/ProtonDBCommunityClient.js';

function buildSvc(opts: { protonLogResult?: ProtonLogResult } = {}) {
  const aiConfig = new InMemoryAIConfigRepository();
  const aiCache = new InMemoryAICacheRepository();
  const games = new InMemoryGameRepository();
  games.seed([makeGameRow({ appid: '620', engine: 'source', tier: 'platinum' })]);
  const systemInfo = new InMemorySystemInfoRepository();
  const protonLog: ProtonLogReader = {
    read(_appid) {
      return opts.protonLogResult ?? { found: false, reason: 'missing', checked_path: '/tmp/x' };
    },
  };
  const protonDb: ProtonDBCommunityClient = {
    async fetchReports(_appid, _limit) {
      return { appid: '620', fetched_at: '2025-01-01', total: 0, reports: [] };
    },
  };
  return { aiConfig, aiCache, games, systemInfo, svc: new AIService(aiConfig, aiCache, games, systemInfo, protonLog, protonDb) };
}

test('getConfig / setConfig: passthrough pro repo', () => {
  const { svc } = buildSvc();
  assert.equal(svc.getConfig(), undefined);
  svc.setConfig({ provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: 'sk-test', base_url: null });
  const cfg = svc.getConfig();
  assert.ok(cfg);
  assert.equal(cfg!.provider, 'anthropic');
  assert.equal(cfg!.model, 'claude-sonnet-4-6');
});

test('readProtonLog: passthrough pro reader, retorna found=false quando log ausente', () => {
  const { svc } = buildSvc();
  const r = svc.readProtonLog('620');
  assert.equal(r.found, false);
});

test('readProtonLog: encaminha valor quando log existe', () => {
  const result: ProtonLogResult = {
    found: true, path: '/home/x/steam-620.log', size: 1234, mtime: '2025-01-01',
    excerpt: 'err: bla', truncated: false, lines: 10,
  };
  const { svc } = buildSvc({ protonLogResult: result });
  const r = svc.readProtonLog('620');
  assert.equal(r.found, true);
  if (r.found) assert.equal(r.lines, 10);
});

test('diagnose: lança erro se config AI ausente', async () => {
  const { svc } = buildSvc();
  await assert.rejects(svc.diagnose('620'), /n[aã]o configurada/i);
});

test('diagnose: lança erro se jogo não existe (mesmo com config)', async () => {
  const { svc } = buildSvc();
  svc.setConfig({ provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: 'sk', base_url: null });
  await assert.rejects(svc.diagnose('999'), /n[aã]o encontrado/i);
});

test('diagnose: cache hit retorna sem chamar agent', async () => {
  const { svc, aiCache } = buildSvc();
  svc.setConfig({ provider: 'anthropic', model: 'claude-sonnet-4-6', api_key: 'sk', base_url: null });
  // Pre-seed cache no key esperado. O AIService usa SHA-256 dos params; replicar exato é frágil.
  // Vez disso, valida via mecanismo: pre-popula com qualquer key e força o método a achar.
  // Mas como key é determinístico, vamos compor manualmente.
  const { createHash } = await import('node:crypto');
  const game = { user_launch_options: null, launch_options: '%command%', engine: 'source' };
  const ctxHash = JSON.stringify({ userLaunch: game.user_launch_options, curated: game.launch_options, engine: game.engine });
  const h = createHash('sha256').update(`diagnose|anthropic|claude-sonnet-4-6|620|${ctxHash}`).digest('hex').slice(0, 16);
  const key = `diagnose:620:${h}`;
  aiCache.preseed(key, JSON.stringify({ recommendation: 'cached-result' }));

  const r = await svc.diagnose('620');
  assert.equal(r.cached, true);
  assert.equal(r.recommendation, 'cached-result');
});
