import type { FastifyInstance } from 'fastify';
import { searchSteam, fetchCheck } from '../check.js';

export async function checkRoutes(fastify: FastifyInstance) {
  fastify.get('/check', async (req, reply) => {
    return reply.view('check.ejs', { currentUser: req.currentUser });
  });

  fastify.get<{ Querystring: { q?: string } }>('/api/check/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim();
    if (q.length < 2) return reply.send({ results: [] });
    try {
      const results = await searchSteam(q);
      return reply.send({ results });
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  fastify.get<{ Params: { appid: string } }>('/api/check/:appid', async (req, reply) => {
    const appid = req.params.appid;
    if (!/^\d+$/.test(appid)) return reply.code(400).send({ error: 'appid inválido' });
    try {
      const data = await fetchCheck(appid);
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
  });
}
