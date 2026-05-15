import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import {
  getAIConfig, setAIConfig, getAICache, setAICache,
  getGame, getSystemInfo,
} from '../db.js';
import {
  runAgent, extractJSON, PROVIDER_MODELS, DEFAULT_BASE_URLS,
  type AIProvider, type AICallConfig,
} from '../ai-provider.js';
import {
  buildDiagnosePrompt, buildSuggestPrompt, buildTroubleshootPrompt,
  type GameContext, type SystemContext, type CurrentScreenState,
} from '../ai-prompts.js';
import { TOOL_DEFS } from '../ai-tools.js';
import { readProtonLog } from '../proton-log.js';

type SettingsBody = {
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
};

type TroubleshootBody = {
  problem: string;
  current_state: CurrentScreenState;
};

const CACHE_TTL = 24 * 60 * 60 * 1000;

function cacheKey(appid: string, kind: string, provider: string, model: string, ctx: string): string {
  const h = createHash('sha256').update(`${kind}|${provider}|${model}|${appid}|${ctx}`).digest('hex').slice(0, 16);
  return `${kind}:${appid}:${h}`;
}

function summarizeSystem(raw: unknown): SystemContext {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const gpu = r.gpu as Record<string, unknown> | undefined;
  return {
    gpu:    typeof gpu?.name === 'string' ? gpu.name : undefined,
    driver: typeof gpu?.driver === 'string' ? gpu.driver : undefined,
    os:     typeof r.os === 'string' ? r.os : undefined,
  };
}

function getConfigOrThrow(): AICallConfig {
  const row = getAIConfig();
  if (!row) throw new Error('AI não configurada — abra /settings/ai e selecione provider/modelo.');
  return {
    provider: row.provider as AIProvider,
    model:    row.model,
    apiKey:   row.api_key,
    baseUrl:  row.base_url,
  };
}

function gameContextOf(game: ReturnType<typeof getGame>): GameContext {
  if (!game) throw new Error('jogo não encontrado');
  return {
    appid: game.appid,
    name:  game.name,
    engine: game.engine,
    protonVersion: game.proton,
    tier: game.tier,
    curatedLaunch: game.launch_options,
    userLaunch: game.user_launch_options,
    notes: game.notes_json ? (JSON.parse(game.notes_json) as string[]) : [],
  };
}

