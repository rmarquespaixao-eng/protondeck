import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CheckService } from './CheckService.js';
import type {
  SteamSearchClient, ProtonDBClient, SteamStoreClient,
} from '../../application/ports/out/CheckClients.js';
import type { PCGWClient } from '../../application/ports/out/PCGWClient.js';

function buildSvc(opts: {
  searchResults?: { appid: string; name: string; logo: string | null }[];
  protonTier?: string;
  storeLinux?: boolean;
  storeComingSoon?: boolean;
} = {}) {
  const search: SteamSearchClient = {
    async search(_q: string) {
      return opts.searchResults ?? [{ appid: '620', name: 'Portal 2', logo: null }];
    },
  };
  const protonDb: ProtonDBClient = {
    async fetchSummary(appid: string) {
      return {
        appid, tier: opts.protonTier ?? 'platinum', total: 100,
        fetched_at: '2025-01-01', found: opts.protonTier !== undefined,
      };
    },
  };
  const store: SteamStoreClient = {
    async fetchDetails(appid: string) {
      return {
        appid, found: true, fetched_at: '2025-01-01',
        platforms: { windows: true, mac: false, linux: opts.storeLinux ?? false },
        ...(opts.storeComingSoon !== undefined ? { comingSoon: opts.storeComingSoon } : {}),
      };
    },
  };
  const pcgw: PCGWClient = {
    async fetchWidescreenInfo(_appid: string) {
      return { found: false, features: {}, fetched_at: '2025-01-01' };
    },
  };
  return new CheckService(search, protonDb, store, pcgw);
}

test('search: delega pro SteamSearchClient', async () => {
  const svc = buildSvc({ searchResults: [{ appid: '730', name: 'CS2', logo: null }] });
  const r = await svc.search('cs2');
  assert.equal(r.length, 1);
  assert.equal(r[0]!.appid, '730');
});

test('check: combina os 3 clients + recomenda go pra platinum', async () => {
  const svc = buildSvc({ protonTier: 'platinum' });
  const r = await svc.check('620');
  assert.equal(r.appid, '620');
  assert.equal(r.recommendation, 'go');
  assert.equal(r.protondb.tier, 'platinum');
});

test('check: linux nativo + pending → go', async () => {
  const svc = buildSvc({ storeLinux: true });
  const r = await svc.check('620');
  assert.equal(r.recommendation, 'go');
});

test('check: coming_soon → unreleased', async () => {
  const svc = buildSvc({ protonTier: 'platinum', storeComingSoon: true });
  const r = await svc.check('620');
  assert.equal(r.recommendation, 'unreleased');
});

test('check: borked → risky', async () => {
  const svc = buildSvc({ protonTier: 'borked' });
  const r = await svc.check('620');
  assert.equal(r.recommendation, 'risky');
});

test('check: faz fetch dos 3 em paralelo (todos retornam)', async () => {
  const svc = buildSvc({ protonTier: 'gold' });
  const r = await svc.check('620');
  assert.ok(r.store);
  assert.ok(r.protondb);
  assert.ok(r.pcgw);
});
