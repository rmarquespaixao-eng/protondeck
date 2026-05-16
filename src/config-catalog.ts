export type EnvOption = {
  key: string;
  label: string;
  description: string;
  // Contexto expandido: quando usar, quando evitar, dependências
  tip?: string;
  category: string;
  type: 'toggle' | 'select' | 'text';
  defaultValue: string;
  options?: { value: string; label: string }[];
};

export type ArgOption = {
  key: string;
  label: string;
  description: string;
  tip?: string;
  category: string;
  value: string;
};

export type WrapperOption = {
  key: string;
  label: string;
  description: string;
  prefix: string;
};

export const ENV_OPTIONS: EnvOption[] = [
  // DXVK
  {
    key: 'DXVK_ASYNC', label: 'DXVK Async', category: 'DXVK', type: 'toggle', defaultValue: '1',
    description: 'Compila shaders assincronamente — elimina micro-stutter na primeira passagem',
    tip: 'USE quando há micro-stutter ao entrar em áreas novas pela primeira vez (driver compila shader sob demanda). APLICA-SE a jogos DX9/10/11 via DXVK. NÃO tem efeito em jogos DX12 (que usam VKD3D — equivalente lá é VKD3D_CONFIG=separable_shaders). NÃO habilite com PROTON_USE_WINED3D=1. RISCO: alguns anti-cheats (EAC, BattlEye) podem detectar como cheat em jogos online — pesquise antes em areweanticheatyet.com.',
  },
  {
    key: 'DXVK_FRAME_RATE', label: 'Frame Rate Limit', category: 'DXVK', type: 'text', defaultValue: '144',
    description: 'Limita FPS via DXVK — age antes do flip, mais preciso que v-sync',
    tip: 'USE para evitar que o jogo queime GPU a 300+ FPS no menu/cutscene. Mais preciso do que o limitador do driver NVIDIA. ALTERNATIVA: MangoHud com fps_limit ou limitador in-game. NÃO funciona com WineD3D ativo.',
  },
  {
    key: 'DXVK_LOG_LEVEL', label: 'Log Level', category: 'DXVK', type: 'select', defaultValue: 'none',
    description: 'Verbosidade do log DXVK — use "none" em produção',
    tip: 'USE "info" ou "debug" apenas para diagnosticar problemas gráficos específicos. Em produção deixe "none" — logs verbosos reduzem performance e enchem o disco.',
    options: [{ value: 'none', label: 'none (produção)' }, { value: 'error', label: 'error' }, { value: 'warn', label: 'warn' }, { value: 'info', label: 'info' }, { value: 'debug', label: 'debug (lento)' }],
  },
  {
    key: 'DXVK_HUD', label: 'DXVK HUD', category: 'DXVK', type: 'text', defaultValue: 'fps,memory',
    description: 'Overlay DXVK interno — valores: fps, memory, gpuload, drawcalls, pipelines',
    tip: 'USE para monitorar FPS e VRAM em jogos DX9/10/11. Mais leve que MangoHud. ALTERNATIVA preferida: MangoHud (mais completo, inclui CPU, temps, frame time). NÃO funciona com WineD3D ou jogos DX12.',
  },
  {
    key: 'DXVK_ENABLE_NVAPI', label: 'DXVK NVAPI', category: 'DXVK', type: 'toggle', defaultValue: '1',
    description: 'Habilita NVAPI no DXVK — necessário para DLSS em jogos DX9/10/11',
    tip: 'DEPENDE de PROTON_ENABLE_NVAPI=1 para funcionar — sem ele, não tem efeito. USE em jogos DX11 que suportam DLSS (ex: Control, Cyberpunk em DX11). Para jogos DX12, PROTON_ENABLE_NVAPI sozinho normalmente é suficiente. INCOMPATÍVEL com PROTON_USE_WINED3D=1.',
  },
  // VKD3D
  {
    key: 'VKD3D_CONFIG', label: 'VKD3D Config', category: 'VKD3D', type: 'text', defaultValue: 'dxr11',
    description: 'Flags VKD3D-Proton — dxr11=Ray Tracing, separable_shaders=compat',
    tip: 'dxr11: ativa extensões Vulkan RT — USE em jogos DX12 com ray tracing (Cyberpunk, RoboCop, Stalker 2). O jogo precisa usar DX12 para RT funcionar. corsair: compatibilidade com alguns jogos problemáticos. separable_shaders: reduz stutter em títulos que travam na compilação.',
  },
  {
    key: 'VKD3D_FEATURE_LEVEL', label: 'Feature Level DX12', category: 'VKD3D', type: 'select', defaultValue: '12_2',
    description: 'Feature level DX12 reportado ao jogo — 12_2 é o máximo (RTX 40/50)',
    tip: 'USE 12_2 em hardware Blackwell/Ada. REDUZA para 12_1 ou 12_0 se o jogo crashar na inicialização com "unsupported feature level" — alguns jogos mal-implementados não suportam o nível máximo. NÃO use 11_1 a menos que o jogo explicitamente exija.',
    options: [{ value: '12_2', label: '12_2 (máximo, Blackwell/Ada)' }, { value: '12_1', label: '12_1' }, { value: '12_0', label: '12_0' }, { value: '11_1', label: '11_1 (compat máxima)' }],
  },
  {
    key: 'VKD3D_DEBUG_LEVEL', label: 'VKD3D Debug Level', category: 'VKD3D', type: 'select', defaultValue: 'NONE',
    description: 'Verbosidade VKD3D — use NONE em produção',
    tip: 'USE ERR ou WARN apenas para investigar crashes DX12 específicos. TRACE é extremamente verboso e degrada performance significativamente. Em produção sempre NONE.',
    options: [{ value: 'NONE', label: 'NONE (produção)' }, { value: 'ERR', label: 'ERR' }, { value: 'WARN', label: 'WARN' }, { value: 'INFO', label: 'INFO' }, { value: 'TRACE', label: 'TRACE (lentíssimo)' }],
  },
  // NVIDIA
  {
    key: 'PROTON_ENABLE_NVAPI', label: 'NVAPI — DLSS / Reflex / FG', category: 'NVIDIA', type: 'toggle', defaultValue: '1',
    description: 'Habilita NVAPI completo para o processo Wine — requisito para DLSS e Frame Generation',
    tip: 'USE sempre que o jogo suportar DLSS, DLSS Frame Generation ou Reflex. Para jogos DX11: combine com DXVK_ENABLE_NVAPI=1. Para jogos DX12: esta flag sozinha geralmente é suficiente. INCOMPATÍVEL com PROTON_HIDE_NVIDIA_GPU=1 (que mascara a GPU). Sem esta flag, as opções DLSS não aparecem no menu do jogo.',
  },
  {
    key: 'PROTON_HIDE_NVIDIA_GPU', label: 'Hide NVIDIA GPU', category: 'NVIDIA', type: 'toggle', defaultValue: '0',
    description: 'Mascara a GPU NVIDIA do jogo — 0=visível (padrão), 1=oculta',
    tip: 'USE com valor 1 APENAS se o jogo recusar iniciar com mensagem de GPU não suportada (ex: alguns jogos com whitelist de GPUs). NUNCA use com PROTON_ENABLE_NVAPI=1 — são incompatíveis: ocultar a GPU bloqueia NVAPI, DLSS e Frame Generation.',
  },
  {
    key: '__GL_MaxFramesAllowed', label: 'GL Max Frames (latência)', category: 'NVIDIA', type: 'select', defaultValue: '1',
    description: 'Buffering de frames no driver NVIDIA — 1 = baixa latência de input',
    tip: 'USE "1" em jogos que requerem resposta rápida (ação, competitivo). O driver por padrão usa 3, o que aumenta latência mas suaviza o frame pacing. "1" pode causar micro-stutters em cenas pesadas com CPU gargalo.',
    options: [{ value: '1', label: '1 (baixa latência — recomendado)' }, { value: '2', label: '2' }, { value: '3', label: '3 (padrão driver)' }],
  },
  {
    key: '__GL_THREADED_OPTIMIZATIONS', label: 'GL Threaded Optimizations', category: 'NVIDIA', type: 'toggle', defaultValue: '1',
    description: 'Driver NVIDIA multi-thread — beneficia jogos com muitas draw calls OpenGL',
    tip: 'USE em jogos OpenGL/DX11 com CPU bound (muitas draw calls). Em alguns jogos pode causar instabilidade gráfica — desative se tiver artefatos visuais ou crashes.',
  },
  // Proton
  {
    key: 'PROTON_NO_ESYNC', label: 'Desabilitar ESYNC', category: 'Proton', type: 'toggle', defaultValue: '1',
    description: 'Desativa ESYNC — tente se o jogo travar ou crashar na inicialização',
    tip: 'USE apenas para diagnóstico de travamento na inicialização. ESYNC melhora a sincronização de threads Wine — desabilitar reduz performance. Protocolo: tente sem ESYNC primeiro, depois adicione NO_FSYNC se persistir. Alguns sistemas com limites baixos de file descriptors (ulimit) precisam de NO_ESYNC permanente.',
  },
  {
    key: 'PROTON_NO_FSYNC', label: 'Desabilitar FSYNC', category: 'Proton', type: 'toggle', defaultValue: '1',
    description: 'Desativa FSYNC — tente junto com ESYNC se crashes persistirem',
    tip: 'USE para diagnóstico — o kernel sem suporte a futex2 pode exigir NO_FSYNC. Desabilitar ambos (ESYNC + FSYNC) remove toda sincronização Wine otimizada — faça apenas como último recurso e teste um de cada vez.',
  },
  {
    key: 'PROTON_USE_WINED3D', label: 'Usar WineD3D (DX→OpenGL)', category: 'Proton', type: 'toggle', defaultValue: '1',
    description: 'Substitui DXVK por WineD3D — conversão DX→OpenGL (mais compat, muito mais lento)',
    tip: 'ÚLTIMO RECURSO de compatibilidade. WineD3D converte DX em OpenGL — funciona em mais casos mas tem performance muito inferior a DXVK. USE apenas se o jogo crashar com DXVK e nenhum outro tweak resolver. TORNA INÚTEIS: DXVK_ASYNC, DXVK_ENABLE_NVAPI, DXVK_HUD, DXVK_FRAME_RATE — desative essas flags ao habilitar WineD3D.',
  },
  {
    key: 'PROTON_FORCE_LARGE_ADDRESS_AWARE', label: 'Large Address Aware', category: 'Proton', type: 'toggle', defaultValue: '1',
    description: 'Permite processo 32-bit usar mais de 2GB RAM',
    tip: 'USE em jogos antigos de 32-bit com mods pesados (Skyrim, Morrowind, GTA SA modded). Sem essa flag, processos 32-bit são limitados a 2GB de RAM virtual — mods pesados causam crashes com "out of memory". Irrelevante para jogos 64-bit.',
  },
  {
    key: 'WINEDLLOVERRIDES', label: 'Wine DLL Overrides', category: 'Proton', type: 'text', defaultValue: '',
    description: 'Força carregamento de DLLs específicas — ex: dinput8=n,b para mods',
    tip: 'FORMATO: dll=modo (n=native, b=builtin). Exemplos: "dinput8=n,b" carrega DLL nativa antes da Wine-builtin — necessário para mods de Elden Ring, Dark Souls, Lies of P. "d3d9=n" força d3d9 nativo (para dgVoodoo2). USE com cuidado: DLL errada causa crash imediato.',
  },
  {
    key: 'PROTON_LOG', label: 'Proton Log', category: 'Proton', type: 'toggle', defaultValue: '1',
    description: 'Grava log Proton em ~/steam-<appid>.log',
    tip: 'USE apenas para diagnóstico — o log cresce rapidamente e pode ocupar GBs em sessões longas. Útil para identificar qual DLL falta ou qual erro Wine causa o crash. Desative após resolver o problema.',
  },
  // Monitor
  {
    key: 'SDL_VIDEO_FULLSCREEN_DISPLAYS', label: 'Monitor Fullscreen', category: 'Monitor', type: 'text', defaultValue: 'DP-2',
    description: 'Define qual monitor recebe fullscreen — essencial em multi-monitor',
    tip: 'USE quando o jogo abre fullscreen no monitor errado. Valor = nome do output (DP-2, HDMI-1, DP-3). Ver nomes com: kscreen-doctor -o | grep Output. DESNECESSÁRIO com Gamescope ativo — use --prefer-output no painel gamescope.',
  },
  {
    key: 'SDL_VIDEODRIVER', label: 'SDL Video Driver', category: 'Monitor', type: 'select', defaultValue: 'x11',
    description: 'Força backend SDL — x11 resolve tela preta de jogos DX em Wayland',
    tip: 'USE "x11" quando o jogo abrir tela preta em sessão Wayland. Força o jogo a usar XWayland em vez do Wayland nativo — ligeira penalidade de performance. DESNECESSÁRIO com Gamescope ativo (ele gerencia o display). Tente "wayland" se o jogo já tem suporte Wayland nativo e você quer input lag mínimo.',
    options: [{ value: 'x11', label: 'x11 (XWayland — mais compat)' }, { value: 'wayland', label: 'wayland (nativo, menos compat)' }],
  },
  // AMD
  {
    key: 'RADV_PERFTEST', label: 'RADV Perf Flags', category: 'AMD/Mesa', type: 'text', defaultValue: 'gpl',
    description: 'Flags de performance RADV (Mesa AMD) — gpl=Graphics Pipeline Library',
    tip: 'ESPECÍFICO PARA AMD. "gpl" ativa Graphics Pipeline Library — reduz shader stutter em GPUs AMD, similar ao que DXVK_ASYNC faz para NVIDIA/DXVK. USE em GPUs AMD RDNA2+. Em GPUs NVIDIA esta flag não tem efeito algum.',
  },
  {
    key: 'AMD_VULKAN_ICD', label: 'AMD Vulkan ICD', category: 'AMD/Mesa', type: 'select', defaultValue: 'RADV',
    description: 'Força qual driver Vulkan AMD usar',
    tip: 'RADV (Mesa): driver open-source, melhor para jogos — recomendado. AMDVLK: driver open-source oficial AMD, pode ter melhor performance em alguns títulos específicos. Troque apenas se RADV causar problemas com o jogo específico.',
    options: [{ value: 'RADV', label: 'RADV (Mesa — recomendado)' }, { value: 'amdvlk', label: 'AMDVLK' }],
  },
  // Performance/Debug
  {
    key: 'MANGOHUD_CONFIG', label: 'MangoHud Config Path', category: 'Performance', type: 'text', defaultValue: '',
    description: 'Path para arquivo de configuração MangoHud personalizado',
    tip: 'USE para apontar para um ~/.config/MangoHud/custom.conf com métricas específicas por jogo. Deixe vazio para usar a config global padrão.',
  },
  {
    key: 'LD_PRELOAD', label: 'GameMode (LD_PRELOAD)', category: 'Performance', type: 'text', defaultValue: 'libgamemodeauto.so.0',
    description: 'Ativa Feral GameMode oficial — daemon registra o PID, eleva prioridade de CPU/IO',
    tip: 'Forma oficial Feral de ativar GameMode sem o script wrapper. Carrega libgamemodeauto.so.0 que se auto-registra no daemon gamemoded via D-Bus. REQUISITO: daemon rodando (`systemctl --user status gamemoded`). VALIDE com `gamemoded -t`. Se precisar pre-carregar OUTRA lib além da do GameMode, separe com `:` (ex: "libgamemodeauto.so.0:/path/outra.so"). Em distros com path nao-padrao, use absoluto: "/usr/lib/libgamemodeauto.so.0".',
  },
];

