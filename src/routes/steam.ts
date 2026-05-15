import type { FastifyInstance } from 'fastify';
import { getSteamConfig, setSteamConfig } from '../db.js';

type SteamSettingsBody = {
  steam_api_key?: string;
  steam_id64?: string;
};

export async function steamRoutes(fastify: FastifyInstance) {
  fastify.get('/settings/steam', async (_req, reply) => {
    const cfg = getSteamConfig();
    return reply.view('steam-settings.ejs', { cfg });
  });

  fastify.post<{ Body: SteamSettingsBody }>('/settings/steam', async (req, reply) => {
    const key = (req.body.steam_api_key ?? '').trim();
    const id  = (req.body.steam_id64 ?? '').trim();
    if (!key || !id) return reply.code(400).send('api_key e steam_id64 obrigatórios');
    if (!/^[A-Fa-f0-9]{32}$/.test(key)) return reply.code(400).send('api_key inválida (precisa de 32 hex chars)');
    if (!/^7656119\d{10}$/.test(id))    return reply.code(400).send('steam_id64 inválido');
    setSteamConfig({ api_key: key, steam_id64: id });
    return reply.redirect('/settings/steam');
  });
}
