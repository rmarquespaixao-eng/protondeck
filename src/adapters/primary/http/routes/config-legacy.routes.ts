import type { FastifyInstance } from 'fastify';

type ConfigParams = { appid: string };

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: ConfigParams }>('/game/:appid/config', async (req, reply) => {
    return reply.code(301).redirect(`/game/${req.params.appid}`);
  });

  fastify.post<{ Params: ConfigParams }>('/game/:appid/config', async (req, reply) => {
    return reply.code(308).redirect(`/game/${req.params.appid}`);
  });
}