export const ARG_OPTIONS: ArgOption[] = [
  {
    key: 'dx12', label: '-dx12', category: 'API', value: '-dx12',
    description: 'Força DirectX 12 — necessário para RT e algumas features DLSS',
    tip: 'USE em jogos UE5, REDengine 4, e qualquer título que ofereça DX12 como opção in-game. Combinado com VKD3D_CONFIG=dxr11 habilita Ray Tracing. CUIDADO: alguns jogos UE4 têm DX12 instável — se travar, remova.',
  },
  {
    key: 'dx11', label: '-dx11', category: 'API', value: '-dx11',
    description: 'Força DirectX 11 — mais estável em jogos com DX12 problemático',
    tip: 'USE quando o jogo oferecer DX12 mas esse for instável (stutter, crash, artefatos). DX11 via DXVK tem excelente compatibilidade. Em UE4 frequentemente é a escolha mais estável que DX12.',
  },
  {
    key: 'vulkan', label: '-vulkan', category: 'API', value: '-vulkan',
    description: 'Força Vulkan nativo — elimina a camada de tradução DXVK/VKD3D',
    tip: 'USE em jogos com suporte Vulkan nativo (Doom Eternal, Quake, alguns UE4/UE5). Performance máxima pois remove a camada de tradução. NÃO combine com -dx12 ou -dx11.',
  },
  {
    key: 'opengl', label: '-opengl', category: 'API', value: '-opengl',
    description: 'Força OpenGL — compatibilidade máxima, performance baixa',
    tip: 'USE apenas como último recurso quando DX e Vulkan causam crashes. OpenGL via Wine tem performance inferior. Em alguns jogos Unity antigos pode ser a única opção funcional.',
  },
  {
    key: 'fullscreen', label: '-fullscreen', category: 'Display', value: '-fullscreen',
    description: 'Inicia em fullscreen exclusivo',
    tip: 'USE quando o jogo ignora a configuração de fullscreen salva. NÃO combine com -windowed.',
  },
  {
    key: 'windowed', label: '-windowed', category: 'Display', value: '-windowed',
    description: 'Inicia em modo janela',
    tip: 'USE para forçar janela quando o jogo trava em fullscreen exclusivo. NÃO combine com -fullscreen.',
  },
  {
    key: 'noborder', label: '-noborder', category: 'Display', value: '-noborder',
    description: 'Janela sem borda (borderless windowed) — sem barra de título',
    tip: 'Combine com -windowed para borderless fullscreen sem exclusivo. Útil para alt-tab rápido sem o overhead de fullscreen exclusivo.',
  },
  {
    key: 'novid', label: '-novid', category: 'Source', value: '-novid',
    description: 'Pula vídeos de intro — Source Engine',
    tip: 'USE em qualquer jogo Source Engine (CS2, Half-Life, TF2). Pula os vídeos de logo da Valve na inicialização — economiza alguns segundos de loading.',
  },
  {
    key: 'nojoy', label: '-nojoy', category: 'Source', value: '-nojoy',
    description: 'Desativa detecção de joystick — Source Engine',
    tip: 'USE se o jogo travar detectando controles ou se você não usa joystick. Pequena melhoria de tempo de inicialização.',
  },
  {
    key: 'nolog', label: '-nolog', category: 'Misc', value: '-nolog',
    description: 'Desativa log do jogo — reduz I/O',
    tip: 'USE para reduzir escritas em disco em jogos que loggam muito. Pode dificultar diagnóstico de problemas — desative se precisar investigar crashes.',
  },
  {
    key: 'noconsole', label: '-noconsole', category: 'Misc', value: '-noconsole',
    description: 'Desativa console de debug',
    tip: 'USE para eliminar a janela de console que alguns jogos Windows abrem. Melhora levemente o performance de inicialização.',
  },
];

