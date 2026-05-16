import type { FastifyInstance } from 'fastify';
import { listGames, getStats, getSystemInfo, getDashboardData, getSteamConfig } from '../db.js';

type GamesQuery = {
  tier?: string;
  search?: string;
  installed?: string;
};

export async function indexRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (req, reply) => {
    const dash = getDashboardData();
    const system = getSystemInfo() as { gpu?: { model?: string }; monitors?: { name: string; width: number; height: number; refresh: number }[]; session?: { type: string; desktop: string } } | null;
    const steamConfigured = !!getSteamConfig();
    return reply.view('dashboard.ejs', {
      dash,
      system,
      steamConfigured,
      currentUser: req.currentUser,
    });
  });

  fastify.get<{ Querystring: GamesQuery }>('/games', async (req, reply) => {
    const { tier, search, installed } = req.query;
    const games = listGames({
      tier,
      search,
      installed: installed === '1' ? true : installed === '0' ? false : undefined
    });
    const stats = getStats();
    const system = getSystemInfo() as { gpu?: { model?: string }; monitors?: { name: string; width: number; height: number; refresh: number }[]; session?: { type: string; desktop: string } } | null;
    return reply.view('games.ejs', {
      games,
      stats,
      system,
      filters: { tier: tier ?? '', search: search ?? '', installed: installed ?? '' },
      empty: games.length === 0,
      currentUser: req.currentUser
    });
  });
}
