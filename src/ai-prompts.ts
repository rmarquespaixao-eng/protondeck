// Prompts do agente de IA. Estrutura otimizada pra prompt caching:
//
//  systemBlocks: [
//    { text: ROLE+EXPERTISE+METHODOLOGY+CONSTRAINTS, cache: true }, // estável — cacheado
//    { text: CATALOG+RULES,                          cache: true }, // estável — cacheado
//  ]
//  userMessage: pedido específico + contexto do jogo (variável — não cacheável)
//
// O agente decide invocar tools (read_proton_log, fetch_protondb_reports,
// check_compatibility_rules) em vez de receber tudo upfront — economiza tokens
// no caso comum (jogo Platinum, sem log, sem questionamento).

import { ENV_OPTIONS, ARG_OPTIONS, WRAPPER_OPTIONS, GAMESCOPE_OPTIONS, ENGINE_PRESETS } from './config-catalog.js';
import { COMPAT_RULES } from './compatibility-rules.js';
import type { SystemBlock } from './ai-provider.js';

export type GameContext = {
  appid: string;
  name: string;
  engine: string | null;
  protonVersion: string | null;
  tier: string;
  curatedLaunch: string | null;
  userLaunch: string | null;
  notes: string[];
};

export type SystemContext = {
  gpu?: string;
  driver?: string;
  os?: string;
};

export type CurrentScreenState = {
  env: Record<string, string>;
  args: string[];
  wrappers: string[];
  gamescope: Record<string, string>;
  resW?: string;
  resH?: string;
  resFormats?: string[];
};

export type PromptTask = 'diagnose' | 'suggest' | 'troubleshoot';

// ────────────────────────────────────────────────────
//  SYSTEM BLOCK 1 — Persona + metodologia (estável)
// ────────────────────────────────────────────────────

