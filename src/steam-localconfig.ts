import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const STEAM_ID64_BASE = 76561197960265728n;

export function steamId64ToAccountId(id64: string): string {
  const account = BigInt(id64) - STEAM_ID64_BASE;
  return account.toString();
}

export function getLocalConfigPath(steamId64: string): string {
  const accountId = steamId64ToAccountId(steamId64);
  return join(homedir(), '.steam', 'steam', 'userdata', accountId, 'config', 'localconfig.vdf');
}

export async function localConfigExists(steamId64: string): Promise<boolean> {
  const path = getLocalConfigPath(steamId64);
  try { await access(path, constants.R_OK | constants.W_OK); return true; }
  catch { return false; }
}

export async function isSteamRunning(): Promise<boolean> {
  try {
    await execFileAsync('pgrep', ['-x', 'steam'], { timeout: 2000 });
    return true;
  } catch { return false; }
}

/**
 * Encontra os offsets das chaves { e } que delimitam o bloco do appid
 * dentro de UserLocalConfigStore.Software.Valve.Steam.apps.<appid>.
 * Faz um scan linear balanceando aspas e chaves.
 */
function findAppBlockBoundaries(content: string, appid: string): { open: number; close: number } | null {
  const keyToken = `"${appid}"`;
  // Procura a chave do appid; a primeira match dentro de "apps" geralmente e o bloco certo,
  // mas confirmamos checando que o `{` vem imediatamente apos (Steam sempre faz isso).
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const keyIdx = content.indexOf(keyToken, searchFrom);
    if (keyIdx < 0) return null;
    // Pula whitespace ate o '{'
    let i = keyIdx + keyToken.length;
    while (i < content.length && /\s/.test(content[i] ?? '')) i++;
    if (content[i] !== '{') { searchFrom = keyIdx + 1; continue; }
    const open = i;
    // Balanceia
    let depth = 1;
    i = open + 1;
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === '"') {
        // Pula string ate o proximo '"' nao escapado
        i++;
        while (i < content.length && content[i] !== '"') {
          if (content[i] === '\\') i++;
          i++;
        }
        i++;
      } else if (ch === '{') { depth++; i++; }
      else if (ch === '}') { depth--; i++; }
      else { i++; }
    }
    if (depth !== 0) return null;
    return { open, close: i - 1 };
  }
  return null;
}

function escapeVdfString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function detectIndentBeforeClose(content: string, closeIdx: number): string {
  let i = closeIdx - 1;
  let indent = '';
  while (i >= 0 && (content[i] === '\t' || content[i] === ' ')) {
    indent = content[i] + indent;
    i--;
  }
  return indent;
}

/**
 * Aplica (ou cria) "LaunchOptions" dentro do bloco do appid.
 * Retorna o novo conteudo ou null se nao achou o bloco.
 */
export function setLaunchOptionsContent(content: string, appid: string, launchOptions: string): string | null {
  const bounds = findAppBlockBoundaries(content, appid);
  if (!bounds) return null;

  const blockInner = content.slice(bounds.open + 1, bounds.close);
  const launchOptsRx = /("LaunchOptions"\s*")((?:\\.|[^"\\])*)(")/;
  const escaped = escapeVdfString(launchOptions);

  if (launchOptsRx.test(blockInner)) {
    const newInner = blockInner.replace(launchOptsRx, `$1${escaped}$3`);
    return content.slice(0, bounds.open + 1) + newInner + content.slice(bounds.close);
  }

  // Inserir como nova entry antes do `}` de fechamento, copiando indent
  const closeIndent = detectIndentBeforeClose(content, bounds.close);
  const fieldIndent = closeIndent + '\t';
  const insertion = `${fieldIndent}"LaunchOptions"\t\t"${escaped}"\n${closeIndent}`;
  return content.slice(0, bounds.close - closeIndent.length) + insertion + content.slice(bounds.close);
}

export type ApplyResult = {
  ok: boolean;
  path: string;
  backupPath?: string;
  steamWasRunning: boolean;
  reason?: string;
};

/**
 * Aplica launchOptions no localconfig.vdf. Faz backup .protondeck.bak antes.
 * NUNCA escreve se Steam estiver rodando (vai sobrescrever ao fechar).
 */
export async function applyLaunchOptions(steamId64: string, appid: string, launchOptions: string): Promise<ApplyResult> {
  const path = getLocalConfigPath(steamId64);

  try { await access(path, constants.R_OK | constants.W_OK); }
  catch {
    return { ok: false, path, steamWasRunning: false, reason: `arquivo nao encontrado ou sem permissao: ${path}` };
  }

  const steamWasRunning = await isSteamRunning();
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

/**
 * Le o LaunchOptions atual sem modificar — pra UI conferir antes de aplicar.
 */
export async function readLaunchOptions(steamId64: string, appid: string): Promise<{ found: boolean; value: string | null; reason?: string }> {
  const path = getLocalConfigPath(steamId64);
  try { await access(path, constants.R_OK); }
  catch { return { found: false, value: null, reason: 'localconfig.vdf não acessível' }; }
  const content = await readFile(path, 'utf-8');
  const bounds = findAppBlockBoundaries(content, appid);
  if (!bounds) return { found: false, value: null, reason: 'appid não encontrado no localconfig.vdf' };
  const inner = content.slice(bounds.open + 1, bounds.close);
  const m = inner.match(/"LaunchOptions"\s*"((?:\\.|[^"\\])*)"/);
  if (!m) return { found: true, value: null };
  // Unescape basico
  const value = (m[1] ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
  return { found: true, value };
}
