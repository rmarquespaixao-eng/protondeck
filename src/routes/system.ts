import type { FastifyInstance } from 'fastify';
import { detectSystem, arePackagesInstalled } from '../system/detect.js';
import { getRecipe, getRelevantGroups, getGroupById } from '../system/recipes.js';
import { runSudoSequence } from '../system/runner.js';
import { generateSudoersContent, generateSetupCommand } from '../system/sudoers.js';

type GroupStatus = {
  id: string;
  label: string;
  description: string;
  satisfied: boolean;
  packages: { name: string; installed: boolean }[];
  warning?: string;
  hasPreCommands: boolean;
};

export async function systemRoutes(fastify: FastifyInstance) {
  fastify.get('/system', async (req, reply) => {
    return reply.view('system.ejs', { currentUser: req.currentUser });
  });

  fastify.get('/api/system/scan', async (_req, reply) => {
    const scan = await detectSystem();
    const groups = getRelevantGroups(scan.distro.family, scan.gpu.vendor);
    const allPkgs = Array.from(new Set(groups.flatMap(g => g.packages)));
    const pkgStatus = await arePackagesInstalled(scan.distro.packageManager, allPkgs);

    const groupStatuses: GroupStatus[] = groups.map(g => {
      const pkgs = g.packages.map(p => ({ name: p, installed: pkgStatus[p] ?? false }));
      const allPkgsOk = pkgs.length === 0 || pkgs.every(p => p.installed);
      let satisfied = allPkgsOk;
      if (g.satisfiedWhen?.binaries) {
        const binsOk = g.satisfiedWhen.binaries.every(b => scan.binaries[b]);
        satisfied = satisfied || binsOk;
      }
      // Pseudo-grupos preCommand-only (multilib, rpmfusion): satisfaction by scan flag
      if (g.id === 'multilib') satisfied = scan.multilibEnabled;
      const result: GroupStatus = {
        id: g.id,
        label: g.label,
        description: g.description,
        satisfied,
        packages: pkgs,
        hasPreCommands: !!g.preCommands?.length,
      };
      if (g.warning) result.warning = g.warning;
      return result;
    });

    return reply.send({ scan, groups: groupStatuses });
  });

  fastify.get('/api/system/sudoers', async (_req, reply) => {
    const scan = await detectSystem();
    const content = generateSudoersContent(scan.user, scan.distro.family);
    const setupCommand = generateSetupCommand(scan.user, scan.distro.family);
    return reply.send({
      user: scan.user,
      family: scan.distro.family,
      content,
      setupCommand,
      sudoersInstalled: scan.sudoersInstalled,
    });
  });

  fastify.get<{ Params: { groupId: string } }>('/api/system/install/:groupId/stream', async (req, reply) => {
    const scan = await detectSystem();
    const group = getGroupById(scan.distro.family, req.params.groupId);
    const recipe = getRecipe(scan.distro.family);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    if (!group || !recipe) {
      send('error', { message: `grupo "${req.params.groupId}" nao existe pra distro "${scan.distro.family}"` });
      send('done', { ok: false });
      reply.raw.end();
      return;
    }

    // Pre-flight: confere sudoers
    if (!scan.sudoersInstalled) {
      send('error', { message: 'sudoers do ProtonDeck nao configurado. Rode o comando de setup primeiro (Setup inicial na tela).' });
      send('done', { ok: false });
      reply.raw.end();
      return;
    }

    const argvList: string[][] = [];
    if (group.preCommands) argvList.push(...group.preCommands);
    if (group.packages.length) argvList.push(recipe.installCommand(group.packages));

    if (!argvList.length) {
      send('error', { message: 'grupo sem comandos a executar' });
      send('done', { ok: false });
      reply.raw.end();
      return;
    }

    const ac = new AbortController();
    req.raw.on('close', () => ac.abort());

    send('start', { groupId: group.id, label: group.label, commands: argvList.length });

    const result = await runSudoSequence(argvList, (ev) => {
      if (ev.type === 'cmd')    send('cmd',    { cmd: ev.cmd });
      if (ev.type === 'stdout') send('stdout', { line: ev.line });
      if (ev.type === 'stderr') send('stderr', { line: ev.line });
      if (ev.type === 'exit')   send('exit',   { code: ev.code, signal: ev.signal });
    }, ac.signal);

    send('done', { ok: result.ok, failedAt: result.failedAt });
    reply.raw.end();
  });
}
