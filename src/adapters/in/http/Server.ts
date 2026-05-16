import Fastify, { type FastifyInstance } from 'fastify';
import fastifyView from '@fastify/view';
import fastifyStatic from '@fastify/static';
import fastifyFormbody from '@fastify/formbody';
import fastifySecureSession from '@fastify/secure-session';
import ejs from 'ejs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Composition } from '../../../composition.js';

import { dashboardRoutes } from './routes/dashboard.routes.js';
import { gameRoutes } from './routes/game.routes.js';
import { configRoutes } from './routes/config-legacy.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { steamCredsRoutes } from './routes/steam-creds.routes.js';
import { checkRoutes } from './routes/check.routes.js';
import { systemRoutes } from './routes/system.routes.js';
import { backupRoutes } from './routes/backup.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ServerOptions = {
  composition: Composition;
  sessionKey: Buffer;
  isProduction: boolean;
};

const PUBLIC_PATHS = new Set<string>(['/login', '/setup']);

export async function buildServer(opts: ServerOptions): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: { level: 'info' } });

  await fastify.register(fastifyFormbody);
  await fastify.register(fastifySecureSession, {
    key: opts.sessionKey,
    cookieName: 'protondeck_session',
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.isProduction,
      maxAge: 60 * 60 * 24 * 30,
    },
  });
  await fastify.register(fastifyStatic, {
    root: join(__dirname, 'public'),
    prefix: '/public/',
  });
  await fastify.register(fastifyView, {
    engine: { ejs },
    root: join(__dirname, 'views'),
    defaultContext: {},
    options: { async: false },
  });

  fastify.decorateRequest('currentUser', null);

  fastify.addHook('preHandler', async (req, reply) => {
    const path = req.url.split('?')[0] ?? req.url;
    if (path.startsWith('/public/')) return;
    if (PUBLIC_PATHS.has(path)) return;

    const userId = req.session.get('userId');
    if (!userId) {
      if (!opts.composition.services.auth.hasAdmin()) return reply.redirect('/setup');
      return reply.redirect('/login');
    }
    req.currentUser = {
      id: userId,
      username: req.session.get('username') ?? '',
    };
  });

  const s = opts.composition.services;
  const r = opts.composition.repos;
  const c = opts.composition.clients;

  await fastify.register(authRoutes({ auth: s.auth }));
  await fastify.register(dashboardRoutes({
    dashboard: s.dashboard,
    games: s.games,
    gameRepo: r.gameRepo,
    systemInfo: r.systemInfoRepo,
    steamConfig: r.steamConfigRepo,
  }));
  await fastify.register(gameRoutes({
    games: s.games,
    pcgw: s.pcgw,
    sync: s.sync,
    steamApply: s.steamApply,
    protonDbCommunity: c.protonDbComm,
    systemInfo: r.systemInfoRepo,
  }));
  await fastify.register(configRoutes);
  await fastify.register(aiRoutes({ ai: s.ai }));
  await fastify.register(steamCredsRoutes({ steamConfig: r.steamConfigRepo }));
  await fastify.register(checkRoutes({ check: s.check }));
  await fastify.register(systemRoutes({ system: s.system }));
  await fastify.register(backupRoutes({ backup: s.backup }));

  return fastify;
}
