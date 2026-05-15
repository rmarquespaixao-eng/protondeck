// Provider de IA — usa SDKs oficiais com prompt caching + tool use.
// Anthropic: cache_control ephemeral em system blocks (economia ~90% no SYSTEM).
// OpenAI:    prompt caching automático em prompts > 1024 tokens.
// Ollama:    fetch direto (sem tool use — fica fora do agent loop).

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ToolDef, ToolCallContext, ToolResult } from './ai-tools.js';
import { runTool } from './ai-tools.js';

export type AIProvider = 'anthropic' | 'openai' | 'ollama';

export type AICallConfig = {
  provider: AIProvider;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
};

// Bloco de system com flag opcional de cache (relevante só pra Anthropic).
export type SystemBlock = { text: string; cache?: boolean };

export type AgentRunOpts = {
  systemBlocks: SystemBlock[];   // partes estáveis (catalog/rules) podem vir com cache:true
  userMessage: string;            // contexto variável do pedido
  tools?: ToolDef[];              // tools disponíveis (vazio = sem tool use)
  toolCtx?: ToolCallContext;      // contexto pra handlers (ex: appid)
  maxTokens?: number;
  temperature?: number;
  maxIterations?: number;         // limite do agent loop
  requireJSON?: boolean;          // se true, faz um retry corretivo caso a saída final não seja JSON parseável
};

const JSON_RETRY_NUDGE =
  'Sua resposta anterior não foi JSON parseável. Responda AGORA apenas com o objeto JSON do output_schema, ' +
  'sem markdown, sem texto antes ou depois, sem prefixos como "Aqui está:" — apenas a chave { de abertura até a } de fechamento.';

function isJSONParseable(text: string): boolean {
  try { extractJSON(text); return true; } catch { return false; }
}

export type AgentRunResult = {
  finalText: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown>; output: ToolResult }>;
  iterations: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

export const PROVIDER_MODELS: Record<AIProvider, Array<{ id: string; label: string; note?: string }>> = {
  anthropic: [
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', note: 'Recomendado — capacidade/preço, suporta cache + tools' },
    { id: 'claude-opus-4-7',           label: 'Claude Opus 4.7',   note: 'Mais capaz, mais caro' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  note: 'Rápido e barato' },
  ],
  openai: [
    { id: 'gpt-4o',      label: 'GPT-4o',      note: 'Cache automático, suporta tools' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'Rápido e barato' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'o1',          label: 'o1',          note: 'Reasoning profundo (sem tools)' },
    { id: 'o1-mini',     label: 'o1-mini',     note: 'Reasoning rápido' },
  ],
  ollama: [
    { id: 'qwen2.5-coder:7b',  label: 'Qwen2.5 Coder 7B',  note: 'Bom em tasks técnicas, leve' },
    { id: 'qwen2.5-coder:32b', label: 'Qwen2.5 Coder 32B', note: 'Maior, mais capaz' },
    { id: 'llama3.1:8b',       label: 'Llama 3.1 8B',      note: 'Generalista rápido' },
    { id: 'llama3.1:70b',      label: 'Llama 3.1 70B',     note: 'Generalista grande' },
    { id: 'mistral-nemo:12b',  label: 'Mistral Nemo 12B',  note: 'Bom em PT-BR' },
    { id: 'deepseek-r1:14b',   label: 'DeepSeek R1 14B',   note: 'Reasoning local' },
    { id: 'phi3:14b',          label: 'Phi-3 Medium 14B',  note: 'Pequeno e capaz' },
  ],
};

export const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  anthropic: 'https://api.anthropic.com',
  openai:    'https://api.openai.com/v1',
  ollama:    'http://localhost:11434',
};

const MAX_ITER_DEFAULT = 6;
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.2;

// ────────────────────────────────────────────────────
//  Agent runner — escolhe implementação por provider
// ────────────────────────────────────────────────────

export async function runAgent(cfg: AICallConfig, opts: AgentRunOpts): Promise<AgentRunResult> {
  if (cfg.provider === 'anthropic') return runAnthropicAgent(cfg, opts);
  if (cfg.provider === 'openai')    return runOpenAIAgent(cfg, opts);
  if (cfg.provider === 'ollama')    return runOllamaSimple(cfg, opts);
  throw new Error(`provider desconhecido: ${cfg.provider}`);
}

// ────────────────────────────────────────────────────
//  Anthropic — cache_control + tool use nativo
// ────────────────────────────────────────────────────

