// Tools que o agente AI pode invocar durante uma conversa.
// Cada tool tem schema (JSONSchema) compartilhado entre Anthropic e OpenAI,
// e um handler local que devolve JSON pro modelo.

import { COMPAT_RULES } from '../../../domain/games/CompatibilityRules.js';
import type { ProtonLogReader } from '../../../application/ports/out/ProtonLogReader.js';
import type { ProtonDBCommunityClient } from '../../../application/ports/out/ProtonDBCommunityClient.js';
import type { ProtonReport } from '../../../domain/check/ProtonReport.js';

export type ToolDef = {
  name: string;
  description: string;
  // JSONSchema compatível com Anthropic input_schema e OpenAI function.parameters
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export type ToolCallContext = {
  appid: string;
  protonLog: ProtonLogReader;
  protonDb: ProtonDBCommunityClient;
};

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'read_proton_log',
    description:
      'Lê o log do Proton em ~/steam-<appid>.log (gerado quando PROTON_LOG=1). Retorna um excerpt filtrado: todas as linhas com err:/warn:/erro DXVK/VKD3D + as últimas 400 linhas. Útil para identificar causa raiz de crashes, DLLs ausentes, dependências faltando. SEMPRE chame esta tool ANTES de chutar fix por heurística — uma única linha "err:module:LdrInitializeThunk" no log já aponta o problema. NÃO consome tokens do contexto principal — o resultado vai como tool_result.',
    inputSchema: {
      type: 'object',
      properties: {
        appid: {
          type: 'string',
          description: 'O appid do jogo (mesmo do jogo atual). Útil passar o valor do contexto.',
        },
      },
      required: ['appid'],
    },
  },
  {
    name: 'fetch_protondb_reports',
    description:
      'Busca relatórios da comunidade no ProtonDB para o jogo. Retorna até 10 reports com tier, Proton version, GPU, notes do usuário. Use quando precisar refinar diagnóstico com dado de campo — especialmente para jogos com tier Bronze/Silver onde "o que funciona" varia. NÃO precisa chamar se o jogo é Platinum/Gold óbvio e a comunidade não menciona tweaks.',
    inputSchema: {
      type: 'object',
      properties: {
        appid: {
          type: 'string',
          description: 'O appid do jogo.',
        },
        limit: {
          type: 'integer',
          description: 'Número máximo de reports (1-10). Default 5.',
        },
      },
      required: ['appid'],
    },
  },
  {
    name: 'check_compatibility_rules',
    description:
      'Roda o conjunto de regras de compatibilidade pré-codificadas (DX12+DX11, NVAPI sem PROTON_ENABLE_NVAPI, gamescope sem -W/-H, etc.) contra uma config proposta. Retorna lista de violações com severity + detail + fixes sugeridos. SEMPRE chame esta tool ANTES de retornar uma recomendação final — pega bugs que escapam da heurística mental.',
    inputSchema: {
      type: 'object',
      properties: {
        env: {
          type: 'object',
          description: 'Env vars como objeto chave→valor (ex: {"DXVK_ASYNC":"1","PROTON_ENABLE_NVAPI":"1"}).',
          additionalProperties: { type: 'string' },
        },
        args: {
          type: 'array',
          description: 'Args passados após %command% (ex: ["-dx12","-novid"]).',
          items: { type: 'string' },
        },
        wrappers: {
          type: 'array',
          description: 'Wrappers ativos (ex: ["gamescope","mangohud"]).',
          items: { type: 'string' },
        },
        gamescope: {
          type: 'object',
          description: 'Flags gamescope ativas (ex: {"-W":"3440","-H":"1440"}).',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['env', 'args', 'wrappers', 'gamescope'],
    },
  },
];

export type ToolInput = Record<string, unknown>;
export type ToolResult = Record<string, unknown> | { error: string };

export async function runTool(name: string, input: ToolInput, ctx: ToolCallContext): Promise<ToolResult> {
  try {
    if (name === 'read_proton_log') return await toolReadProtonLog(input, ctx);
    if (name === 'fetch_protondb_reports') return await toolFetchProtonDB(input, ctx);
    if (name === 'check_compatibility_rules') return await toolCheckRules(input);
    return { error: `tool desconhecida: ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolReadProtonLog(input: ToolInput, ctx: ToolCallContext): Promise<ToolResult> {
  const appid = String(input.appid ?? ctx.appid);
  const r = ctx.protonLog.read(appid);
  if (!r.found) {
    return {
      found: false,
      reason: r.reason,
      checked_path: r.checked_path,
      hint: 'Adicione PROTON_LOG=1 nas launch options, rode o jogo uma vez e tente de novo.',
    };
  }
  return {
    found: true,
    path: r.path,
    size_bytes: r.size,
    mtime: r.mtime,
    total_lines: r.lines,
    truncated: r.truncated,
    excerpt: r.excerpt,
  };
}

async function toolFetchProtonDB(input: ToolInput, ctx: ToolCallContext): Promise<ToolResult> {
  const appid = String(input.appid ?? ctx.appid);
  const limit = Math.min(10, Math.max(1, Number(input.limit ?? 5)));
  const data = await ctx.protonDb.fetchReports(appid, limit);
  return {
    appid: data.appid,
    total: data.total,
    fetched_at: data.fetched_at,
    reports: data.reports.map((r: ProtonReport) => ({
      tier: r.rating,
      proton: r.protonVersion,
      gpu: r.gpu,
      driver: r.gpuDriver,
      os: r.os,
      date: r.timestamp ? new Date(r.timestamp * 1000).toISOString().slice(0, 10) : null,
      notes: r.notes,
    })),
  };
}

async function toolCheckRules(input: ToolInput): Promise<ToolResult> {
  const env = (input.env ?? {}) as Record<string, string>;
  const args = Array.isArray(input.args) ? (input.args as string[]) : [];
  const wrappers = Array.isArray(input.wrappers) ? (input.wrappers as string[]) : [];
  const gs = (input.gamescope ?? {}) as Record<string, string>;

  const violations = COMPAT_RULES.filter(rule =>
    rule.when.every(cond => evalCond(cond, env, args, wrappers, gs))
  ).map(r => ({
    id: r.id,
    severity: r.severity,
    message: r.message,
    detail: r.detail,
    fix_disable: r.fixDisable ?? [],
    fix_enable: r.fixEnable ?? [],
  }));

  return {
    total_rules_checked: COMPAT_RULES.length,
    violations,
    clean: violations.length === 0,
  };
}

function evalCond(
  cond: string,
  env: Record<string, string>,
  args: string[],
  wrappers: string[],
  gs: Record<string, string>,
): boolean {
  const colon = cond.indexOf(':');
  const type = cond.slice(0, colon);
  const rest = cond.slice(colon + 1);

  if (type === 'env') {
    const eq = rest.indexOf('=');
    if (eq >= 0) {
      const k = rest.slice(0, eq);
      const v = rest.slice(eq + 1);
      return env[k] !== undefined && env[k] === v;
    }
    return env[rest] !== undefined;
  }
  if (type === 'env_off') return env[rest] === undefined;
  if (type === 'arg') return args.includes(rest);
  if (type === 'arg_off') return !args.includes(rest);
  if (type === 'wrap') return wrappers.includes(rest);
  if (type === 'gs') return gs[rest] !== undefined;
  if (type === 'gs_off') return gs[rest] === undefined;
  return false;
}
