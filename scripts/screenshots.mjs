#!/usr/bin/env node
// Gera screenshots das telas principais do ProtonDeck.
//
// Pre-condicoes:
//   1. Servidor rodando em http://127.0.0.1:3030 (npm run dev em outro terminal)
//   2. Usuario admin cadastrado com a senha em PD_PASSWORD (default 1354a52a)
//   3. data/panel.db populado (npm run sync rodado pelo menos uma vez)
//
// Uso:
//   node scripts/screenshots.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'screenshots');
const BASE = process.env.PD_BASE ?? 'http://127.0.0.1:3030';
const USERNAME = process.env.PD_USER ?? 'admin';
const PASSWORD = process.env.PD_PASSWORD ?? '1354a52a';

mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };

// fullPage só quando faz sentido pra leitura (dashboard que mostra varias secoes);
// pras telas com muito scroll (lista de jogos, builder cheio) viewport-only e' melhor.
const shots = [
  { name: '01-login', path: '/login', preLogin: true, fullPage: false },
  { name: '02-dashboard', path: '/', fullPage: true },
  { name: '03-games', path: '/games', fullPage: false },
  { name: '04-game-detail', path: '/game/1065310', fullPage: false, waitMs: 1500 },
  { name: '05-check-empty', path: '/check', fullPage: false },
  { name: '06-check-detail', path: '/check', fullPage: false, action: async (page) => {
      await page.fill('#check-q', 'resident evil 4');
      await page.waitForTimeout(600);
      await page.waitForSelector('.check-hit', { timeout: 5000 });
      const hits = await page.$$('.check-hit');
      if (hits[0]) await hits[0].click();
      await page.waitForSelector('.check-detail-card .check-recommendation', { timeout: 15000 });
      await page.waitForTimeout(500);
    } },
  { name: '07-system', path: '/system', fullPage: false, waitMs: 2500 },
  { name: '08-backup', path: '/backup', fullPage: false },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Login (cookie compartilhado pelas próximas visitas)
console.log('login...');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
// captura tela de login ANTES de submeter
await page.screenshot({ path: join(OUT_DIR, '01-login.png'), fullPage: false });
await page.fill('input[name="username"]', USERNAME);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForURL(`${BASE}/`, { timeout: 10000 }),
  page.click('button[type="submit"]'),
]);

for (const s of shots) {
  if (s.preLogin) continue; // já capturado acima
  console.log(`-> ${s.name} (${s.path})`);
  await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' });
  if (s.waitMs) await page.waitForTimeout(s.waitMs);
  if (s.action) await s.action(page);
  await page.screenshot({ path: join(OUT_DIR, `${s.name}.png`), fullPage: s.fullPage ?? true });
}

await browser.close();
console.log(`\nOK — screenshots em ${OUT_DIR}`);
