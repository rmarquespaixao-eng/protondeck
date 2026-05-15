import Fastify from 'fastify';
import fastifyView from '@fastify/view';
import fastifyStatic from '@fastify/static';
import fastifyFormbody from '@fastify/formbody';
import fastifySecureSession from '@fastify/secure-session';
import ejs from 'ejs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRoutes } from './routes/index.js';
import { gameRoutes } from './routes/game.js';
import { configRoutes } from './routes/config.js';
import { aiRoutes } from './routes/ai.js';
import { steamRoutes } from './routes/steam.js';
import { authRoutes } from './routes/auth.js';
import { countUsers } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sessionKeyHex = process.env.SESSION_KEY;
if (!sessionKeyHex || !/^[0-9a-fA-F]{64}$/.test(sessionKeyHex)) {
  console.error('SESSION_KEY env var é obrigatória (64 hex chars = 32 bytes).');
  console.error('Gere com: openssl rand -hex 32');
  process.exit(1);
}
const sessionKey = Buffer.from(sessionKeyHex, 'hex');

const fastify = Fastify({ logger: { level: 'info' } });

await fastify.register(fastifyFormbody);
await fastify.register(fastifySecureSession, {
  key: sessionKey,
  cookieName: 'protondeck_session',
  cookie: {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30 // 30 dias
  }
});
await fastify.register(fastifyStatic, {
  root: join(__dirname, 'public'),
  prefix: '/public/'
});
await fastify.register(fastifyView, {
  engine: { ejs },
  root: join(__dirname, 'views'),
  defaultContext: {},
  options: {
    async: false
  }
});

const PUBLIC_PATHS = new Set<string>(['/login', '/setup']);

fastify.decorateRequest('currentUser', null);

fastify.addHook('preHandler', async (req, reply) => {
  const path = req.url.split('?')[0] ?? req.url;
  if (path.startsWith('/public/')) return;
  if (PUBLIC_PATHS.has(path)) return;

  const userId = req.session.get('userId');
  if (!userId) {
    if (countUsers() === 0) return reply.redirect('/setup');
    return reply.redirect('/login');
  }
  req.currentUser = {
    id: userId,
    username: req.session.get('username') ?? ''
  };
});

await fastify.register(authRoutes);
await fastify.register(indexRoutes);
await fastify.register(gameRoutes);
await fastify.register(configRoutes);
await fastify.register(aiRoutes);
await fastify.register(steamRoutes);

const port = Number(process.env.PORT ?? 3030);
const host = process.env.HOST ?? '127.0.0.1';

fastify.listen({ port, host }).then(addr => {
  fastify.log.info(`ProtonDeck rodando em ${addr}`);
}).catch(err => {
  fastify.log.error(err);
  process.exit(1);
});