export const WRAPPER_OPTIONS: WrapperOption[] = [
  { key: 'mangohud', label: 'MangoHud', description: 'Overlay: FPS, GPU, CPU, temps, VRAM', prefix: 'mangohud' },
];

export type GamescopeOption = {
  key: string;
  label: string;
  description: string;
  flag: string;
  type: 'toggle' | 'text' | 'select';
  defaultValue?: string;
  options?: { value: string; label: string }[];
};

export const GAMESCOPE_OPTIONS: GamescopeOption[] = [
  { key: 'game_w',      flag: '-w',                label: '-w  (largura jogo)',     description: 'Resolução interna que o jogo renderiza (largura)', type: 'text', defaultValue: '3440' },
  { key: 'game_h',      flag: '-h',                label: '-h  (altura jogo)',      description: 'Resolução interna que o jogo renderiza (altura)',  type: 'text', defaultValue: '1440' },
  { key: 'out_W',       flag: '-W',                label: '-W  (largura output)',   description: 'Resolução do monitor de saída (largura)',           type: 'text', defaultValue: '3440' },
  { key: 'out_H',       flag: '-H',                label: '-H  (altura output)',    description: 'Resolução do monitor de saída (altura)',            type: 'text', defaultValue: '1440' },
  { key: 'refresh',     flag: '-r',                label: '-r  (refresh Hz)',       description: 'Taxa de atualização alvo em Hz',                    type: 'text', defaultValue: '100' },
  { key: 'fullscreen',  flag: '-f',                label: '-f  (fullscreen)',       description: 'Gamescope em fullscreen exclusivo',                  type: 'toggle' },
  { key: 'grab_cursor', flag: '--force-grab-cursor',label: 'Force Grab Cursor',    description: 'Previne cursor escapar pro outro monitor',           type: 'toggle' },
  { key: 'prefer_out',  flag: '--prefer-output',   label: 'Prefer Output',         description: 'Monitor de saída preferido (DP-2, HDMI-1, etc.)',   type: 'text', defaultValue: 'DP-2' },
  { key: 'filter',      flag: '--filter',           label: 'Upscale Filter',        description: 'Filtro ao upscalar (res jogo < output)',             type: 'select', defaultValue: 'linear', options: [{ value: 'linear', label: 'linear (padrão)' }, { value: 'fsr', label: 'FSR (AMD FidelityFX)' }, { value: 'nis', label: 'NIS (NVIDIA)' }, { value: 'pixel', label: 'pixel (sem filtro)' }] },
  { key: 'fsr_sharp',   flag: '--fsr-sharpness',   label: 'FSR Sharpness',         description: '0 = máx nitidez · 20 = mais suave',                 type: 'text', defaultValue: '5' },
  { key: 'hdr',         flag: '--hdr-enabled',     label: 'HDR',                   description: 'Habilita HDR (requer monitor + driver compatível)', type: 'toggle' },
];

