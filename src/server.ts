import Fastify from 'fastify';
import fastifyView from '@fastify/view';
import fastifyStatic from '@fastify/static';
import fastifyFormbody from '@fastify/formbody';
import ejs from 'ejs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRoutes } from './routes/index.js';
import { gameRoutes } from './routes/game.js';
import { configRoutes } from './routes/config.js';
import { aiRoutes } from './routes/ai.js';
import { steamRoutes } from './routes/steam.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: { level: 'info' } });

await fastify.register(fastifyFormbody);
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

await fastify.register(indexRoutes);
await fastify.register(gameRoutes);
await fastify.register(configRoutes);
await fastify.register(aiRoutes);
await fastify.register(steamRoutes);

const port = Number(process.env.PORT ?? 3030);
const host = process.env.HOST ?? '127.0.0.1';

fastify.listen({ port, host }).then(addr => {
  fastify.log.info(`steam-config-panel rodando em ${addr}`);
}).catch(err => {
  fastify.log.error(err);
  process.exit(1);
});
