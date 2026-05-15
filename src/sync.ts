import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { applySnapshot, getSteamConfig, type Snapshot } from './db.js';

const execFileAsync = promisify(execFile);

const TOOL_PATH = process.env.STEAM_LAUNCH_TOOL
  ?? join(homedir(), '.claude', 'tools', 'steam-launch', 'steam-launch.mjs');

const CREDENTIALS_PATH = process.env.STEAM_LAUNCH_CREDENTIALS
  ?? join(homedir(), '.claude', 'tools', 'steam-launch', 'data', 'credentials.json');

function writeCredentialsFromDB(): { wrote: boolean; path: string } {
  const cfg = getSteamConfig();
  if (!cfg) return { wrote: false, path: CREDENTIALS_PATH };
  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify({
    steam_api_key: cfg.api_key,
    steam_id64:    cfg.steam_id64,
  }, null, 2));
  return { wrote: true, path: CREDENTIALS_PATH };
}

export async function syncFromSteamLaunch(): Promise<{ upserts: number; snapshot_id: number; generated_at: string }> {
  writeCredentialsFromDB();
  const { stdout } = await execFileAsync('node', [TOOL_PATH, 'dashboard:snapshot'], {
    maxBuffer: 50 * 1024 * 1024
  });
  const snap = JSON.parse(stdout) as Snapshot;
  const result = applySnapshot(snap);
  return { ...result, generated_at: snap.generated_at };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncFromSteamLaunch()
    .then(r => {
      console.log(`sync ok: ${r.upserts} jogos (snapshot ${r.snapshot_id} @ ${r.generated_at})`);
      process.exit(0);
    })
    .catch(e => {
      console.error('sync falhou:', e.message);
      process.exit(1);
    });
}