export type ResolutionFormat = {
  key: string;
  label: string;
  description: string;
  widthFlag: string;
  heightFlag: string;
};

export const RESOLUTION_FORMATS: ResolutionFormat[] = [
  { key: 'width_height',   label: '-width / -height',               description: 'RE Engine (Resident Evil, DMC5, MHW), muitos UE4/UE5', widthFlag: '-width',        heightFlag: '-height' },
  { key: 'screen_wh',      label: '-screen-width / -screen-height', description: 'Unity Engine',                                         widthFlag: '-screen-width', heightFlag: '-screen-height' },
  { key: 'w_h',            label: '-w / -h',                        description: 'Source Engine e outros (atenção: conflita com gamescope -w/-h — use gamescope nesse caso)', widthFlag: '-w', heightFlag: '-h' },
  { key: 'resx_resy',      label: '-resx / -resy',                  description: 'Alguns jogos indie / GameMaker',                        widthFlag: '-resx',         heightFlag: '-resy' },
];

export const PROTON_VERSIONS = [
  'proton-cachyos', 'proton-cachyos-slr', 'proton-experimental',
  'proton-ge', 'proton-stable', 'native-or-proton-cachyos',
];

export const ENGINE_IDS = [
  'ue5', 'ue4', 'unity', 'source', 'source2', 'creation',
  'redengine4', 'rage', 'frostbite', 'anvil', 'unknown',
];