export async function aiRoutes(fastify: FastifyInstance) {

  // ───── settings ─────
  fastify.get('/settings/ai', async (req, reply) => {
    const cfg = getAIConfig();
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
    setAIConfig({
      provider,
      model,
      api_key: api_key?.trim() || null,
      base_url: base_url?.trim() || null,
    });
    return reply.redirect('/settings/ai');
  });

  // ───── proton log status (auto-fetch) ─────
  fastify.get<{ Params: { appid: string } }>('/api/game/:appid/proton-log', async (req, reply) => {
    const r = readProtonLog(req.params.appid);
    if (!r.found) {
      return reply.send({
        found: false,
        reason: r.reason,
        path: r.checked_path,
        hint: 'Adicione PROTON_LOG=1 na launch options, rode o jogo uma vez e tente de novo.',
      });
    }
    return reply.send({
      found: true,
      path: r.path,
      size: r.size,
      mtime: r.mtime,
      lines: r.lines,
      truncated: r.truncated,
      excerpt_bytes: Buffer.byteLength(r.excerpt, 'utf8'),
    });
  });

  // ───── diagnose ─────
  fastify.post<{ Params: { appid: string } }>('/api/game/:appid/diagnose', async (req, reply) => {
    try {
      const cfg = getConfigOrThrow();
      const game = getGame(req.params.appid);
      if (!game) return reply.code(404).send({ error: 'jogo não encontrado' });

      const system = summarizeSystem(getSystemInfo());
      const gctx = gameContextOf(game);

      const ctxHash = JSON.stringify({
        userLaunch: game.user_launch_options,
        curated:    game.launch_options,
        engine:     game.engine,
      });
      const key = cacheKey(req.params.appid, 'diagnose', cfg.provider, cfg.model, ctxHash);
      const cached = getAICache(key, CACHE_TTL);
      if (cached) return reply.send({ cached: true, ...JSON.parse(cached) });

      const { systemBlocks, userMessage } = buildDiagnosePrompt(gctx, system);
      const result = await runAgent(cfg, {
        systemBlocks,
        userMessage,
        tools: TOOL_DEFS,
        toolCtx: { appid: req.params.appid },
        maxTokens: 2000,
        requireJSON: true,
      });

      const parsed = extractJSON(result.finalText) as Record<string, unknown>;
      const payload = {
        cached: false,
        ...parsed,
        agent: {
          iterations: result.iterations,
          tool_calls: result.toolCalls.map(t => ({ name: t.name, input: t.input })),
          usage: result.usage,
        },
        model_used: `${cfg.provider}/${cfg.model}`,
      };

      setAICache(key, JSON.stringify(parsed));
      return reply.send(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err }, 'diagnose failed');
      return reply.code(500).send({ error: msg });
    }
  });

  // ───── troubleshoot ─────
  fastify.post<{ Params: { appid: string }; Body: TroubleshootBody }>('/api/game/:appid/troubleshoot', async (req, reply) => {
    try {
      const cfg = getConfigOrThrow();
      const game = getGame(req.params.appid);
      if (!game) return reply.code(404).send({ error: 'jogo não encontrado' });

      const problem = (req.body?.problem || '').trim();
      if (problem.length < 5) return reply.code(400).send({ error: 'descreva o problema (mínimo 5 caracteres)' });
      const state = req.body.current_state;
      if (!state) return reply.code(400).send({ error: 'current_state ausente' });

      const system = summarizeSystem(getSystemInfo());
      const gctx = gameContextOf(game);

      const { systemBlocks, userMessage } = buildTroubleshootPrompt(problem, gctx, system, state);
      const result = await runAgent(cfg, {
        systemBlocks,
        userMessage,
        tools: TOOL_DEFS,
        toolCtx: { appid: req.params.appid },
        maxTokens: 2000,
        requireJSON: true,
      });

      const parsed = extractJSON(result.finalText) as Record<string, unknown>;
      return reply.send({
        cached: false,
        ...parsed,
        agent: {
          iterations: result.iterations,
          tool_calls: result.toolCalls.map(t => ({ name: t.name, input: t.input })),
          usage: result.usage,
        },
        model_used: `${cfg.provider}/${cfg.model}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err }, 'troubleshoot failed');
      return reply.code(500).send({ error: msg });
    }
  });

  // ───── suggest ─────
  fastify.post<{ Params: { appid: string } }>('/api/game/:appid/suggest', async (req, reply) => {
    try {
      const cfg = getConfigOrThrow();
      const game = getGame(req.params.appid);
      if (!game) return reply.code(404).send({ error: 'jogo não encontrado' });

      const system = summarizeSystem(getSystemInfo());
      const gctx = gameContextOf(game);

      const ctxHash = JSON.stringify({ engine: game.engine, tier: game.tier, proton: game.proton, gpu: system.gpu });
      const key = cacheKey(req.params.appid, 'suggest', cfg.provider, cfg.model, ctxHash);
      const cached = getAICache(key, CACHE_TTL);
      if (cached) return reply.send({ cached: true, ...JSON.parse(cached) });

      const { systemBlocks, userMessage } = buildSuggestPrompt(gctx, system);
      const result = await runAgent(cfg, {
        systemBlocks,
        userMessage,
        tools: TOOL_DEFS,
        toolCtx: { appid: req.params.appid },
        maxTokens: 1500,
        requireJSON: true,
      });

      const parsed = extractJSON(result.finalText) as Record<string, unknown>;
      const payload = {
        cached: false,
        ...parsed,
        agent: {
          iterations: result.iterations,
          tool_calls: result.toolCalls.map(t => ({ name: t.name, input: t.input })),
          usage: result.usage,
        },
        model_used: `${cfg.provider}/${cfg.model}`,
      };

      setAICache(key, JSON.stringify(parsed));
      return reply.send(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err }, 'suggest failed');
      return reply.code(500).send({ error: msg });
    }
  });
}
