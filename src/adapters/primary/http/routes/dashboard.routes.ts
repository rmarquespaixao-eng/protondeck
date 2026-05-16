import type { FastifyInstance } from 'fastify';
import type { GameRepository, GameListFilter } from '../../../../ports/GameRepository.js';
import type { SystemInfoRepository } from '../../../../ports/SystemInfoRepository.js';
import type { SteamConfigRepository } from '../../../../ports/SteamConfigRepository.js';
import type { DashboardService } from '../../../../app/dashboard/DashboardService.js';
import type { GamesService } from '../../../../app/games/GamesService.js';

type Deps = {
  dashboard: DashboardService;
  games: GamesService;
  gameRepo: GameRepository;
  systemInfo: SystemInfoRepository;
  steamConfig: SteamConfigRepository;
};

type GamesQuery = { tier?: string; search?: string; installed?: string };

export function dashboardRoutes(deps: Deps) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/', async (req, reply) => {
      const dash = deps.dashboard.build();
      const system = deps.systemInfo.get() as { gpu?: { model?: string }; monitors?: { name: string; width: number; height: number; refresh: number }[]; session?: { type: string; desktop: string } } | null;
      const steamConfigured = !!deps.steamConfig.get();
      return reply.view('dashboard.ejs', {
        dash,
        system,
        steamConfigured,
        currentUser: req.currentUser,
      });
    });

    fastify.get<{ Querystring: GamesQuery }>('/games', async (req, reply) => {
      const { tier, search, installed } = req.query;
      const filter: GameListFilter = { tier, search, installed: installed === '1' ? true : installed === '0' ? false : undefined };
      const games = deps.games.list(filter);
      const stats = deps.gameRepo.stats();
      const lastSync = deps.dashboard.build().lastSync;
      const system = deps.systemInfo.get() as { gpu?: { model?: string }; monitors?: { name: string; width: number; height: number; refresh: number }[]; session?: { type: string; desktop: string } } | null;
      return reply.view('games.ejs', {
        games,
        stats: { ...stats, lastSync },
        system,
        filters: { tier: tier ?? '', search: search ?? '', installed: installed ?? '' },
        empty: games.length === 0,
        currentUser: req.currentUser,
      });
    });
  };
}