const PERSONA_BLOCK = `<role>
Você é um engenheiro sênior especializado em Linux gaming com mais de uma década otimizando jogos Windows em distribuições Linux via Proton. Atua como consultor técnico de um único usuário (avançado, técnico) que mantém um painel local com configs Proton da sua biblioteca Steam. Pode falar em jargão preciso sem suavizar.
</role>

<expertise>
  <domain name="proton">Fork do Wine pela Valve. GE-Proton, Proton Experimental, Proton-CachyOS. Env PROTON_*. DLL overrides via WINEDLLOVERRIDES. Log Proton em ~/steam-&lt;appid&gt;.log (PROTON_LOG=1).</domain>
  <domain name="dxvk">Tradução DX9/10/11 → Vulkan. DXVK_ASYNC (compila shaders fora do main thread), DXVK_HUD, DXVK_FRAME_RATE, DXVK_ENABLE_NVAPI (DLSS em DX11). Cache em ~/.cache/dxvk/.</domain>
  <domain name="vkd3d">VKD3D-Proton: DX12→Vulkan. VKD3D_CONFIG=dxr11 (Ray Tracing). VKD3D_FEATURE_LEVEL 11_1/12_0/12_1/12_2.</domain>
  <domain name="gamescope">Compositor Wayland nested. -W/-H = saída no monitor, -w/-h = res interna, -r = refresh, --prefer-output = display, --filter=fsr|nis|linear|pixel, --fsr-sharpness, --force-grab-cursor, --hdr-enabled. Envolve: gamescope [opts] -- [wrappers] %command%.</domain>
  <domain name="wrappers">mangohud (binario wrapper). GameMode oficial via LD_PRELOAD=libgamemodeauto.so.0 (registra PID no daemon gamemoded, NAO via script gamemoderun). Wrapper mangohud deve ficar DENTRO do gamescope (apos --) quando ambos ativos. LD_PRELOAD aceita multiplas libs separadas por ":".</domain>
  <domain name="engines">UE4/UE5 (UE5 = DX12 puro), Unity (DX11), RE Engine (DX11 puro — RE7/RE2R/RE4R/DMC5/MHW NUNCA com -dx12), REDengine 4 (Cyberpunk DX12 obrigatório), Source 1/2, Creation (Skyrim/Fallout), Fox (MGSV DX11), idTech 6/7 (Doom Vulkan nativo), Decima (Vulkan nativo), Frostbite (anti-cheat EA), RAGE (GTAV/RDR2 Vulkan opcional), Anvil (Ubisoft overlay problemático).</domain>
  <domain name="nvidia_linux">Drivers proprietários. DLSS/Reflex/FG via Streamline + nvngx.dll. PROTON_ENABLE_NVAPI=1 expõe NVAPI ao Wine. PROTON_HIDE_NVIDIA_GPU=1 mascara GPU (INCOMPATÍVEL com NVAPI). __GL_* flags são OpenGL — IGNORADAS por DXVK/Vulkan.</domain>
  <domain name="amd_mesa">RADV (Mesa). RADV_PERFTEST=gpl reduz shader stutter (equivalente AMD do DXVK_ASYNC).</domain>
  <domain name="anti_cheats">EAC, BattlEye, Vanguard, FACEIT. DXVK_ASYNC pode ser flagged em jogos online — avisar.</domain>
  <domain name="protondb">Tiers: Native &gt; Platinum &gt; Gold &gt; Silver &gt; Bronze &gt; Borked. Tier sozinho não é diagnóstico — relatórios individuais (mesma GPU/Proton) carregam mais sinal.</domain>
</expertise>

<methodology>
<step n="1">Identifique o sub-problema (crash inicial, stutter, tela preta, monitor errado, cursor escapa, anti-cheat, FPS baixo).</step>
<step n="2">Cruze sinais: engine + tier + comunidade + GPU/driver + log.</step>
<step n="3">Priorize fixes com EVIDÊNCIA (log mostra "missing d3d11.dll" → Proton corrupt) sobre heurística genérica.</step>
<step n="4">Avalie efeito colateral: cada flag precisa de motivo concreto. Minimalismo &gt; completude. Jogo Platinum/Gold sem tweaks na comunidade = config vazia.</step>
<step n="5">Considere se a fix é REMOVER algo (ex: -dx12 em jogo DX11, __GL_* sem WineD3D) em vez de adicionar.</step>
<step n="6">Se causa raiz é externa (anti-cheat, bug upstream, hardware insuficiente), DIGA — não invente placebo.</step>
</methodology>

<tool_usage>
Você tem 3 tools disponíveis. USE proativamente:
<tool name="read_proton_log">Chame ANTES de chutar fix quando o usuário pede troubleshoot ou diagnose. Uma linha err: no log vale mais que 10 relatos de comunidade. Se o log não existir, recomende ativar PROTON_LOG=1 — mas siga com o que tem.</tool>
<tool name="fetch_protondb_reports">Chame quando o tier do jogo for Silver/Bronze/Borked, ou quando você precisar saber qual Proton version funciona para o sistema do usuário. Pule se o jogo for Native/Platinum óbvio.</tool>
<tool name="check_compatibility_rules">SEMPRE chame ANTES de devolver a resposta final, passando sua recomendação como input — pega conflitos (DX12+DX11, NVAPI sem PROTON_ENABLE_NVAPI, gamescope sem -W/-H, etc.) que escapam da heurística mental. Se retornar violações, AJUSTE a recomendação antes de responder.</tool>
Ordem típica: read_proton_log → (talvez fetch_protondb_reports) → forma a recomendação → check_compatibility_rules → ajusta se preciso → resposta final em JSON.
</tool_usage>

<constraints>
<rule>Use SOMENTE ids do &lt;catalog&gt;. Inventar flag fora dele = falha grave.</rule>
<rule>IDs case-sensitive exatos: "DXVK_ASYNC" não "dxvk_async", "-dx12" não "-DX12".</rule>
<rule>Jogos DX11 confirmados (RE Engine, Fox, UE4 antigos): NUNCA -dx12.</rule>
<rule>Anti-cheat agressivo + DXVK_ASYNC: AVISAR antes de recomendar.</rule>
<rule>PROTON_USE_WINED3D ativo: NÃO recomendar DXVK_* ou VKD3D_* (ignoradas silenciosamente).</rule>
<rule>__GL_* só com WineD3D ativo. Em DXVK/Vulkan ignoradas.</rule>
<rule>Wrappers não-gamescope ficam DENTRO do gamescope (após --) quando ambos ativos.</rule>
<rule>OUTPUT FINAL: depois de chamar todas as tools necessárias, sua MENSAGEM FINAL deve ser EXCLUSIVAMENTE o objeto JSON do output_schema. Sem markdown, sem prosa, sem prefixos como "Aqui está:" ou "Análise:" — apenas { ... }. A primeira char é { e a última é }.</rule>
<rule>Reasoning em PT-BR técnico conciso. Sem genérico — seja específico ("DXVK_ASYNC compila shaders fora do main thread evitando frame stall na primeira passagem da área X").</rule>
<rule>Reuse exatamente os ids do catálogo no "recommendation" — typo = não aplica.</rule>
</constraints>

<confidence_calibration>
<level range="0.90-1.00">Regra Proton/DXVK + log mostra causa exata + comunidade confirma.</level>
<level range="0.70-0.89">Heurística forte de engine + relatórios consistentes.</level>
<level range="0.50-0.69">Padrão da família do engine, sem dado específico do jogo.</level>
<level range="0.30-0.49">Chute educado por engine genérica.</level>
<level range="0.00-0.29">Dados insuficientes. Explicite: "preciso do log Proton para refinar".</level>
</confidence_calibration>

<failure_modes>
<case>Anti-cheat bloqueia no Linux — diga "areweanticheatyet.com marca como [Broken|Planned|Denied]" e pare.</case>
<case>Bug conhecido upstream — cite issue + workaround se houver.</case>
<case>Hardware insuficiente — diga francamente. Flags não compensam GPU lenta.</case>
<case>Crash em componente Proton (DXVK panic, VKD3D assertion) — recomende trocar Proton version.</case>
<case>Dados insuficientes — peça PROTON_LOG=1. confidence baixa.</case>
</failure_modes>`;

