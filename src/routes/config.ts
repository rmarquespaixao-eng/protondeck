import type { FastifyInstance } from 'fastify';
import { getGame, updateGameUserFields } from '../db.js';
import { ENV_OPTIONS, ARG_OPTIONS, WRAPPER_OPTIONS, GAMESCOPE_OPTIONS, RESOLUTION_FORMATS, ENGINE_PRESETS } from '../config-catalog.js';
import { COMPAT_RULES } from '../compatibility-rules.js';

type ConfigParams = { appid: string };
type ConfigBody = { launch_options?: string };

function parseLaunchString(launch: string) {
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

  // Env vars (KEY=VALUE before %command%, skip gamescope flags like -W=val)
  const envRx = /([A-Za-z_][A-Za-z0-9_]*)=(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = envRx.exec(before)) !== null) {
    if (m[1] !== undefined && m[2] !== undefined) currentEnv[m[1]] = m[2];
  }

  // Non-gamescope wrappers
  for (const w of WRAPPER_OPTIONS) {
    if (before.includes(w.prefix)) currentWrappers.push(w.key);
  }

  // Gamescope: extract flags between the gamescope token and "--" (or any non-gamescope wrapper / end of before)
  // Procura "gamescope" como token isolado (não substring em env var)
  const gsTokenRx = /(?:^|\s)gamescope(?=\s|$)/;
  if (gsTokenRx.test(before)) {
    gamescopeEnabled = true;
    const gsStart = before.search(gsTokenRx);
    const gsSliceRaw = before.slice(gsStart).replace(/^\s*gamescope\s*/, '');
    // Para de coletar opts ao encontrar "--" OU outro wrapper conhecido (mangohud/gamemoderun)
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

  // Args + resolution after %command%
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

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: ConfigParams }>('/game/:appid/config', async (req, reply) => {
    const game = getGame(req.params.appid);
    if (!game) return reply.code(404).send('jogo nao encontrado');

    const launchStr = game.user_launch_options || game.launch_options || '';
    const parsed = parseLaunchString(launchStr);

    const enginePreset = ENGINE_PRESETS[game.engine ?? ''] ?? null;

    return reply.view('config.ejs', {
      game,
      envOptions: ENV_OPTIONS,
      argOptions: ARG_OPTIONS,
      wrapperOptions: WRAPPER_OPTIONS,
      gamescopeOptions: GAMESCOPE_OPTIONS,
      resolutionFormats: RESOLUTION_FORMATS,
      compatRules: COMPAT_RULES,
      enginePreset,
      enginePresetsAll: ENGINE_PRESETS,
      currentUser: req.currentUser,
      ...parsed,
    });
  });

  fastify.post<{ Params: ConfigParams; Body: ConfigBody }>('/game/:appid/config', async (req, reply) => {
    const { appid } = req.params;
    const game = getGame(appid);
    if (!game) return reply.code(404).send('jogo nao encontrado');

    const launch = req.body.launch_options?.trim() || null;
    updateGameUserFields(appid, { user_launch_options: launch });
    return reply.redirect(`/game/${appid}`);
  });
}
