// Lê o log do Proton de ~/steam-<appid>.log (gerado quando PROTON_LOG=1).
// Faz filtragem inteligente: linhas de erro + tail, limitado em tamanho pro prompt.

import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ProtonLogResult =
  | { found: false; reason: 'missing' | 'empty'; checked_path: string }
  | { found: true; path: string; size: number; mtime: string; excerpt: string; truncated: boolean; lines: number };

const MAX_EXCERPT_BYTES = 8000;          // limite p/ não estourar context window
const MAX_LINES_TAIL    = 400;            // pega últimas N linhas
const ERR_PATTERNS = [
  /\berr:/i,                              // wine err: classico
  /\bwarn:/i,
  /dxvk:.*error/i,
  /dxvk:.*fail/i,
  /vkd3d.*err/i,
  /vkd3d.*fail/i,
  /unhandled exception/i,
  /segfault/i,
  /assertion failed/i,
  /failed to load/i,
  /could not load/i,
  /missing.*\.dll/i,
  /winegstreamer/i,
  /unimplemented/i,
];

function pickLogPath(appid: string): string {
  return join(homedir(), `steam-${appid}.log`);
}

export function readProtonLog(appid: string): ProtonLogResult {
  const path = pickLogPath(appid);
  if (!existsSync(path)) return { found: false, reason: 'missing', checked_path: path };

  const st = statSync(path);
  if (st.size === 0) return { found: false, reason: 'empty', checked_path: path };

  // Lê só o tail pra não carregar GBs em memória
  const headBuf = Buffer.alloc(Math.min(st.size, 256 * 1024));
  const fd = openSync(path, 'r');
  try {
    const readStart = Math.max(0, st.size - headBuf.length);
    readSync(fd, headBuf, 0, headBuf.length, readStart);
  } finally {
    closeSync(fd);
  }

  const raw = headBuf.toString('utf8');
  const allLines = raw.split('\n');
  // Se cortou no meio da linha, descarta a primeira parcial
  const lines = (st.size > headBuf.length ? allLines.slice(1) : allLines).filter(Boolean);

  // Estratégia: pega TODAS as linhas de erro/warn + as últimas MAX_LINES_TAIL
  // depois dedup mantendo ordem
  const tailLines = lines.slice(-MAX_LINES_TAIL);
  const errLines = lines.filter(l => ERR_PATTERNS.some(rx => rx.test(l)));

  // Combina mantendo ordem do log original. Marca linhas selecionadas com Set por índice.
  const errSet = new Set(errLines);
  const tailSet = new Set(tailLines);
  const combined: string[] = [];
  for (const l of lines) {
    if (errSet.has(l) || tailSet.has(l)) combined.push(l);
  }

  // Limita por bytes
  let excerpt = combined.join('\n');
  let truncated = false;
  if (Buffer.byteLength(excerpt, 'utf8') > MAX_EXCERPT_BYTES) {
    truncated = true;
    // Prioriza erros: se erros sozinhos cabem, mostra erros + tail truncado.
    const errsOnly = errLines.join('\n');
    if (Buffer.byteLength(errsOnly, 'utf8') < MAX_EXCERPT_BYTES) {
      const remaining = MAX_EXCERPT_BYTES - Buffer.byteLength(errsOnly, 'utf8') - 64;
      const tailStr = tailLines.join('\n');
      const tailTruncated = tailStr.length > remaining ? tailStr.slice(-remaining) : tailStr;
      excerpt = `[erros do log]\n${errsOnly}\n\n[tail recente]\n${tailTruncated}`;
    } else {
      // Erros sozinhos já estouram — pega os últimos
      excerpt = errsOnly.slice(-MAX_EXCERPT_BYTES);
    }
  }

  return {
    found: true,
    path,
    size: st.size,
    mtime: st.mtime.toISOString(),
    excerpt,
    truncated,
    lines: lines.length,
  };
}