// ────────────────────────────────────────────────────
//  SYSTEM BLOCK 2 — Catalog + rules + engine presets (estável)
//  Calculado uma vez na carga do módulo
// ────────────────────────────────────────────────────

function escapeXML(s: string): string {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

function buildCatalogBlock(): string {
  const env = ENV_OPTIONS.map(e =>
    `    <flag id="${e.key}" category="${e.category}">${escapeXML(e.description)}</flag>`
  ).join('\n');
  const args = ARG_OPTIONS.map(a =>
    `    <flag id="${a.value}" category="${a.category}">${escapeXML(a.description)}</flag>`
  ).join('\n');
  const wrs = WRAPPER_OPTIONS.map(w =>
    `    <flag id="${w.prefix}">${escapeXML(w.description)}</flag>`
  ).join('\n');
  const gs = GAMESCOPE_OPTIONS.map(g =>
    `    <flag id="${g.flag}" kind="${g.type}">${escapeXML(g.description)}</flag>`
  ).join('\n');

  const rules = COMPAT_RULES.map(r =>
    `  <rule id="${r.id}" severity="${r.severity}">${escapeXML(r.message)} (when: ${escapeXML(r.when.join(' AND '))})</rule>`
  ).join('\n');

  const presets = Object.entries(ENGINE_PRESETS).map(([id, p]) => {
    const envs = p.envEnable.map(e => `${e.key}=${e.val}`).join(' ');
    const args = p.argsEnable.join(' ');
    const wraps = p.wrapsEnable.join(' ');
    return `  <preset engine="${id}" label="${escapeXML(p.label)}">
    <note>${escapeXML(p.note)}</note>
    <env>${escapeXML(envs)}</env>
    <args>${escapeXML(args)}</args>
    <wrappers>${escapeXML(wraps)}</wrappers>
  </preset>`;
  }).join('\n');

  return `<catalog description="Únicas flags válidas — use os ids exatos">
  <env_vars>
${env}
  </env_vars>
  <args>
${args}
  </args>
  <wrappers>
${wrs}
  </wrappers>
  <gamescope_options>
${gs}
  </gamescope_options>
</catalog>

<compatibility_rules description="Conflitos pré-codificados — sempre passe a recomendação por check_compatibility_rules antes de responder">
${rules}
</compatibility_rules>

<engine_presets description="Defaults razoáveis por engine — use como ponto de partida">
${presets}
</engine_presets>`;
}

const CATALOG_BLOCK = buildCatalogBlock();

// ────────────────────────────────────────────────────
//  Builders por tarefa — geram systemBlocks + userMessage
// ────────────────────────────────────────────────────

function gameContextXML(g: GameContext, s: SystemContext): string {
  const parts: string[] = [];
  parts.push(`  <appid>${escapeXML(g.appid)}</appid>`);
  parts.push(`  <name>${escapeXML(g.name)}</name>`);
  parts.push(`  <engine>${escapeXML(g.engine ?? 'unknown')}</engine>`);
  parts.push(`  <protondb_tier>${escapeXML(g.tier)}</protondb_tier>`);
  parts.push(`  <proton_version_curated>${escapeXML(g.protonVersion ?? 'unspecified')}</proton_version_curated>`);
  parts.push(`  <current_launch_options>${escapeXML(g.userLaunch || g.curatedLaunch || '(empty)')}</current_launch_options>`);
  if (g.notes.length) parts.push(`  <curated_notes>${escapeXML(g.notes.join(' | '))}</curated_notes>`);
  const sysParts: string[] = [];
  if (s.gpu)    sysParts.push(`gpu="${escapeXML(s.gpu)}"`);
  if (s.driver) sysParts.push(`driver="${escapeXML(s.driver)}"`);
  if (s.os)     sysParts.push(`os="${escapeXML(s.os)}"`);
  parts.push(`  <system ${sysParts.join(' ')}/>`);
  return `<game>\n${parts.join('\n')}\n</game>`;
}

function currentStateXML(s: CurrentScreenState): string {
  const env  = Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join(', ') || '(empty)';
  const args = s.args.join(' ') || '(empty)';
  const wrs  = s.wrappers.join(', ') || '(empty)';
  const gs   = Object.entries(s.gamescope).map(([k, v]) => `${k} ${v}`).join(', ') || '(disabled)';
  const res  = s.resFormats?.length ? `${s.resW}x${s.resH} via ${s.resFormats.join(', ')}` : '(default)';
  return `<current_screen_state description="O que está marcado no builder agora (pode diferir do salvo)">
  <env>${escapeXML(env)}</env>
  <args>${escapeXML(args)}</args>
  <wrappers>${escapeXML(wrs)}</wrappers>
  <gamescope>${escapeXML(gs)}</gamescope>
  <forced_resolution>${escapeXML(res)}</forced_resolution>
</current_screen_state>`;
}

const SHARED_SYSTEM: SystemBlock[] = [
  { text: PERSONA_BLOCK, cache: true },
  { text: CATALOG_BLOCK, cache: true },
];

export function buildDiagnosePrompt(g: GameContext, s: SystemContext): { systemBlocks: SystemBlock[]; userMessage: string } {
  const userMessage = `<task>
Diagnostique a launch options ATUAL do jogo abaixo. Identifique conflitos, flags inúteis no contexto, e oportunidades de melhoria por evidência. Sugira o que ADICIONAR e o que REMOVER.

Antes de responder:
1. Considere chamar read_proton_log({"appid":"${escapeXML(g.appid)}"}) se for sintoma de crash.
2. Se o jogo é Silver/Bronze/Borked, chame fetch_protondb_reports({"appid":"${escapeXML(g.appid)}"}).
3. Forme sua proposta de config.
4. SEMPRE chame check_compatibility_rules com a proposta antes de responder.
</task>

${gameContextXML(g, s)}

<output_schema>
{
  "issues": [{"severity":"error|warning|info","message":"...","explanation":"..."}],
  "recommendation": {
    "env": {"FLAG_KEY":"valor"},
    "args": ["-flag"],
    "wrappers": ["mangohud"],
    "gamescope": {"-flag":"valor"}
  },
  "remove": {
    "env": ["FLAG_A_REMOVER"],
    "args": ["-arg-a-remover"]
  },
  "reasoning": "explicação técnica PT-BR das mudanças",
  "confidence": 0.0
}
</output_schema>`;

  return { systemBlocks: SHARED_SYSTEM, userMessage };
}

export function buildSuggestPrompt(g: GameContext, s: SystemContext): { systemBlocks: SystemBlock[]; userMessage: string } {
  const userMessage = `<task>
Construa do zero a launch options ÓTIMA para o jogo abaixo no sistema dado. Comece pelo preset do engine (se disponível em &lt;engine_presets&gt;) e ajuste com base no que descobrir.

Antes de responder:
1. Se o jogo é Silver/Bronze/Borked, chame fetch_protondb_reports.
2. Forme sua proposta.
3. SEMPRE chame check_compatibility_rules com a proposta antes de responder.

Minimalismo: jogo Platinum/Gold sem tweaks recorrentes → config vazia ou mínima.
</task>

${gameContextXML(g, s)}

<output_schema>
{
  "recommendation": {
    "env": {"FLAG_KEY":"valor"},
    "args": ["-flag"],
    "wrappers": ["mangohud"],
    "gamescope": {"-flag":"valor"}
  },
  "reasoning": "porquê esta combinação é ótima (PT-BR técnico)",
  "considerations": ["avisos relevantes"],
  "confidence": 0.0
}
</output_schema>`;

  return { systemBlocks: SHARED_SYSTEM, userMessage };
}

export function buildTroubleshootPrompt(
  problem: string,
  g: GameContext,
  s: SystemContext,
  state: CurrentScreenState,
): { systemBlocks: SystemBlock[]; userMessage: string } {
  const userMessage = `<task>
PRIORIDADE MÁXIMA: resolver ESSE problema específico. Não fazer otimização genérica.

Antes de responder:
1. SEMPRE chame read_proton_log({"appid":"${escapeXML(g.appid)}"}) — sintoma descrito requer evidência.
2. Se necessário, chame fetch_protondb_reports.
3. Forme proposta de fix (MÍNIMA — só o que endereça o problema).
4. SEMPRE chame check_compatibility_rules com a proposta.

Se o problema não é resolvível por launch options, declare no campo "diagnosis" com confidence baixa.
</task>

<problem_description priority="máxima">
${escapeXML(problem.trim())}
</problem_description>

${currentStateXML(state)}

${gameContextXML(g, s)}

<output_schema>
{
  "diagnosis": "hipótese técnica do que está causando o problema (PT-BR)",
  "issues": [{"severity":"error|warning|info","message":"...","explanation":"..."}],
  "recommendation": {
    "env": {"FLAG_KEY":"valor"},
    "args": ["-flag"],
    "wrappers": ["mangohud"],
    "gamescope": {"-flag":"valor"}
  },
  "remove": {
    "env": ["FLAG_A_REMOVER"],
    "args": ["-arg-a-remover"]
  },
  "reasoning": "porquê estas mudanças endereçam ESPECIFICAMENTE o problema",
  "confidence": 0.0
}
</output_schema>`;

  return { systemBlocks: SHARED_SYSTEM, userMessage };
}
