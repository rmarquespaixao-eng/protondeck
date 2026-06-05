import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setLaunchOptionsContent, readLaunchOptionsContent } from '../../../domain/games/VdfParser.js';
import type { SteamLocalConfigClient, ApplyLaunchResult } from '../../../application/ports/out/SteamLocalConfigClient.js';

const execFileAsync = promisify(execFile);

const STEAM_ID64_BASE = 76561197960265728n;

function steamId64ToAccountId(id64: string): string {
  return (BigInt(id64) - STEAM_ID64_BASE).toString();
}

export class SteamLocalConfigFs implements SteamLocalConfigClient {
  configPath(steamId64: string): string {
    const accountId = steamId64ToAccountId(steamId64);
    return join(homedir(), '.steam', 'steam', 'userdata', accountId, 'config', 'localconfig.vdf');
  }

  async exists(steamId64: string): Promise<boolean> {
    try { await access(this.configPath(steamId64), constants.R_OK | constants.W_OK); return true; }
    catch { return false; }
  }

  async isSteamRunning(): Promise<boolean> {
    try { await execFileAsync('pgrep', ['-x', 'steam'], { timeout: 2000 }); return true; }
    catch { return false; }
  }

  async readLaunchOptions(steamId64: string, appid: string): Promise<{ found: boolean; value: string | null; reason?: string }> {
    const path = this.configPath(steamId64);
    try { await access(path, constants.R_OK); }
    catch { return { found: false, value: null, reason: 'localconfig.vdf não acessível' }; }
    const content = await readFile(path, 'utf-8');
    const { found, value } = readLaunchOptionsContent(content, appid);
    if (!found) return { found: false, value: null, reason: 'appid não encontrado no localconfig.vdf' };
    return { found: true, value };
  }

  async applyLaunchOptions(steamId64: string, appid: string, launchOptions: string): Promise<ApplyLaunchResult> {
    const path = this.configPath(steamId64);
    try { await access(path, constants.R_OK | constants.W_OK); }
    catch {
      return { ok: false, path, steamWasRunning: false, reason: `arquivo nao encontrado ou sem permissao: ${path}` };
    }
    const steamWasRunning = await this.isSteamRunning();
    if (steamWasRunning) {
      return { ok: false, path, steamWasRunning: true, reason: 'Steam está rodando — feche o cliente Steam (não só minimize) antes de aplicar; o cliente sobrescreve o localconfig.vdf quando fecha.' };
    }
    const content = await readFile(path, 'utf-8');
    const updated = setLaunchOptionsContent(content, appid, launchOptions);
    if (updated === null) {
      return { ok: false, path, steamWasRunning: false, reason: `appid ${appid} nao encontrado em ${path}. Abra as propriedades do jogo no Steam uma vez pra ele criar a entry.` };
    }
    const backupPath = `${path}.protondeck.bak`;
    await copyFile(path, backupPath);
    await writeFile(path, updated, 'utf-8');
    return { ok: true, path, backupPath, steamWasRunning: false };
  }
}
