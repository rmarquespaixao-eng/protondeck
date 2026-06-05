import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { computeRecommendation } from './Recommendation.js';
import type { ProtonDBSummary, SteamStoreInfo } from './CheckResult.js';
import type { WidescreenInfo } from '../pcgw/WidescreenInfo.js';

function store(over: Partial<SteamStoreInfo> = {}): SteamStoreInfo {
  return { appid: '1', found: true, fetched_at: '2025-01-01', ...over };
}
function proton(tier: string, found = true, total = 100): ProtonDBSummary {
  return { appid: '1', tier, total, fetched_at: '2025-01-01', found };
}
function pcgw(): WidescreenInfo {
  return { found: false, features: {}, fetched_at: '2025-01-01' };
}

test('rec: coming_soon → unreleased', () => {
  const r = computeRecommendation(store({ comingSoon: true }), proton('platinum'), pcgw());
  assert.equal(r.rec, 'unreleased');
  assert.match(r.reasons[0] ?? '', /lan/i);
});

test('rec: platinum → go', () => {
  const r = computeRecommendation(store(), proton('platinum'), pcgw());
  assert.equal(r.rec, 'go');
  assert.ok(r.reasons.some(x => x.includes('platinum')));
});

test('rec: gold → go', () => {
  const r = computeRecommendation(store(), proton('gold'), pcgw());
  assert.equal(r.rec, 'go');
});

test('rec: native tier → go', () => {
  const r = computeRecommendation(store(), proton('native'), pcgw());
  assert.equal(r.rec, 'go');
});

test('rec: linux nativo + sem proton data → go', () => {
  const r = computeRecommendation(
    store({ platforms: { windows: true, mac: false, linux: true } }),
    proton('pending', false, 0),
    pcgw(),
  );
  assert.equal(r.rec, 'go');
});

test('rec: silver → caution', () => {
  const r = computeRecommendation(store(), proton('silver'), pcgw());
  assert.equal(r.rec, 'caution');
});

test('rec: silver + ultra-wide hackable → caution com nota', () => {
  const r = computeRecommendation(store(), proton('silver'), {
    found: true,
    features: { ultrawidescreen: { state: 'hackable', notes: '' } },
    fetched_at: '2025-01-01',
  });
  assert.equal(r.rec, 'caution');
  assert.ok(r.reasons.some(x => x.toLowerCase().includes('ultra')));
});

test('rec: bronze → risky', () => {
  const r = computeRecommendation(store(), proton('bronze'), pcgw());
  assert.equal(r.rec, 'risky');
});

test('rec: borked → risky', () => {
  const r = computeRecommendation(store(), proton('borked'), pcgw());
  assert.equal(r.rec, 'risky');
});

test('rec: sem dados sem linux nativo → no-data', () => {
  const r = computeRecommendation(
    store({ platforms: { windows: true, mac: false, linux: false } }),
    proton('pending', false, 0),
    pcgw(),
  );
  assert.equal(r.rec, 'no-data');
});
