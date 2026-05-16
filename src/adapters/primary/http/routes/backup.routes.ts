import type { FastifyInstance } from 'fastify';
import type { BackupService } from '../../../../app/backup/BackupService.js';

type Deps = { backup: BackupService };

type ImportInput = { apply?: boolean; payload?: unknown };

export function backupRoutes(deps: Deps) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/backup', async (req, reply) => {
      return reply.view('backup.ejs', { currentUser: req.currentUser });
    });

    fastify.get('/api/backup/export', async (req, reply) => {
      const payload = deps.backup.buildExport(req.currentUser?.username ?? null);
      const filename = `protondeck-overrides-${new Date().toISOString().slice(0, 10)}.json`;
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(payload);
    });

    fastify.post<{ Body: ImportInput }>('/api/backup/import', async (req, reply) => {
      const validation = deps.backup.validatePayload(req.body?.payload);
      if (!validation.ok) return reply.code(400).send({ error: validation.error });
      const plan = deps.backup.buildPlan(validation.entries);
      if (req.body?.apply === true) {
        const result = deps.backup.apply(plan);
        return reply.send({ phase: 'applied', ...result, plan });
      }
      const inLib = plan.filter(p => p.inLibrary).length;
      return reply.send({
        phase: 'preview',
        summary: { total: plan.length, inLibrary: inLib, notInLibrary: plan.length - inLib },
        plan,
      });
    });
  };
}
