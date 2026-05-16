import type { FastifyInstance } from 'fastify';
import type { SystemService } from '../../../../application/services/SystemService.js';

type Deps = { system: SystemService };

export function systemRoutes(deps: Deps) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/system', async (req, reply) => {
      return reply.view('system.ejs', { currentUser: req.currentUser });
    });

    fastify.get('/api/system/scan', async (_req, reply) => {
      const data = await deps.system.groupStatuses();
      return reply.send(data);
    });

    fastify.get('/api/system/sudoers', async (_req, reply) => {
      const scan = await deps.system.scan();
      const tpl = deps.system.sudoersTemplate(scan);
      return reply.send({
        user: scan.user,
        family: scan.distro.family,
        content: tpl.content,
        setupCommand: tpl.setupCommand,
        sudoersInstalled: scan.sudoersInstalled,
      });
    });

    fastify.get<{ Params: { groupId: string } }>('/api/system/install/:groupId/stream', async (req, reply) => {
      const scan = await deps.system.scan();
      const group = deps.system.getGroup(scan, req.params.groupId);

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');
      reply.raw.flushHeaders?.();

      const send = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      if (!group) {
        send('error', { message: `grupo "${req.params.groupId}" nao existe pra distro "${scan.distro.family}"` });
        send('done', { ok: false });
        reply.raw.end();
        return;
      }

      if (!scan.sudoersInstalled) {
        send('error', { message: 'sudoers do ProtonDeck nao configurado. Rode o comando de setup primeiro (Setup inicial na tela).' });
        send('done', { ok: false });
        reply.raw.end();
        return;
      }

      const argvList = deps.system.buildInstallArgs(scan, group);
      if (!argvList.length) {
        send('error', { message: 'grupo sem comandos a executar' });
        send('done', { ok: false });
        reply.raw.end();
        return;
      }

      const ac = new AbortController();
      req.raw.on('close', () => ac.abort());

      send('start', { groupId: group.id, label: group.label, commands: argvList.length });

      const result = await deps.system.runSudoSequence(argvList, (ev) => {
        if (ev.type === 'cmd')    send('cmd',    { cmd: ev.cmd });
        if (ev.type === 'stdout') send('stdout', { line: ev.line });
        if (ev.type === 'stderr') send('stderr', { line: ev.line });
        if (ev.type === 'exit')   send('exit',   { code: ev.code, signal: ev.signal });
      }, ac.signal);

      send('done', { ok: result.ok, failedAt: result.failedAt });
      reply.raw.end();
    });
  };
}
