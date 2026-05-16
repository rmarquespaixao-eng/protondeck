import { existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProtonLogReader, ProtonLogResult } from '../../../ports/ProtonLogReader.js';

const MAX_EXCERPT_BYTES = 8000;
const MAX_LINES_TAIL    = 400;
const ERR_PATTERNS = [
  /\berr:/i,
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

export class ProtonLogFs implements ProtonLogReader {
  read(appid: string): ProtonLogResult {
    const path = join(homedir(), `steam-${appid}.log`);
    if (!existsSync(path)) return { found: false, reason: 'missing', checked_path: path };

    const st = statSync(path);
    if (st.size === 0) return { found: false, reason: 'empty', checked_path: path };

    const headBuf = Buffer.alloc(Math.min(st.size, 256 * 1024));
    const fd = openSync(path, 'r');
    try {
      const readStart = Math.max(0, st.size - headBuf.length);
      readSync(fd, headBuf, 0, headBuf.length, readStart);
    } finally { closeSync(fd); }

    const raw = headBuf.toString('utf8');
    const allLines = raw.split('\n');
    const lines = (st.size > headBuf.length ? allLines.slice(1) : allLines).filter(Boolean);

    const tailLines = lines.slice(-MAX_LINES_TAIL);
    const errLines = lines.filter(l => ERR_PATTERNS.some(rx => rx.test(l)));
    const errSet = new Set(errLines);
    const tailSet = new Set(tailLines);
    const combined: string[] = [];
    for (const l of lines) {
      if (errSet.has(l) || tailSet.has(l)) combined.push(l);
    }

    let excerpt = combined.join('\n');
    let truncated = false;
    if (Buffer.byteLength(excerpt, 'utf8') > MAX_EXCERPT_BYTES) {
      truncated = true;
      const errsOnly = errLines.join('\n');
      if (Buffer.byteLength(errsOnly, 'utf8') < MAX_EXCERPT_BYTES) {
        const remaining = MAX_EXCERPT_BYTES - Buffer.byteLength(errsOnly, 'utf8') - 64;
        const tailStr = tailLines.join('\n');
        const tailTruncated = tailStr.length > remaining ? tailStr.slice(-remaining) : tailStr;
        excerpt = `[erros do log]\n${errsOnly}\n\n[tail recente]\n${tailTruncated}`;
      } else {
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
}
