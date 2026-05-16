export type RunnerEvent =
  | { type: 'cmd';    cmd: string }
  | { type: 'stdout'; line: string }
  | { type: 'stderr'; line: string }
  | { type: 'exit';   code: number | null; signal: NodeJS.Signals | null };

export interface SystemRunner {
  /** Roda lista de comandos com sudo -n, emitindo eventos. */
  runSudoSequence(
    argvList: string[][],
    onEvent: (ev: RunnerEvent) => void,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; failedAt?: number }>;
}
