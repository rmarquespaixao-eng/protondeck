# ProtonDeck

Plataforma self-hosted de curadoria Proton: cruza Steam Web API + ProtonDB +
PCGamingWiki + detec&ccedil;&atilde;o de hardware local, deixa voc&ecirc;
sobrescrever launch options por jogo via builder visual, verifica
compatibilidade de jogos antes de comprar, instala o stack de gaming Proton na
sua distro e aplica config direto no `localconfig.vdf` do Steam.

Stack: Fastify 5 + TypeScript + better-sqlite3 + EJS (server-rendered, sem SPA).

## Features

- **Dashboard** (`/`) — stats da biblioteca, distribui&ccedil;&atilde;o por tier
  ProtonDB, atalhos pros principais fluxos.
- **Biblioteca** (`/games`) — tabela filtravel da Steam library com tier
  ProtonDB, engine detectada, Proton version, override pessoal por jogo.
- **Builder de launch options** (`/game/:appid`) — checkboxes pra gamescope,
  env vars (DXVK, VKD3D, Proton, NVIDIA), args, presets por engine, preview ao
  vivo, diagnostico de conflitos via COMPAT_RULES e assistente IA (Anthropic /
  OpenAI / Ollama).
- **Detector PCGamingWiki** — em cada jogo, mostra suporte a widescreen 16:9 /
  ultra-widescreen 21:9 / multi-monitor / 4K / FOV, com notas extraidas da
  wiki (`Use REFramework + mod X`, etc).
- **"Vai rodar?"** (`/check`) — busca jogo na Steam por nome e cruza ProtonDB
  + PCGW + Steam Store; retorna recomenda&ccedil;&atilde;o em 5 niveis
  (go / caution / risky / unreleased / no-data).
- **Wizard de pacotes** (`/system`) — detecta distro (Arch/CachyOS,
  Ubuntu/Debian, Fedora) + GPU e instala em tempo real via SSE o stack
  Proton: gamescope, mangohud, gamemode, Vulkan, Steam, protontricks.
  Segurança via sudoers whitelist (sem daemon root, sem shell arbitrario).
- **Backup &amp; Import** (`/backup`) — exporta seus overrides em JSON;
  importa com preview antes de aplicar.
- **Aplicar direto no Steam** — botao no detalhe do jogo edita o
  `~/.steam/steam/userdata/<id>/config/localconfig.vdf`, com backup
  automatico e b&aacute;rrera se o cliente Steam estiver rodando.
- **Auth single-user** — login/setup com bcrypt, sess&atilde;o assinada via
  `@fastify/secure-session`.

## Pre-requisitos

1. A skill `steam-launch` instalada em `~/.claude/tools/steam-launch/` (ou
   symlinked do repo `claude-skills`).
2. `credentials.json` configurado em
   `~/.claude/tools/steam-launch/data/credentials.json`:

   ```json
   {
     "steam_api_key": "...",
     "steam_id64": "..."
   }
   ```

3. Node.js 20.12+ (precisa do `process.loadEnvFile`).

## Setup

```bash
npm install
cp .env.example .env
# Gera a chave de sessao (32 bytes hex) e adiciona no .env:
echo "SESSION_KEY=$(openssl rand -hex 32)" >> .env
npm run sync     # popula data/panel.db com o snapshot inicial (chama steam-launch)
npm run dev      # http://localhost:3030
```

O `.env` é carregado automaticamente via `process.loadEnvFile()`. Tambem da
pra exportar `SESSION_KEY` direto no shell em vez de usar `.env`.

No primeiro acesso, o painel redireciona pra `/setup` pra criar a conta admin
(user/senha persistidos no SQLite com bcrypt). Single-user: nao tem cadastro
aberto, so o admin inicial. Pra resetar, apague a linha em `users`:

```bash
sqlite3 data/panel.db "DELETE FROM users;"
```

### Wizard de pacotes — sudoers (uma vez)

Pra evitar prompt de senha a cada install, o painel precisa de um arquivo em
`/etc/sudoers.d/protondeck` com whitelist restrita (so subcomandos de
install/sync do pkg manager — nao permite `-R` nem `-U`). Abra `/system` na UI
que ele gera o comando exato pra sua distro/usuario; rode no terminal:

```bash
sudo tee /etc/sudoers.d/protondeck > /dev/null <<'EOF'
USER ALL=(root) NOPASSWD: /usr/bin/pacman -S --needed --noconfirm *
# ... resto gerado dinamicamente
EOF
sudo chmod 440 /etc/sudoers.d/protondeck
sudo visudo -c -f /etc/sudoers.d/protondeck
```

### Aplicar no Steam — requer cliente fechado

A rota `POST /api/game/:appid/apply-steam` edita o `localconfig.vdf` e faz
backup `.protondeck.bak`. **Se o Steam estiver rodando**, o cliente sobrescreve
o arquivo ao fechar — o painel detecta isso via `pgrep -x steam` e bloqueia o
write com mensagem clara.

## Workflow

| Quando                              | Rode                                                          |
|-------------------------------------|---------------------------------------------------------------|
| Comprou jogo novo                   | `npm run sync` (ou bot&atilde;o "Sync" na sidebar)            |
| Editou config de um jogo na UI      | Salva no SQLite via form                                      |
| Quer ver overrides persistidos      | `sqlite3 data/panel.db "select appid, name, user_launch_options from games where user_launch_options is not null;"` |
| Pensando em comprar um jogo         | `/check` busca por nome e consolida ProtonDB + PCGW + Store   |
| Trocando de PC                      | `/backup` exporta JSON; importe na maquina nova               |
| Setup inicial em distro nova        | `/system` detecta e instala stack de gaming Proton            |

## Schema

- `games` — uma linha por jogo da biblioteca, com snapshot ProtonDB + launch
  options geradas + colunas `user_launch_options` / `user_notes` que
  sobrevivem aos syncs.
- `snapshots` — historico de cada sync (raw JSON).
- `system_info` — uma linha singleton com hardware/monitor detectado no
  ultimo sync.
- `users` — conta admin (single-user), `password_hash` bcrypt.
- `ai_config` / `ai_cache` — provider e cache de respostas IA.
- `steam_config` — credenciais Steam (api_key + steam_id64).
- `pcgw_cache` — cache de paginas do PCGamingWiki (7d hits / 1d falhas).
- `external_cache` — cache generico (ProtonDB, Steam Store, Steam Search).

## Estrutura

```
src/
  server.ts              # Fastify + view + static + secure-session
  db.ts                  # better-sqlite3 + migrations + helpers
  sync.ts                # CLI: chama steam-launch, popula SQLite
  check.ts               # consolidador Steam search + ProtonDB + Store
  pcgw.ts                # scraper MediaWiki da PCGamingWiki
  launch-parser.ts       # parser bidirecional de launch options
  steam-localconfig.ts   # parser/writer do VDF do Steam
  ai-provider.ts         # client multi-provider (Anthropic/OpenAI/Ollama)
  ai-prompts.ts          # system prompts especializados
  ai-tools.ts            # tool definitions pra agent (proton log etc)
  config-catalog.ts      # opts conhecidas (env, args, gamescope, engines)
  compatibility-rules.ts # COMPAT_RULES (conflitos entre opts)
  protondb-community.ts  # API de relatos individuais ProtonDB
  proton-log.ts          # auto-read de PROTON_LOG=1 logs
  system/
    detect.ts            # distro, GPU vendor, libs instaladas
    recipes.ts           # catalogo de pacotes por distro/GPU
    runner.ts            # spawn sudo -n com stream line-by-line
    sudoers.ts           # gera template /etc/sudoers.d/protondeck
  routes/
    index.ts             # GET / (dashboard), GET /games
    game.ts              # GET/POST /game/:appid, sync, apply-steam, widescreen
    config.ts            # legacy redirect 301 -> /game/:appid
    auth.ts              # /setup, /login, /logout
    ai.ts                # /api/game/:appid/{diagnose,suggest,troubleshoot}
    steam.ts             # /settings/steam
    check.ts             # /check, /api/check/search, /api/check/:appid
    system.ts            # /system, /api/system/{scan,install,sudoers}
    backup.ts            # /backup, /api/backup/{export,import}
  views/                 # EJS templates
  public/style.css
  types/fastify.d.ts     # type augmentation pra session + currentUser
data/                    # gitignored: panel.db + community-cache
```