async function runAnthropicAgent(cfg: AICallConfig, opts: AgentRunOpts): Promise<AgentRunResult> {
  if (!cfg.apiKey) throw new Error('Anthropic API key ausente — configure em /settings/ai');

  const client = new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl?.trim() || DEFAULT_BASE_URLS.anthropic,
  });

  // System como array de blocks, marcando blocos estáveis com cache_control
  const systemBlocks = opts.systemBlocks.map(b => {
    const block: Anthropic.Messages.TextBlockParam = { type: 'text', text: b.text };
    if (b.cache) (block as Anthropic.Messages.TextBlockParam & { cache_control?: { type: 'ephemeral' } }).cache_control = { type: 'ephemeral' };
    return block;
  });

  const tools: Anthropic.Messages.Tool[] = (opts.tools ?? []).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
  }));

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: opts.userMessage },
  ];

  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  const toolCallsRecord: AgentRunResult['toolCalls'] = [];
  const maxIter = opts.maxIterations ?? MAX_ITER_DEFAULT;
  let jsonRetriedOnce = false;

  for (let iter = 0; iter < maxIter; iter++) {
    const res = await client.messages.create({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      system: systemBlocks,
      messages,
      ...(tools.length ? { tools } : {}),
    });

    usage.input_tokens  += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    usage.cache_creation_input_tokens += (res.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens     += (res.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;

    // Salva o turn do assistant pra próxima iteração
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason === 'tool_use') {
      const toolUseBlocks = res.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use');
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const tb of toolUseBlocks) {
        const output = await runTool(tb.name, tb.input as Record<string, unknown>, opts.toolCtx ?? { appid: '' });
        toolCallsRecord.push({ name: tb.name, input: tb.input as Record<string, unknown>, output });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tb.id,
          content: JSON.stringify(output),
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // stop_reason = end_turn | max_tokens | stop_sequence → resposta final
    const finalText = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    if (opts.requireJSON && !isJSONParseable(finalText) && !jsonRetriedOnce) {
      jsonRetriedOnce = true;
      messages.push({ role: 'user', content: JSON_RETRY_NUDGE });
      continue;
    }

    return { finalText, toolCalls: toolCallsRecord, iterations: iter + 1, usage };
  }

  throw new Error(`agent loop atingiu o limite (${maxIter} iterações) sem resposta final`);
}

// ────────────────────────────────────────────────────
//  OpenAI — Chat Completions com tools + cache automático
// ────────────────────────────────────────────────────

async function runOpenAIAgent(cfg: AICallConfig, opts: AgentRunOpts): Promise<AgentRunResult> {
  if (!cfg.apiKey) throw new Error('OpenAI API key ausente — configure em /settings/ai');

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl?.trim() || DEFAULT_BASE_URLS.openai,
  });

  // OpenAI faz cache automático em prompts > 1024 tokens; basta colocar a parte
  // estável (catalog/rules) no início do system pra maximizar hit rate.
  const systemContent = opts.systemBlocks.map(b => b.text).join('\n\n');

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = (opts.tools ?? []).map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    { role: 'user', content: opts.userMessage },
  ];

  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  const toolCallsRecord: AgentRunResult['toolCalls'] = [];
  const maxIter = opts.maxIterations ?? MAX_ITER_DEFAULT;
  let jsonRetriedOnce = false;

  for (let iter = 0; iter < maxIter; iter++) {
    const res = await client.chat.completions.create({
      model: cfg.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      messages,
      ...(tools.length ? { tools, tool_choice: 'auto' as const } : {}),
      ...(opts.requireJSON ? { response_format: { type: 'json_object' as const } } : {}),
    });

    if (res.usage) {
      usage.input_tokens  += res.usage.prompt_tokens;
      usage.output_tokens += res.usage.completion_tokens;
      const det = res.usage.prompt_tokens_details as { cached_tokens?: number } | undefined;
      usage.cache_read_input_tokens += det?.cached_tokens ?? 0;
    }

    const choice = res.choices[0];
    if (!choice) throw new Error('OpenAI: resposta sem choices');
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // OpenAI exige que o assistant message seja anexado E cada tool_call respondido
      messages.push({
        role: 'assistant',
        content: msg.content ?? '',
        tool_calls: msg.tool_calls,
      });
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue;
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(tc.function.arguments); } catch { parsed = {}; }
        const output = await runTool(tc.function.name, parsed, opts.toolCtx ?? { appid: '' });
        toolCallsRecord.push({ name: tc.function.name, input: parsed, output });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(output),
        });
      }
      continue;
    }

    const finalText = msg.content ?? '';

    if (opts.requireJSON && !isJSONParseable(finalText) && !jsonRetriedOnce) {
      jsonRetriedOnce = true;
      messages.push({ role: 'assistant', content: finalText });
      messages.push({ role: 'user', content: JSON_RETRY_NUDGE });
      continue;
    }

    return {
      finalText,
      toolCalls: toolCallsRecord,
      iterations: iter + 1,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
      },
    };
  }

  throw new Error(`agent loop atingiu o limite (${maxIter} iterações) sem resposta final`);
}

// ────────────────────────────────────────────────────
//  Ollama — sem tool use, single-shot
// ────────────────────────────────────────────────────

async function runOllamaSimple(cfg: AICallConfig, opts: AgentRunOpts): Promise<AgentRunResult> {
  const baseUrl = cfg.baseUrl?.trim() || DEFAULT_BASE_URLS.ollama;
  const systemContent = opts.systemBlocks.map(b => b.text).join('\n\n');

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: opts.userMessage },
      ],
      stream: false,
      format: 'json',
      options: {
        num_predict: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json() as {
    message: { content: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  return {
    finalText: data.message?.content ?? '',
    toolCalls: [],
    iterations: 1,
    usage: {
      input_tokens: data.prompt_eval_count ?? 0,
      output_tokens: data.eval_count ?? 0,
    },
  };
}

// ────────────────────────────────────────────────────
//  Util — extrai JSON do output (fallback se o modelo embrulhar em markdown)
// ────────────────────────────────────────────────────

export function extractJSON(text: string): unknown {
  if (!text || !text.trim()) throw new Error('Modelo retornou texto vazio');

  // 1. Tenta parsear o texto cru
  try { return JSON.parse(text); } catch { /* fallthrough */ }

  // 2. Tenta extrair de bloco markdown ```json ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced && fenced[1]) {
    try { return JSON.parse(fenced[1]); } catch { /* fallthrough */ }
  }

  // 3. Tenta primeiro { até último } (greedy)
  const first = text.indexOf('{');
  const last  = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch { /* fallthrough */ }
  }

  // 4. Parser balanceado: encontra o maior bloco { ... } com chaves balanceadas
  const balanced = findBalancedJSON(text);
  if (balanced) {
    try { return JSON.parse(balanced); } catch { /* fallthrough */ }
  }

  throw new Error('Modelo não retornou JSON parseável');
}

function findBalancedJSON(text: string): string | null {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}
