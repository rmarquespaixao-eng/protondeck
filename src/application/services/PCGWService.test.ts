import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PCGWService } from './PCGWService.js';
import type { PCGWClient } from '../../application/ports/out/PCGWClient.js';
import type { WidescreenInfo } from '../../domain/pcgw/WidescreenInfo.js';

test('fetchWidescreen: delega pro client', async () => {
  const expected: WidescreenInfo = {
    found: true,
    features: { widescreen: { state: 'native', notes: 'Hor+' } },
    fetched_at: '2025-01-01',
  };
  const client: PCGWClient = {
    async fetchWidescreenInfo(_appid, _opts) { return expected; },
  };
  const svc = new PCGWService(client);
  const r = await svc.fetchWidescreen('620');
  assert.deepEqual(r, expected);
});

test('fetchWidescreen: passa force option', async () => {
  let receivedForce: boolean | undefined;
  const client: PCGWClient = {
    async fetchWidescreenInfo(_appid, opts) {
      receivedForce = opts?.force;
      return { found: false, features: {}, fetched_at: '2025-01-01' };
    },
  };
  const svc = new PCGWService(client);
  await svc.fetchWidescreen('620', { force: true });
  assert.equal(receivedForce, true);
});