export type EnginePreset = {
  label: string;
  note: string;
  envEnable: Array<{ key: string; val: string }>;
  argsEnable: string[];
  wrapsEnable: string[];
};

// Constrói uma launch_options string a partir do preset, opcionalmente
// considerando GPU vendor (pra suprimir NVAPI em AMD ou trocar por RADV_PERFTEST).
export function buildLaunchFromPreset(
  engineId: string,
  opts: { gpuVendor?: 'nvidia' | 'amd' | 'intel' | null } = {},
): string | null {
  const p = ENGINE_PRESETS[engineId];
  if (!p) return null;
  const vendor = opts.gpuVendor ?? null;

  const envParts: string[] = [];
  for (const e of p.envEnable) {
    // Pula NVAPI em GPUs não-NVIDIA
    if (vendor && vendor !== 'nvidia' && (e.key === 'PROTON_ENABLE_NVAPI' || e.key === 'DXVK_ENABLE_NVAPI')) continue;
    envParts.push(`${e.key}=${e.val}`);
  }
  // Em GPU AMD adiciona RADV_PERFTEST=gpl (equivalente do DXVK_ASYNC)
  if (vendor === 'amd' && !envParts.some(s => s.startsWith('RADV_PERFTEST='))) {
    envParts.push('RADV_PERFTEST=gpl');
  }

  const wrapParts = p.wrapsEnable.join(' ');
  const argsParts = p.argsEnable.join(' ');

  const segments: string[] = [];
  if (envParts.length) segments.push(envParts.join(' '));
  if (wrapParts)       segments.push(wrapParts);
  segments.push('%command%');
  if (argsParts) segments.push(argsParts);
  return segments.join(' ');
}

