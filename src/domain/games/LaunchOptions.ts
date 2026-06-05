import { WRAPPER_OPTIONS, GAMESCOPE_OPTIONS, RESOLUTION_FORMATS } from './ConfigCatalog.js';

export type ParsedLaunch = {
  currentEnv: Record<string, string>;
  currentArgs: string[];
  currentWrappers: string[];
  gamescopeEnabled: boolean;
  gamescopeValues: Record<string, string>;
  currentResFormats: string[];
  currentResWidth: string;
  currentResHeight: string;
};

export function parseLaunchString(launch: string): ParsedLaunch {
  const currentEnv: Record<string, string> = {};
  const currentArgs: string[] = [];
  const currentWrappers: string[] = [];
  const gamescopeValues: Record<string, string> = {};
  const currentResFormats: string[] = [];
  let gamescopeEnabled = false;
  let currentResWidth = '3440';
  let currentResHeight = '1440';

  const cmdIdx = launch.indexOf('%command%');
  const before = cmdIdx >= 0 ? launch.slice(0, cmdIdx) : launch;
  const after  = cmdIdx >= 0 ? launch.slice(cmdIdx + '%command%'.length) : '';

  const envRx = /([A-Za-z_][A-Za-z0-9_]*)=(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = envRx.exec(before)) !== null) {
    if (m[1] !== undefined && m[2] !== undefined) currentEnv[m[1]] = m[2];
  }

  for (const w of WRAPPER_OPTIONS) {
    if (before.includes(w.prefix)) currentWrappers.push(w.key);
  }

  const gsTokenRx = /(?:^|\s)gamescope(?=\s|$)/;
  if (gsTokenRx.test(before)) {
    gamescopeEnabled = true;
    const gsStart = before.search(gsTokenRx);
    const gsSliceRaw = before.slice(gsStart).replace(/^\s*gamescope\s*/, '');
    const wrapperPrefixes = WRAPPER_OPTIONS.map(w => w.prefix);
    const stopTokens = new Set(['--', ...wrapperPrefixes]);
    const allTokens = gsSliceRaw.split(/\s+/).filter(Boolean);
    const gsTokens: string[] = [];
    for (const t of allTokens) {
      if (stopTokens.has(t)) break;
      gsTokens.push(t);
    }
    for (const opt of GAMESCOPE_OPTIONS) {
      if (opt.type === 'toggle') {
        if (gsTokens.includes(opt.flag)) gamescopeValues[opt.flag] = '1';
      } else {
        const idx = gsTokens.indexOf(opt.flag);
        const nextTok = gsTokens[idx + 1];
        if (idx >= 0 && nextTok !== undefined) {
          gamescopeValues[opt.flag] = nextTok;
        }
      }
    }
  }

  const allWidthFlags  = new Map(RESOLUTION_FORMATS.map(f => [f.widthFlag,  f.key]));
  const allHeightFlags = new Set(RESOLUTION_FORMATS.map(f => f.heightFlag));
  const afterTokens = after.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < afterTokens.length) {
    const tok = afterTokens[i] ?? '';
    const nextTok = afterTokens[i + 1] ?? '';
    const fmtKey = allWidthFlags.get(tok);
    if (fmtKey !== undefined && nextTok !== '' && /^\d+$/.test(nextTok)) {
      currentResWidth = nextTok;
      if (!currentResFormats.includes(fmtKey)) currentResFormats.push(fmtKey);
      i += 2;
    } else if (tok !== '' && allHeightFlags.has(tok) && nextTok !== '' && /^\d+$/.test(nextTok)) {
      currentResHeight = nextTok;
      i += 2;
    } else {
      if (tok.startsWith('-')) currentArgs.push(tok);
      i++;
    }
  }

  return {
    currentEnv, currentArgs, currentWrappers,
    gamescopeEnabled, gamescopeValues,
    currentResFormats, currentResWidth, currentResHeight,
  };
}
