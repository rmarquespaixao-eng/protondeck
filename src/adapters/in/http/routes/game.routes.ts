import type { FastifyInstance } from 'fastify';
import type { GamesService } from '../../../../application/services/GamesService.js';
import type { PCGWService } from '../../../../application/services/PCGWService.js';
import type { SyncService } from '../../../../application/services/SyncService.js';
import type { SteamApplyService } from '../../../../application/services/SteamApplyService.js';
import type { ProtonDBCommunityClient } from '../../../../application/ports/out/ProtonDBCommunityClient.js';
import type { SystemInfoRepository } from '../../../../application/ports/out/SystemInfoRepository.js';
import { parseLaunchString } from '../../../../domain/games/LaunchOptions.js';
import {
  ENV_OPTIONS, ARG_OPTIONS, WRAPPER_OPTIONS, GAMESCOPE_OPTIONS,
  RESOLUTION_FORMATS, ENGINE_PRESETS,
} from '../../../../domain/games/ConfigCatalog.js';
import { COMPAT_RULES } from '../../../../domain/games/CompatibilityRules.js';

type Monitor = { name: string; width: number; height: number; refresh: number; priority: number; hdr?: boolean };

type Deps = {
  games: GamesService;
  pcgw: PCGWService;
  sync: SyncService;
  steamApply: SteamApplyService;
  protonDbCommunity: ProtonDBCommunityClient;
  systemInfo: SystemInfoRepository;
};

type GameParams = { appid: string };
type GameBody = {
  user_launch_options?: string;
  user_notes?: string;
  action?: 'save' | 'save_launch' | 'save_notes' | 'clear_launch' | 'clear_notes';
};

export function gameRoutes(deps: Deps) {
  return async function (fastify: FastifyInstance) {
    fastify.get<{ Params: GameParams }>('/game/:appid', async (req, reply) => {
      const game = deps.games.get(req.params.appid);
      if (!game) return reply.code(404).send('jogo nao encontrado');

      const notes = game.notes_json ? JSON.parse(game.notes_json) as string[] : [];
      const system = deps.systemInfo.get() as { monitors?: Monitor[] } | null;
      const monitors = system?.monitors ?? [];
      const currentMonitor = game.launch_options?.match(/SDL_VIDEO_FULLSCREEN_DISPLAYS=(\S+)/)?.[1] ?? null;

      const launchStr = game.user_launch_options || game.launch_options || '';
      const parsed = parseLaunchString(launchStr);
      const enginePreset = ENGINE_PRESETS[game.engine ?? ''] ?? null;

      return reply.view('game.ejs', {
        game,
        notes,
        monitors,
        currentMonitor,
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

    fastify.post<{ Params: GameParams; Body: GameBody }>('/game/:appid', async (req, reply) => {
      const { appid } = req.params;
      const game = deps.games.get(appid);
      if (!game) return reply.code(404).send('jogo nao encontrado');

      const action = req.body.action ?? 'save';
      if (action === 'clear_launch') deps.games.clearLaunch(appid);
      else if (action === 'clear_notes') deps.games.clearNotes(appid);
      else if (action === 'save_launch') deps.games.saveLaunch(appid, req.body.user_launch_options?.trim() || null);
      else if (action === 'save_notes')  deps.games.saveNotes(appid, req.body.user_notes?.trim() || null);
      else deps.games.updateOverride(appid, {
        user_launch_options: req.body.user_launch_options?.trim() || null,
        user_notes: req.body.user_notes?.trim() || null,
      });
      return reply.redirect(`/game/${appid}`);
    });

    fastify.get<{ Params: GameParams }>('/api/game/:appid/community', async (req, reply) => {
      try {
        const data = await deps.protonDbCommunity.fetchReports(req.params.appid);
        return reply.send(data);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(502).send({ error: (err as Error).message });
      }
    });

    fastify.get<{ Params: GameParams; Querystring: { force?: string } }>('/api/game/:appid/widescreen', async (req, reply) => {
      try {
        const data = await deps.pcgw.fetchWidescreen(req.params.appid, { force: req.query.force === '1' });
        return reply.send(data);
      } catch (err) {
        fastify.log.error(err);
        return reply.code(502).send({ error: (err as Error).message });
      }
    });

    fastify.get<{ Params: GameParams }>('/api/game/:appid/steam-launch', async (req, reply) => {
      const data = await deps.steamApply.describe(req.params.appid);
      return reply.send(data);
    });

    fastify.post<{ Params: GameParams }>('/api/game/:appid/apply-steam', async (req, reply) => {
      const result = await deps.steamApply.apply(req.params.appid);
      if ('error' in result) return reply.code(400).send(result);
      if (!result.ok) return reply.code(409).send({ ...result, error: result.reason });
      return reply.send(result);
    });

    fastify.post('/sync', async (_req, reply) => {
      try {
        const r = await deps.sync.syncFromSteamLaunch();
        fastify.log.info(`sync ok: ${r.upserts} jogos @ ${r.generated_at}`);
        return reply.redirect('/?sync=ok');
      } catch (e) {
        fastify.log.error(e);
        return reply.code(500).send(`sync falhou: ${(e as Error).message}`);
      }
    });
  };
}
