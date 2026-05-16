import { spawn } from 'node:child_process';
import type { SystemRunner, RunnerEvent } from '../../../application/ports/out/SystemRunner.js';

export class SudoSystemRunner implements SystemRunner {
  async runSudoSequence(
    argvList: string[][],
    onEvent: (ev: RunnerEvent) => void,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; failedAt?: number }> {
    for (let i = 0; i < argvList.length; i++) {
      const argv = argvList[i]!;
      const cmd = ['sudo', '-n', ...argv];
      onEvent({ type: 'cmd', cmd: cmd.join(' ') });
      const result = await runOne(cmd, onEvent, signal);
      if (signal?.aborted) return { ok: false, failedAt: i };
      if (result.code !== 0) return { ok: false, failedAt: i };
    }
    return { ok: true };
  }
}

function runOne(
  argv: string[],
  onEvent: (ev: RunnerEvent) => void,
  signal?: AbortSignal,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve) => {
    const [bin, ...rest] = argv;
    if (!bin) { resolve({ code: 1, signal: null }); return; }
    const proc = spawn(bin, rest, { stdio: ['ignore', 'pipe', 'pipe'] });

    const onAbort = () => { try { proc.kill('SIGTERM'); } catch { /* */ } };
    signal?.addEventListener('abort', onAbort, { once: true });

    let stdoutBuf = '';
    let stderrBuf = '';

    proc.stdout.setEncoding('utf-8');
    proc.stderr.setEncoding('utf-8');

    proc.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk;
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        onEvent({ type: 'stdout', line });
      }
    });
    proc.stderr.on('data', (chunk: string) => {
      stderrBuf += chunk;
      let idx;
      while ((idx = stderrBuf.indexOf('\n')) >= 0) {
        const line = stderrBuf.slice(0, idx);
        stderrBuf = stderrBuf.slice(idx + 1);
        onEvent({ type: 'stderr', line });
      }
    });
    proc.on('error', (err) => {
      onEvent({ type: 'stderr', line: `[spawn error] ${err.message}` });
      signal?.removeEventListener('abort', onAbort);
      resolve({ code: 127, signal: null });
    });
    proc.on('close', (code, sig) => {
      if (stdoutBuf) onEvent({ type: 'stdout', line: stdoutBuf });
      if (stderrBuf) onEvent({ type: 'stderr', line: stderrBuf });
      onEvent({ type: 'exit', code, signal: sig });
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, signal: sig });
    });
  });
}
