import type { FastifyInstance } from 'fastify';
import { listOverrides, buildImportPlan, applyImport, type ImportPlanEntry } from '../db.js';

const FORMAT = 'protondeck-config-export';
const VERSION = 1;

type ExportPayload = {
  format: typeof FORMAT;
  version: number;
  exported_at: string;
  exported_by: string | null;
  games: { appid: string; name: string; user_launch_options: string | null; user_notes: string | null }[];
};

type ImportInput = {
  apply?: boolean;
  payload?: ExportPayload;
};

export async function backupRoutes(fastify: FastifyInstance) {
  fastify.get('/backup', async (req, reply) => {
    return reply.view('backup.ejs', { currentUser: req.currentUser });
  });

  fastify.get('/api/backup/export', async (req, reply) => {
    const games = listOverrides();
    const payload: ExportPayload = {
      format: FORMAT,
      version: VERSION,
      exported_at: new Date().toISOString(),
      exported_by: req.currentUser?.username ?? null,
      games: games.map(g => ({
        appid: g.appid,
        name: g.name,
        user_launch_options: g.user_launch_options,
        user_notes: g.user_notes,
      })),
    };
    const filename = `protondeck-overrides-${new Date().toISOString().slice(0, 10)}.json`;
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(payload);
  });

  fastify.post<{ Body: ImportInput }>('/api/backup/import', async (req, reply) => {
    const payload = req.body?.payload;
    if (!payload || typeof payload !== 'object') {
      return reply.code(400).send({ error: 'payload obrigatório' });
    }
    if (payload.format !== FORMAT) {
      return reply.code(400).send({ error: `formato inválido: esperado "${FORMAT}", recebido "${payload.format}"` });
    }
    if (!Array.isArray(payload.games)) {
      return reply.code(400).send({ error: '"games" deve ser array' });
    }
    const entries = (payload.games as Array<{ appid?: unknown; user_launch_options?: string | null; user_notes?: string | null }>)
      .filter(g => !!g && typeof g.appid === 'string')
      .map(g => ({
        appid: String(g.appid),
        user_launch_options: g.user_launch_options ?? null,
        user_notes: g.user_notes ?? null,
      }));

    const plan = buildImportPlan(entries);

    if (req.body?.apply === true) {
      const result = applyImport(plan as ImportPlanEntry[]);
      return reply.send({ phase: 'applied', ...result, plan });
    }

    const inLib = plan.filter(p => p.inLibrary).length;
    return reply.send({
      phase: 'preview',
      summary: {
        total: plan.length,
        inLibrary: inLib,
        notInLibrary: plan.length - inLib,
      },
      plan,
    });
  });
}
