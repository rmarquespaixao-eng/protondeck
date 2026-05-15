import type { FastifyInstance } from 'fastify';
import { getGame, updateGameUserFields, clearGameUserFields, getSystemInfo } from '../db.js';
import { syncFromSteamLaunch } from '../sync.js';
import { fetchCommunityReports } from '../protondb-community.js';

type Monitor = { name: string; width: number; height: number; refresh: number; priority: number; hdr?: boolean };

type GameParams = { appid: string };
type GameBody = {
  user_launch_options?: string;
  user_notes?: string;
  action?: 'save' | 'clear_launch' | 'clear_notes';
};

export async function gameRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: GameParams }>('/game/:appid', async (req, reply) => {
    const game = getGame(req.params.appid);
    if (!game) {
      return reply.code(404).send('jogo nao encontrado');
    }
    const notes = game.notes_json ? JSON.parse(game.notes_json) as string[] : [];
    const system = getSystemInfo() as { monitors?: Monitor[] } | null;
    const monitors = system?.monitors ?? [];
    const currentMonitor = game.launch_options?.match(/SDL_VIDEO_FULLSCREEN_DISPLAYS=(\S+)/)?.[1] ?? null;
    return reply.view('game.ejs', { game, notes, monitors, currentMonitor });
  });

  fastify.post<{ Params: GameParams; Body: GameBody }>('/game/:appid', async (req, reply) => {
    const { appid } = req.params;
    const game = getGame(appid);
    if (!game) return reply.code(404).send('jogo nao encontrado');

    const action = req.body.action ?? 'save';
    if (action === 'clear_launch') {
      clearGameUserFields(appid, { user_launch_options: true });
    } else if (action === 'clear_notes') {
      clearGameUserFields(appid, { user_notes: true });
    } else {
      updateGameUserFields(appid, {
        user_launch_options: req.body.user_launch_options?.trim() || null,
        user_notes: req.body.user_notes?.trim() || null
      });
    }
    return reply.redirect(`/game/${appid}`);
  });

  fastify.get<{ Params: GameParams }>('/api/game/:appid/community', async (req, reply) => {
    try {
      const data = await fetchCommunityReports(req.params.appid);
      return reply.send(data);
    } catch (err) {
      fastify.log.error(err);
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  fastify.post('/sync', async (req, reply) => {
    try {
      const r = await syncFromSteamLaunch();
      fastify.log.info(`sync ok: ${r.upserts} jogos @ ${r.generated_at}`);
      return reply.redirect('/?sync=ok');
    } catch (e) {
      fastify.log.error(e);
      return reply.code(500).send(`sync falhou: ${(e as Error).message}`);
    }
  });
}
