import type { FastifyInstance } from 'fastify';
import { listGames, getStats, getSystemInfo } from '../db.js';

type IndexQuery = {
  tier?: string;
  search?: string;
  installed?: string;
};

export async function indexRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: IndexQuery }>('/', async (req, reply) => {
    const { tier, search, installed } = req.query;
    const games = listGames({
      tier,
      search,
      installed: installed === '1' ? true : installed === '0' ? false : undefined
    });
    const stats = getStats();
    const system = getSystemInfo() as { gpu?: { model?: string }; monitors?: { name: string; width: number; height: number; refresh: number }[]; session?: { type: string; desktop: string } } | null;
    return reply.view('index.ejs', {
      games,
      stats,
      system,
      filters: { tier: tier ?? '', search: search ?? '', installed: installed ?? '' },
      empty: games.length === 0,
      currentUser: req.currentUser
    });
  });
}