export const ENGINE_PRESETS: Record<string, EnginePreset> = {
  ue5: {
    label: 'Unreal Engine 5',
    note: 'DX12 + DLSS + VKD3D RT. Deixe o menu rodar 2+ min antes de carregar save para compilar shaders.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
      { key: 'DXVK_ENABLE_NVAPI', val: '1' },
      { key: 'PROTON_ENABLE_NVAPI', val: '1' },
      { key: 'VKD3D_CONFIG', val: 'dxr11' },
      { key: 'VKD3D_FEATURE_LEVEL', val: '12_2' },
    ],
    argsEnable: ['-dx12'],
    wrapsEnable: [],
  },
  unity: {
    label: 'Unity Engine',
    note: 'DXVK_ASYNC ajuda com stutter inicial de compilação. Em jogos com DLSS adicionar NVAPI. Funciona bem sem tweaks adicionais.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  ue4: {
    label: 'Unreal Engine 4',
    note: 'DX11 é geralmente mais estável que DX12 no UE4. DXVK_ASYNC reduz stutter de shaders. Se tiver DLSS, ativar NVAPI.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
      { key: 'DXVK_ENABLE_NVAPI', val: '1' },
      { key: 'PROTON_ENABLE_NVAPI', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  redengine4: {
    label: 'REDengine 4 (Cyberpunk 2077, Witcher 3 NextGen)',
    note: 'DX12 obrigatório para features completas. RT é pesado — use DLSS Frame Generation para compensar.',
    envEnable: [
      { key: 'VKD3D_CONFIG', val: 'dxr11' },
      { key: 'VKD3D_FEATURE_LEVEL', val: '12_2' },
      { key: 'DXVK_ENABLE_NVAPI', val: '1' },
      { key: 'PROTON_ENABLE_NVAPI', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  source: {
    label: 'Valve Source Engine',
    note: 'Excelente compatibilidade nativa. -novid pula intro. Raramente precisa de tweaks.',
    envEnable: [],
    argsEnable: ['-novid'],
    wrapsEnable: [],
  },
  source2: {
    label: 'Valve Source 2',
    note: 'Suporte Vulkan nativo em alguns títulos (ex: Dota 2). Performance muito boa sem tweaks.',
    envEnable: [],
    argsEnable: [],
    wrapsEnable: [],
  },
  creation: {
    label: 'Bethesda Creation Engine (Skyrim, Fallout)',
    note: 'DXVK_ASYNC ajuda com stutters. Para mods pesados: WINEDLLOVERRIDES e PROTON_FORCE_LARGE_ADDRESS_AWARE.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
      { key: 'PROTON_FORCE_LARGE_ADDRESS_AWARE', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  frostbite: {
    label: 'EA Frostbite',
    note: 'Verifique areweanticheatyet.com — EA Anti-Cheat pode bloquear. DXVK_ASYNC ajuda.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  rage: {
    label: 'Rockstar RAGE (GTA, RDR)',
    note: 'Vulkan nativo em GTA V — use -vulkan. Performance excelente sem muitos tweaks.',
    envEnable: [],
    argsEnable: ['-vulkan'],
    wrapsEnable: [],
  },
  anvil: {
    label: 'Ubisoft Anvil/Snowdrop',
    note: 'Ubisoft Connect overlay pode causar problemas. Tente PROTON_NO_ESYNC=1 se travar.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  reengine: {
    label: 'RE Engine (Resident Evil, DMC5, MHW, MHR)',
    note: 'DX11 puro — NUNCA use -dx12. RE7/RE2R/RE3R/RE4R não detectam ultrawide nativo: use gamescope -W/-H ou args -width/-height. DXVK_ASYNC reduz stutter dos shaders pesados.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
      { key: 'DXVK_ENABLE_NVAPI', val: '1' },
      { key: 'PROTON_ENABLE_NVAPI', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  idtech: {
    label: 'id Tech 6/7 (Doom 2016, Doom Eternal, Wolfenstein)',
    note: 'Vulkan nativo — não precisa de DXVK. Use -vulkan se o launcher oferecer alternar. Performance no Linux é excelente sem tweaks.',
    envEnable: [],
    argsEnable: ['-vulkan'],
    wrapsEnable: [],
  },
  decima: {
    label: 'Decima Engine (Death Stranding, Horizon)',
    note: 'Vulkan nativo — performance excelente. DLSS via Streamline funciona com PROTON_ENABLE_NVAPI.',
    envEnable: [
      { key: 'PROTON_ENABLE_NVAPI', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  fox: {
    label: 'Fox Engine (Metal Gear Solid V, PES)',
    note: 'DX11 estável. Raramente precisa de tweaks além de DXVK_ASYNC para stutters iniciais.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
  unknown: {
    label: 'Genérico (engine desconhecido)',
    note: 'DXVK_ASYNC é seguro pra maioria dos jogos DX9/10/11 — habilita compilação assíncrona de shaders.',
    envEnable: [
      { key: 'DXVK_ASYNC', val: '1' },
    ],
    argsEnable: [],
    wrapsEnable: [],
  },
};
