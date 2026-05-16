import { createHash } from 'node:crypto';
import type { AIConfigRepository, AICacheRepository } from '../../ports/AIConfigRepository.js';
import type { GameRepository } from '../../ports/GameRepository.js';
import type { SystemInfoRepository } from '../../ports/SystemInfoRepository.js';
import type { ProtonLogReader } from '../../ports/ProtonLogReader.js';
import type { ProtonDBCommunityClient } from '../../ports/ProtonDBCommunityClient.js';
import {
  runAgent, extractJSON, PROVIDER_MODELS, DEFAULT_BASE_URLS,
  type AIProvider, type AICallConfig,
} from '../../adapters/secondary/ai/AIProvider.js';
import {
  buildDiagnosePrompt, buildSuggestPrompt, buildTroubleshootPrompt,
  type GameContext, type SystemContext, type CurrentScreenState,
} from '../../adapters/secondary/ai/Prompts.js';
import { TOOL_DEFS } from '../../adapters/secondary/ai/Tools.js';

const CACHE_TTL = 24 * 60 * 60 * 1000;

export { PROVIDER_MODELS, DEFAULT_BASE_URLS };
export type { CurrentScreenState };

export class AIService {
  constructor(
    private readonly aiConfig: AIConfigRepository,
    private readonly aiCache: AICacheRepository,
    private readonly games: GameRepository,
    private readonly systemInfo: SystemInfoRepository,
    private readonly protonLog: ProtonLogReader,
    private readonly protonDb: ProtonDBCommunityClient,
  ) {}

  getConfig() { return this.aiConfig.get(); }
  setConfig(cfg: { provider: string; model: string; api_key: string | null; base_url: string | null }) {
    this.aiConfig.set(cfg);
  }

  private cacheKey(appid: string, kind: string, provider: string, model: string, ctx: string): string {
    const h = createHash('sha256').update(`${kind}|${provider}|${model}|${appid}|${ctx}`).digest('hex').slice(0, 16);
    return `${kind}:${appid}:${h}`;
  }

  private summarizeSystem(raw: unknown): SystemContext {
    if (!raw || typeof raw !== 'object') return {};
    const r = raw as Record<string, unknown>;
    const gpu = r.gpu as Record<string, unknown> | undefined;
    return {
      gpu:    typeof gpu?.name === 'string' ? gpu.name : undefined,
      driver: typeof gpu?.driver === 'string' ? gpu.driver : undefined,
      os:     typeof r.os === 'string' ? r.os : undefined,
    };
  }

  private getConfigOrThrow(): AICallConfig {
    const row = this.aiConfig.get();
    if (!row) throw new Error('AI não configurada — abra /settings/ai e selecione provider/modelo.');
    return {
      provider: row.provider as AIProvider,
      model:    row.model,
      apiKey:   row.api_key,
      baseUrl:  row.base_url,
    };
  }

  private gameContextOf(appid: string): GameContext {
    const game = this.games.get(appid);
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

  readProtonLog(appid: string) {
    return this.protonLog.read(appid);
  }

  async diagnose(appid: string) {
    const cfg = this.getConfigOrThrow();
    const game = this.games.get(appid);
    if (!game) throw new Error('jogo não encontrado');
    const system = this.summarizeSystem(this.systemInfo.get());
    const gctx = this.gameContextOf(appid);

    const ctxHash = JSON.stringify({
      userLaunch: game.user_launch_options,
      curated:    game.launch_options,
      engine:     game.engine,
    });
    const key = this.cacheKey(appid, 'diagnose', cfg.provider, cfg.model, ctxHash);
    const cached = this.aiCache.get(key, CACHE_TTL);
    if (cached) return { cached: true, ...JSON.parse(cached) };

    const { systemBlocks, userMessage } = buildDiagnosePrompt(gctx, system);
    const result = await runAgent(cfg, {
      systemBlocks,
      userMessage,
      tools: TOOL_DEFS,
      toolCtx: { appid, protonLog: this.protonLog, protonDb: this.protonDb },
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
    this.aiCache.set(key, JSON.stringify(parsed));
    return payload;
  }

  async suggest(appid: string) {
    const cfg = this.getConfigOrThrow();
    const game = this.games.get(appid);
    if (!game) throw new Error('jogo não encontrado');
    const system = this.summarizeSystem(this.systemInfo.get());
    const gctx = this.gameContextOf(appid);

    const ctxHash = JSON.stringify({ engine: game.engine, tier: game.tier, proton: game.proton, gpu: system.gpu });
    const key = this.cacheKey(appid, 'suggest', cfg.provider, cfg.model, ctxHash);
    const cached = this.aiCache.get(key, CACHE_TTL);
    if (cached) return { cached: true, ...JSON.parse(cached) };

    const { systemBlocks, userMessage } = buildSuggestPrompt(gctx, system);
    const result = await runAgent(cfg, {
      systemBlocks,
      userMessage,
      tools: TOOL_DEFS,
      toolCtx: { appid, protonLog: this.protonLog, protonDb: this.protonDb },
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
    this.aiCache.set(key, JSON.stringify(parsed));
    return payload;
  }

  async troubleshoot(appid: string, problem: string, state: CurrentScreenState) {
    const cfg = this.getConfigOrThrow();
    const game = this.games.get(appid);
    if (!game) throw new Error('jogo não encontrado');
    const system = this.summarizeSystem(this.systemInfo.get());
    const gctx = this.gameContextOf(appid);

    const { systemBlocks, userMessage } = buildTroubleshootPrompt(problem, gctx, system, state);
    const result = await runAgent(cfg, {
      systemBlocks,
      userMessage,
      tools: TOOL_DEFS,
      toolCtx: { appid, protonLog: this.protonLog, protonDb: this.protonDb },
      maxTokens: 2000,
      requireJSON: true,
    });
    const parsed = extractJSON(result.finalText) as Record<string, unknown>;
    return {
      cached: false,
      ...parsed,
      agent: {
        iterations: result.iterations,
        tool_calls: result.toolCalls.map(t => ({ name: t.name, input: t.input })),
        usage: result.usage,
      },
      model_used: `${cfg.provider}/${cfg.model}`,
    };
  }
}
