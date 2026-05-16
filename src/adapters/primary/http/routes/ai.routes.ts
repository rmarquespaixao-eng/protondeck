import type { FastifyInstance } from 'fastify';
import type { AIService, CurrentScreenState } from '../../../../app/ai/AIService.js';
import { PROVIDER_MODELS, DEFAULT_BASE_URLS } from '../../../../app/ai/AIService.js';

type Deps = { ai: AIService };

type SettingsBody = { provider?: string; model?: string; api_key?: string; base_url?: string };
type TroubleshootBody = { problem: string; current_state: CurrentScreenState };

export function aiRoutes(deps: Deps) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/settings/ai', async (req, reply) => {
      const cfg = deps.ai.getConfig();
      return reply.view('ai-settings.ejs', {
        cfg,
        providerModels: PROVIDER_MODELS,
        defaultBaseUrls: DEFAULT_BASE_URLS,
        currentUser: req.currentUser,
      });
    });

    fastify.post<{ Body: SettingsBody }>('/settings/ai', async (req, reply) => {
      const { provider, model, api_key, base_url } = req.body;
      if (!provider || !model) return reply.code(400).send('provider e model obrigatórios');
      if (!['anthropic', 'openai', 'ollama'].includes(provider)) return reply.code(400).send('provider inválido');
      deps.ai.setConfig({ provider, model, api_key: api_key?.trim() || null, base_url: base_url?.trim() || null });
      return reply.redirect('/settings/ai');
    });

    fastify.get<{ Params: { appid: string } }>('/api/game/:appid/proton-log', async (req, reply) => {
      const r = deps.ai.readProtonLog(req.params.appid);
      if (!r.found) {
        return reply.send({
          found: false, reason: r.reason, path: r.checked_path,
          hint: 'Adicione PROTON_LOG=1 na launch options, rode o jogo uma vez e tente de novo.',
        });
      }
      return reply.send({
        found: true, path: r.path, size: r.size, mtime: r.mtime, lines: r.lines, truncated: r.truncated,
        excerpt_bytes: Buffer.byteLength(r.excerpt, 'utf8'),
      });
    });

    fastify.post<{ Params: { appid: string } }>('/api/game/:appid/diagnose', async (req, reply) => {
      try {
        const data = await deps.ai.diagnose(req.params.appid);
        return reply.send(data);
      } catch (err) {
        fastify.log.error({ err }, 'diagnose failed');
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    fastify.post<{ Params: { appid: string }; Body: TroubleshootBody }>('/api/game/:appid/troubleshoot', async (req, reply) => {
      try {
        const problem = (req.body?.problem || '').trim();
        if (problem.length < 5) return reply.code(400).send({ error: 'descreva o problema (mínimo 5 caracteres)' });
        if (!req.body.current_state) return reply.code(400).send({ error: 'current_state ausente' });
        const data = await deps.ai.troubleshoot(req.params.appid, problem, req.body.current_state);
        return reply.send(data);
      } catch (err) {
        fastify.log.error({ err }, 'troubleshoot failed');
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    fastify.post<{ Params: { appid: string } }>('/api/game/:appid/suggest', async (req, reply) => {
      try {
        const data = await deps.ai.suggest(req.params.appid);
        return reply.send(data);
      } catch (err) {
        fastify.log.error({ err }, 'suggest failed');
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    });
  };
}
