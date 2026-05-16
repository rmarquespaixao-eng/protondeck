// Cada condição é uma string no formato:
//   "env:KEY"          — env var KEY está marcada (qualquer valor)
//   "env:KEY=VALUE"    — env var KEY marcada E com esse valor
//   "env_off:KEY"      — env var KEY NÃO marcada
//   "arg:-dx12"        — arg -dx12 marcado
//   "arg_off:-dx12"    — arg -dx12 NÃO marcado
//   "wrap:gamescope"   — wrapper gamescope ativo
//   "gs:--prefer-output" — opção gamescope marcada
//   "gs_off:-W"        — opção gamescope NÃO marcada
//   "res:width_height" — formato de resolução marcado

export type RuleSeverity = 'error' | 'warning' | 'info';

export type CompatRule = {
  id: string;
  severity: RuleSeverity;
  message: string;
  detail: string;
  // Disparada quando TODAS as condições de `when` forem verdadeiras
  when: string[];
  // Corrigir: desativar essas flags
  fixDisable?: string[];
  // Corrigir: ativar essas flags (com valor opcional)
  fixEnable?: Array<{ flag: string; value?: string }>;
};

export const COMPAT_RULES: CompatRule[] = [

  // ─────────────────────────────────────────────
  //  API DirectX — exclusão mútua
  // ─────────────────────────────────────────────
  {
    id: 'dx-conflict-12-11',
    severity: 'error',
    message: '-dx12 e -dx11 marcados simultaneamente',
    detail: 'APIs DirectX são mutuamente exclusivas. O jogo interpreta o último arg ou trava. Mantenha apenas um.',
    when: ['arg:-dx12', 'arg:-dx11'],
    fixDisable: ['arg:-dx11'],
  },
  {
    id: 'dx-conflict-12-vulkan',
    severity: 'error',
    message: '-dx12 e -vulkan marcados simultaneamente',
    detail: '-dx12 força o caminho DX12→VKD3D; -vulkan força Vulkan nativo. São backends diferentes — marque apenas um.',
    when: ['arg:-dx12', 'arg:-vulkan'],
    fixDisable: ['arg:-vulkan'],
  },
  {
    id: 'dx-conflict-11-vulkan',
    severity: 'error',
    message: '-dx11 e -vulkan marcados simultaneamente',
    detail: 'DX11 e Vulkan são caminhos de renderização incompatíveis. Marque apenas o que o jogo suporta.',
    when: ['arg:-dx11', 'arg:-vulkan'],
    fixDisable: ['arg:-vulkan'],
  },
  {
    id: 'display-conflict-full-windowed',
    severity: 'error',
    message: '-fullscreen e -windowed marcados simultaneamente',
    detail: 'Modos de janela mutuamente exclusivos. O jogo pode crashar ou ignorar um deles silenciosamente.',
    when: ['arg:-fullscreen', 'arg:-windowed'],
    fixDisable: ['arg:-windowed'],
  },
  {
    id: 'noborder-requires-windowed',
    severity: 'warning',
    message: '-noborder sem -windowed — sem efeito',
    detail: '-noborder modifica -windowed para criar uma "janela sem borda" (borderless windowed). Sozinho, é ignorado: em -fullscreen exclusivo a janela não tem borda mesmo, e em modo de janela padrão (sem -windowed) o jogo escolhe pelo config.',
    when: ['arg:-noborder', 'arg_off:-windowed'],
    fixEnable: [{ flag: 'arg:-windowed' }],
  },
  {
    id: 'vulkan-vs-vkd3d',
    severity: 'warning',
    message: '-vulkan ativo com VKD3D_CONFIG marcado',
    detail: '-vulkan força o jogo a usar o backend Vulkan nativo (quando suportado, ex: Doom Eternal, RAGE 2). VKD3D só faz sentido para DX12→Vulkan via Proton. Com -vulkan, o jogo nunca passa pelo VKD3D — a flag é ignorada.',
    when: ['arg:-vulkan', 'env:VKD3D_CONFIG'],
    fixDisable: ['env:VKD3D_CONFIG'],
  },

  // ─────────────────────────────────────────────
  //  WineD3D vs DXVK — tornam flags inúteis
  // ─────────────────────────────────────────────
  {
    id: 'wined3d-vs-dxvk-async',
    severity: 'warning',
    message: 'PROTON_USE_WINED3D torna DXVK_ASYNC sem efeito',
    detail: 'WineD3D substitui DXVK completamente, convertendo DX→OpenGL. DXVK_ASYNC só age no pipeline DXVK (DX9/10/11). Com WineD3D ativo a flag é ignorada silenciosamente.',
    when: ['env:PROTON_USE_WINED3D', 'env:DXVK_ASYNC'],
    fixDisable: ['env:DXVK_ASYNC'],
  },
  {
    id: 'wined3d-vs-vkd3d',
    severity: 'error',
    message: 'PROTON_USE_WINED3D incompatível com VKD3D',
    detail: 'VKD3D é o tradutor DX12→Vulkan; WineD3D converte DX→OpenGL. São caminhos mutuamente exclusivos. Com WineD3D ativo, VKD3D_CONFIG é ignorado e jogos DX12 podem cair pra OpenGL emulado (lento/quebrado) ou recusar iniciar.',
    when: ['env:PROTON_USE_WINED3D', 'env:VKD3D_CONFIG'],
    fixDisable: ['env:VKD3D_CONFIG'],
  },
  {
    id: 'wined3d-vs-vkd3d-feature-level',
    severity: 'warning',
    message: 'PROTON_USE_WINED3D torna VKD3D_FEATURE_LEVEL sem efeito',
    detail: 'VKD3D_FEATURE_LEVEL controla nível de feature DX12 exposto pelo VKD3D. Inativo com WineD3D.',
    when: ['env:PROTON_USE_WINED3D', 'env:VKD3D_FEATURE_LEVEL'],
    fixDisable: ['env:VKD3D_FEATURE_LEVEL'],
  },
  {
    id: 'wined3d-vs-dxvk-nvapi',
    severity: 'warning',
    message: 'PROTON_USE_WINED3D torna DXVK_ENABLE_NVAPI sem efeito',
    detail: 'DXVK_ENABLE_NVAPI pertence ao pipeline DXVK, que fica inativo quando WineD3D está habilitado. DLSS/FG não funcionarão por este caminho.',
    when: ['env:PROTON_USE_WINED3D', 'env:DXVK_ENABLE_NVAPI'],
    fixDisable: ['env:DXVK_ENABLE_NVAPI'],
  },
  {
    id: 'wined3d-vs-dxvk-hud',
    severity: 'info',
    message: 'PROTON_USE_WINED3D torna DXVK_HUD sem efeito',
    detail: 'DXVK_HUD só funciona com DXVK ativo. WineD3D não exibe o HUD.',
    when: ['env:PROTON_USE_WINED3D', 'env:DXVK_HUD'],
    fixDisable: ['env:DXVK_HUD'],
  },
  {
    id: 'wined3d-vs-frame-rate',
    severity: 'info',
    message: 'PROTON_USE_WINED3D torna DXVK_FRAME_RATE sem efeito',
    detail: 'DXVK_FRAME_RATE limita FPS no nível DXVK. Com WineD3D essa limitação não existe — use o limitador in-game ou MangoHud.',
    when: ['env:PROTON_USE_WINED3D', 'env:DXVK_FRAME_RATE'],
    fixDisable: ['env:DXVK_FRAME_RATE'],
  },

  // ─────────────────────────────────────────────
  //  NVAPI — cadeia de dependências
  // ─────────────────────────────────────────────
  {
    id: 'nvapi-chain-missing-proton',
    severity: 'warning',
    message: 'DXVK_ENABLE_NVAPI sem PROTON_ENABLE_NVAPI',
    detail: 'DXVK NVAPI depende do NVAPI do Proton estar ativo. Sem PROTON_ENABLE_NVAPI=1, o driver não expõe NVAPI para o processo Wine e DLSS/FG não funcionarão mesmo com DXVK_ENABLE_NVAPI=1.',
    when: ['env:DXVK_ENABLE_NVAPI', 'env_off:PROTON_ENABLE_NVAPI'],
    fixEnable: [{ flag: 'env:PROTON_ENABLE_NVAPI', value: '1' }],
  },
  {
    id: 'nvapi-hide-conflict',
    severity: 'error',
    message: 'PROTON_ENABLE_NVAPI=1 com PROTON_HIDE_NVIDIA_GPU=1 — GPU oculta impede NVAPI',
    detail: 'PROTON_HIDE_NVIDIA_GPU=1 mascara a GPU NVIDIA da detecção do jogo. Isso bloqueia NVAPI, DLSS e Frame Generation — contradiz diretamente PROTON_ENABLE_NVAPI=1.',
    when: ['env:PROTON_ENABLE_NVAPI', 'env:PROTON_HIDE_NVIDIA_GPU=1'],
    fixDisable: ['env:PROTON_HIDE_NVIDIA_GPU'],
  },

  // ─────────────────────────────────────────────
  //  VKD3D / Ray Tracing
  // ─────────────────────────────────────────────
  {
    id: 'dxr-without-dx12',
    severity: 'warning',
    message: 'VKD3D_CONFIG=dxr11 sem -dx12 — raytracing pode não funcionar',
    detail: 'dxr11 habilita extensões Vulkan de RT, mas o jogo precisa usar o caminho DX12 (VKD3D) para aproveitá-las. Se o jogo não for DX12 nativo, adicione -dx12 nos args. Se for DX12 nativo, ignore.',
    when: ['env:VKD3D_CONFIG', 'arg_off:-dx12'],
    fixEnable: [{ flag: 'arg:-dx12' }],
  },

  // ─────────────────────────────────────────────
  //  Gamescope vs flags de display SDL
  // ─────────────────────────────────────────────
  {
    id: 'gamescope-vs-sdl-videodriver',
    severity: 'info',
    message: 'SDL_VIDEODRIVER desnecessário com Gamescope ativo',
    detail: 'Gamescope é um compositor Wayland independente e gerencia o display internamente. SDL_VIDEODRIVER=x11 é um workaround para o compositor padrão KDE/GNOME — com gamescope não tem efeito e pode até atrapalhar.',
    when: ['wrap:gamescope', 'env:SDL_VIDEODRIVER'],
    fixDisable: ['env:SDL_VIDEODRIVER'],
  },
  {
    id: 'gamescope-vs-sdl-fullscreen-displays',
    severity: 'info',
    message: 'SDL_VIDEO_FULLSCREEN_DISPLAYS redundante com Gamescope',
    detail: 'Gamescope controla o monitor de saída via --prefer-output. SDL_VIDEO_FULLSCREEN_DISPLAYS funciona em nível SDL e é geralmente ignorado quando o gamescope gerencia o display. Configure o monitor no painel gamescope.',
    when: ['wrap:gamescope', 'env:SDL_VIDEO_FULLSCREEN_DISPLAYS'],
    fixDisable: ['env:SDL_VIDEO_FULLSCREEN_DISPLAYS'],
  },
  {
    id: 'gamescope-res-arg-wh-conflict',
    severity: 'warning',
    message: 'Gamescope usa -w/-h e formato de resolução "-w/-h" também está marcado',
    detail: 'Gamescope usa os flags -w/-h para resolução interna do jogo. Se você marcar o formato de resolução "-w -h" na seção Forçar Resolução, os valores entram em conflito na string final: o jogo vai receber -w <gamescope> -w <res> e provavelmente crashar.',
    when: ['wrap:gamescope', 'res:w_h'],
    fixDisable: ['res:w_h'],
  },

  // ─────────────────────────────────────────────
  //  Gamescope sem resolução configurada
  // ─────────────────────────────────────────────
  {
    id: 'gamescope-no-output-res',
    severity: 'info',
    message: 'Gamescope ativo sem resolução de saída -W/-H',
    detail: 'Sem -W/-H, gamescope herda a resolução do compositor. Para forçar resolução ultrawide ou corrigir detecção incorreta, configure -W e -H para as dimensões do seu monitor.',
    when: ['wrap:gamescope', 'gs_off:-W'],
    fixEnable: [{ flag: 'gs:-W', value: '3440' }, { flag: 'gs:-H', value: '1440' }],
  },
  {
    id: 'gamescope-no-game-res',
    severity: 'info',
    message: 'Gamescope ativo sem resolução interna -w/-h',
    detail: 'Sem -w/-h, o jogo renderiza na resolução que detectar (pode ser errada). Para forçar a resolução interna do jogo (ex: para evitar que Resident Evil detecte errado), configure -w/-h igual a -W/-H.',
    when: ['wrap:gamescope', 'gs_off:-w'],
    fixEnable: [{ flag: 'gs:-w', value: '3440' }, { flag: 'gs:-h', value: '1440' }],
  },

  // ─────────────────────────────────────────────
  //  ESYNC/FSYNC
  // ─────────────────────────────────────────────
  {
    id: 'esync-fsync-both-disabled',
    severity: 'info',
    message: 'ESYNC e FSYNC desabilitados ao mesmo tempo',
    detail: 'Ambos são mecanismos de sincronização Wine. Desabilitar os dois pode reduzir performance geral. Para diagnóstico, desative um de cada vez: comece por FSYNC, depois tente ESYNC se o problema persistir.',
    when: ['env:PROTON_NO_ESYNC', 'env:PROTON_NO_FSYNC'],
  },

  // ─────────────────────────────────────────────
  //  Gamescope — internos sem externos / refresh sem output
  // ─────────────────────────────────────────────
  {
    id: 'gamescope-game-res-without-output-res',
    severity: 'warning',
    message: 'Gamescope com -w/-h mas sem -W/-H',
    detail: '-w/-h define a resolução INTERNA do jogo dentro do gamescope. Sem -W/-H (resolução de saída no monitor real), o gamescope tenta inferir do compositor pai e geralmente fica em letterbox/pillarbox indesejado. Sempre defina ambos: -w/-h igual a -W/-H para 1:1, ou -W/-H maior para upscale.',
    when: ['wrap:gamescope', 'gs:-w', 'gs_off:-W'],
    fixEnable: [{ flag: 'gs:-W', value: '3440' }, { flag: 'gs:-H', value: '1440' }],
  },
  {
    id: 'gamescope-refresh-without-output',
    severity: 'info',
    message: 'Gamescope -r (refresh) sem -W/-H',
    detail: '-r só tem efeito quando combinado com -W/-H (modo fullscreen no monitor). Sem -W/-H, o refresh é herdado do compositor pai.',
    when: ['wrap:gamescope', 'gs:-r', 'gs_off:-W'],
  },
  {
    id: 'gamescope-fsr-sharpness-without-fsr',
    severity: 'warning',
    message: '--fsr-sharpness sem --filter=fsr',
    detail: '--fsr-sharpness controla nitidez do upscale FSR. Só tem efeito se --filter=fsr também estiver definido. Sem o filtro fsr, o valor é ignorado.',
    when: ['wrap:gamescope', 'gs:--fsr-sharpness', 'gs_off:--filter'],
    fixEnable: [{ flag: 'gs:--filter', value: 'fsr' }],
  },

  // ─────────────────────────────────────────────
  //  VKD3D feature level sem DX12 path
  // ─────────────────────────────────────────────
  {
    id: 'vkd3d-feature-level-without-dx12',
    severity: 'info',
    message: 'VKD3D_FEATURE_LEVEL definido sem -dx12 nem RT',
    detail: 'VKD3D_FEATURE_LEVEL só age quando o jogo usa o caminho DX12 (VKD3D). Sem -dx12 e sem VKD3D_CONFIG=dxr11, o valor não é usado — o jogo segue por DXVK (DX11) ou caminho nativo.',
    when: ['env:VKD3D_FEATURE_LEVEL', 'arg_off:-dx12', 'env_off:VKD3D_CONFIG'],
    fixDisable: ['env:VKD3D_FEATURE_LEVEL'],
  },

  // ─────────────────────────────────────────────
  //  DXVK_FRAME_RATE = 0 (sem limite) configurado
  // ─────────────────────────────────────────────
  {
    id: 'dxvk-frame-rate-zero',
    severity: 'info',
    message: 'DXVK_FRAME_RATE=0 marcado — equivale a desabilitado',
    detail: 'Valor 0 significa "sem limite" (default). Marcar a flag com valor 0 só polui a launch string sem efeito prático. Desmarque para deixar livre.',
    when: ['env:DXVK_FRAME_RATE=0'],
    fixDisable: ['env:DXVK_FRAME_RATE'],
  },

  // ─────────────────────────────────────────────
  //  MangoHud sem MANGOHUD_CONFIG — info amigável
  // ─────────────────────────────────────────────
  {
    id: 'mangohud-without-config',
    severity: 'info',
    message: 'MangoHud ativo sem MANGOHUD_CONFIG personalizado',
    detail: 'O HUD usa ~/.config/MangoHud/MangoHud.conf por padrão. Configure MANGOHUD_CONFIG só se quiser sobrescrever com um arquivo custom por jogo.',
    when: ['wrap:mangohud', 'env_off:MANGOHUD_CONFIG'],
  },

  // ─────────────────────────────────────────────
  //  OpenGL flags sem WineD3D — ignoradas pelo DXVK
  // ─────────────────────────────────────────────
  {
    id: 'gl-maxframes-without-wined3d',
    severity: 'warning',
    message: '__GL_MaxFramesAllowed sem efeito fora do OpenGL',
    detail: '__GL_MaxFramesAllowed é uma hint do driver NVIDIA para OpenGL. Com DXVK ativo (caminho padrão do Proton), o jogo usa Vulkan e a flag é completamente ignorada. Ative PROTON_USE_WINED3D para ela ter efeito — mas isso piora performance em quase todos os casos. Remova a flag.',
    when: ['env:__GL_MaxFramesAllowed', 'env_off:PROTON_USE_WINED3D'],
    fixDisable: ['env:__GL_MaxFramesAllowed'],
  },
  {
    id: 'gl-threaded-without-wined3d',
    severity: 'warning',
    message: '__GL_THREADED_OPTIMIZATIONS sem efeito fora do OpenGL',
    detail: '__GL_THREADED_OPTIMIZATIONS habilita threading no driver OpenGL da NVIDIA. Com DXVK (Vulkan), não tem nenhum efeito. Pode inclusive causar instabilidade em alguns jogos quando herdada pelo processo Wine. Remova a flag.',
    when: ['env:__GL_THREADED_OPTIMIZATIONS', 'env_off:PROTON_USE_WINED3D'],
    fixDisable: ['env:__GL_THREADED_OPTIMIZATIONS'],
  },

  // ─────────────────────────────────────────────
  //  Sugestões de flags complementares
  // ─────────────────────────────────────────────
  {
    id: 'suggest-dxvk-nvapi-with-proton-nvapi',
    severity: 'info',
    message: 'PROTON_ENABLE_NVAPI ativo — considere DXVK_ENABLE_NVAPI=1 também',
    detail: 'Para jogos DX9/10/11 via DXVK, DXVK_ENABLE_NVAPI=1 é necessário para DLSS funcionar. PROTON_ENABLE_NVAPI sozinho não é suficiente nesses casos.',
    when: ['env:PROTON_ENABLE_NVAPI', 'env_off:DXVK_ENABLE_NVAPI', 'arg_off:-dx12'],
    fixEnable: [{ flag: 'env:DXVK_ENABLE_NVAPI', value: '1' }],
  },
];
