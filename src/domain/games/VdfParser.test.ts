import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  findAppBlockBoundaries, setLaunchOptionsContent, readLaunchOptionsContent,
  escapeVdfString, unescapeVdfString,
} from './VdfParser.js';

const SAMPLE = `"UserLocalConfigStore"
{
\t"Software"
\t{
\t\t"Valve"
\t\t{
\t\t\t"Steam"
\t\t\t{
\t\t\t\t"apps"
\t\t\t\t{
\t\t\t\t\t"620"
\t\t\t\t\t{
\t\t\t\t\t\t"LastPlayed"\t\t"1700000000"
\t\t\t\t\t\t"LaunchOptions"\t\t"OLD %command%"
\t\t\t\t\t}
\t\t\t\t\t"730"
\t\t\t\t\t{
\t\t\t\t\t\t"LastPlayed"\t\t"1700000001"
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}`;

test('findAppBlockBoundaries: encontra bloco existente', () => {
  const b = findAppBlockBoundaries(SAMPLE, '620');
  assert.ok(b !== null);
  assert.equal(SAMPLE[b!.open], '{');
  assert.equal(SAMPLE[b!.close], '}');
});

test('findAppBlockBoundaries: retorna null pra appid inexistente', () => {
  assert.equal(findAppBlockBoundaries(SAMPLE, '999999'), null);
});

test('setLaunchOptionsContent: atualiza LaunchOptions existente', () => {
  const result = setLaunchOptionsContent(SAMPLE, '620', 'DXVK_ASYNC=1 %command%');
  assert.ok(result !== null);
  assert.match(result!, /"LaunchOptions"\s*"DXVK_ASYNC=1 %command%"/);
  assert.doesNotMatch(result!, /"OLD %command%"/);
});

test('setLaunchOptionsContent: insere LaunchOptions quando não existe', () => {
  const result = setLaunchOptionsContent(SAMPLE, '730', 'MANGOHUD=1 %command%');
  assert.ok(result !== null);
  assert.match(result!, /"LaunchOptions"\s*"MANGOHUD=1 %command%"/);
});

test('setLaunchOptionsContent: retorna null pra appid inexistente', () => {
  assert.equal(setLaunchOptionsContent(SAMPLE, '999', 'x'), null);
});

test('readLaunchOptionsContent: lê valor existente', () => {
  const r = readLaunchOptionsContent(SAMPLE, '620');
  assert.equal(r.found, true);
  assert.equal(r.value, 'OLD %command%');
});

test('readLaunchOptionsContent: found mas sem LaunchOptions', () => {
  const r = readLaunchOptionsContent(SAMPLE, '730');
  assert.equal(r.found, true);
  assert.equal(r.value, null);
});

test('readLaunchOptionsContent: not found', () => {
  const r = readLaunchOptionsContent(SAMPLE, '999');
  assert.equal(r.found, false);
  assert.equal(r.value, null);
});

test('escape/unescape: aspas duplas e backslash', () => {
  const original = 'echo "hello world" && %command%';
  const escaped = escapeVdfString(original);
  assert.equal(escaped, 'echo \\"hello world\\" && %command%');
  assert.equal(unescapeVdfString(escaped), original);
});

test('round-trip: set + read preserva valor', () => {
  const launch = 'DXVK_ASYNC=1 PROTON_ENABLE_NVAPI=1 gamescope -w 3440 -h 1440 -- %command% -dx12';
  const updated = setLaunchOptionsContent(SAMPLE, '730', launch);
  assert.ok(updated !== null);
  const r = readLaunchOptionsContent(updated!, '730');
  assert.equal(r.value, launch);
});
