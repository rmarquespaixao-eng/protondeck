# ProtonDeck

Plataforma self-hosted de curadoria Proton pra Linux gamers. Combina Steam
Web API, ProtonDB, PCGamingWiki e detec&ccedil;&atilde;o de hardware local
pra te ajudar a configurar jogos com Proton, verificar compatibilidade antes
de comprar, e instalar o stack de gaming na sua distro.

Stack: Fastify 5 + TypeScript + better-sqlite3 + EJS (server-rendered, sem SPA).
Arquitetura hexagonal — domain puro / ports / use cases / adapters separados.

## O que tem

| Area                          | URL          | O que faz                                                                                     |
|-------------------------------|--------------|-----------------------------------------------------------------------------------------------|
| **Dashboard**                 | `/`          | stats da biblioteca, distribui&ccedil;&atilde;o por tier ProtonDB, atalhos pros principais fluxos. |
| **Biblioteca**                | `/games`     | tabela filtravel da Steam library: tier, engine detectada, Proton version, override pessoal. |
| **Editor de launch options**  | `/game/:appid` | builder visual com checkboxes pra gamescope, env vars (DXVK/VKD3D/Proton/NVIDIA), args, presets por engine, preview ao vivo, diagnostico de conflitos, assistente IA. |
| **PCGamingWiki widescreen**   | (dentro do `/game/:appid`) | suporte a widescreen 16:9 / ultra-widescreen 21:9 / multi-monitor / 4K / FOV, com notas extraidas da wiki. |
| **"Vai rodar?"**              | `/check`     | busca jogo na Steam por nome (mesmo que nao esteja na biblioteca) e cruza ProtonDB + PCGW + Steam Store; retorna recomendacao em 5 niveis (go / caution / risky / unreleased / no-data). |
| **Wizard de pacotes**         | `/system`    | detecta distro (Arch/CachyOS, Ubuntu/Debian, Fedora) + GPU e instala em tempo real via SSE o stack Proton (gamescope, mangohud, gamemode, Vulkan, Steam, protontricks). |
| **Backup &amp; Import**       | `/backup`    | exporta seus overrides em JSON; importa com preview antes de aplicar.                       |
| **Aplicar direto no Steam**   | botao em `/game/:appid` | edita `~/.steam/steam/userdata/&lt;id&gt;/config/localconfig.vdf` com backup automatico e barreira se o cliente Steam estiver rodando. |
| **Auth single-user**          | `/setup` &rarr; `/login` | bcrypt + sess&atilde;o assinada via `@fastify/secure-session`.                    |

## Arquitetura

Hexagonal cl&aacute;ssica (ports &amp; adapters de Cockburn) com camadas
**domain / application / adapters**:

```
src/
  domain/                          entidades + funcoes puras (zero I/O)
    games/                         LaunchOptions, ConfigCatalog, CompatibilityRules, VdfParser
    check/                         CheckResult, ProtonReport, Recommendation
    pcgw/                          WidescreenInfo
    system/                        Recipes, SudoersTemplate, SystemTypes

  application/                     a "hexagon" — orquestra o dominio
    ports/
      in/                          inbound (primary/driving) ports — interfaces
                                   dos use cases que o mundo externo chama:
                                   GamesUseCase, DashboardUseCase, CheckUseCase,
                                   PCGWUseCase, SystemUseCase, BackupUseCase,
                                   AuthUseCase, SteamApplyUseCase, SyncUseCase, AIUseCase
      out/                         outbound (secondary/driven) ports —
                                   interfaces que a application REQUER:
                                   GameRepository, UserRepository,
                                   AIConfigRepository, SteamConfigRepository,
                                   CacheRepository, SnapshotRepository,
                                   SystemInfoRepository, PCGWClient,
                                   CheckClients, ProtonDBCommunityClient,
                                   SteamLocalConfigClient, ProtonLogReader,
                                   SystemDetector, SystemRunner
    services/                      implementacoes dos inbound ports
                                   (GamesService implements GamesUseCase, etc)

  adapters/
    in/                            inbound adapters — driving
                                   (chamam os ports/in/)
      http/                        Fastify Server.ts + routes/ + views/ + public/
      cli/                         sync.command.ts
    out/                           outbound adapters — driven
                                   (implementam os ports/out/)
      persistence/sqlite/          connection.ts + 1 repo por dominio
      http-clients/                PCGWMediaWiki, ProtonDB (summary + community),
                                   SteamSearch, SteamStore
      ai/                          AIProvider (Anthropic/OpenAI/Ollama) + Prompts + Tools
      fs/                          SteamLocalConfigFs, ProtonLogFs
      system/                      LinuxSystemDetector, SudoSystemRunner
      shared/                      fetch helper

  composition.ts                   monta o grafo de deps (composition root)
  main.ts                          entry point HTTP
```

Regras de depend&ecirc;ncia:

- **`domain/`** n&atilde;o importa de ningu&eacute;m.
- **`application/`** importa s&oacute; de `domain/` e dos pr&oacute;prios
  `application/ports/`.
- **`adapters/in/`** chama `application/ports/in/` (use cases).
- **`adapters/out/`** implementa `application/ports/out/`.
- **`composition.ts`** é o &uacute;nico arquivo que instancia adapters
  concretos e injeta no grafo.

Trocar SQLite por Postgres mexe s&oacute; em `adapters/out/persistence/`.
Trocar Anthropic por Bedrock mexe s&oacute; em `adapters/out/ai/`. Adicionar
uma CLI nova mexe s&oacute; em `adapters/in/cli/`.

## Setup (desenvolvimento)

```bash
git clone ssh://git@gitea.homelab-cloud.com:2222/admin/protondeck.git
cd protondeck
npm install
cp .env.example .env
echo "SESSION_KEY=$(openssl rand -hex 32)" >> .env

# Popula data/panel.db chamando o skill steam-launch
npm run sync

# Sobe em http://localhost:3030
npm run dev
```

Requisitos:

- Node.js &ge; 20.12 (precisa do `process.loadEnvFile`)
- Skill `steam-launch` instalada em `~/.claude/tools/steam-launch/` (ou path em `STEAM_LAUNCH_TOOL`)
- `credentials.json` em `~/.claude/tools/steam-launch/data/` com `steam_api_key` + `steam_id64`

No primeiro acesso o painel redireciona pra `/setup` pra criar a conta admin.
Single-user — n&atilde;o tem cadastro aberto. Pra resetar:

```bash
sqlite3 data/panel.db "DELETE FROM users;"
```

### Wizard de pacotes — sudoers (uma vez)

Pra evitar prompt de senha a cada install, o painel precisa de um
`/etc/sudoers.d/protondeck` com whitelist restrita (s&oacute; subcomandos de
install/sync — n&atilde;o permite `-R` nem `-U`). Abra `/system` na UI que
ele gera o comando exato pra sua distro/usuario; rode no terminal:

```bash
sudo tee /etc/sudoers.d/protondeck > /dev/null <<'EOF'
USER ALL=(root) NOPASSWD: /usr/bin/pacman -S --needed --noconfirm *
# ... resto gerado dinamicamente pela tela
EOF
sudo chmod 440 /etc/sudoers.d/protondeck
sudo visudo -c -f /etc/sudoers.d/protondeck
```

### Aplicar direto no Steam — requer cliente fechado

A rota `POST /api/game/:appid/apply-steam` edita o `localconfig.vdf` e faz
backup `.protondeck.bak`. **Se o Steam estiver rodando**, o cliente
sobrescreve o arquivo ao fechar — o painel detecta isso via `pgrep -x steam`
e bloqueia o write com mensagem clara.

## Docker

```bash
# 1. Configura env
echo "SESSION_KEY=$(openssl rand -hex 32)" > .env

# 2. Sobe
docker compose up -d
# (primeiro build ~2 min — compila better-sqlite3 nativo)

# 3. Abre http://localhost:3030

# Logs
docker compose logs -f protondeck

# Parar
docker compose down
```

Variaveis de ambiente (alem do `SESSION_KEY` obrigatorio):

| Var                          | Default                       | O que faz                                    |
|------------------------------|-------------------------------|----------------------------------------------|
| `PORT`                       | `3030`                        | porta HTTP                                   |
| `HOST`                       | `0.0.0.0` no container        | bind address                                 |
| `NODE_ENV`                   | `development`                 | em `production` o cookie sai com `Secure`    |
| `PROTONDECK_DB`              | `/app/data/panel.db`          | path do SQLite                               |
| `PROTONDECK_COMMUNITY_CACHE` | `/app/data/community-cache`   | cache dos relatos ProtonDB                   |

Persist&ecirc;ncia: o `docker-compose.yml` mont&aacute; `./data` em `/app/data`,
ent&atilde;o `panel.db` + caches sobrevivem ao restart.

### Limita&ccedil;&otilde;es do Docker

A imagem &eacute; auto-contida, mas algumas features dependem do **host**:

| Feature                  | Funciona no container? | Por qu&ecirc;                                                             |
|--------------------------|------------------------|---------------------------------------------------------------------------|
| Dashboard / Biblioteca   | sim                    | s&oacute; le do SQLite local                                              |
| Editor de launch options | sim                    | pura logica + ProtonDB API publica                                        |
| `/check`                 | sim                    | chama APIs publicas (Steam search/store, ProtonDB, PCGW)                  |
| Backup &amp; Import      | sim                    | s&oacute; le/escreve no SQLite local                                      |
| **Wizard de pacotes**    | **n&atilde;o**         | precisa de `pacman/apt/dnf` + `sudo` + `/etc/os-release` **do host**     |
| **Apply no Steam**       | **parcial**            | precisa montar `~/.steam` como volume + Steam fechado                    |
| **Sync biblioteca**      | **n&atilde;o**         | precisa do skill local `steam-launch` (n&atilde;o vem na imagem)         |

Pra cobrir o caso de uso completo (com wizard + sync), rode direto em
`npm run dev` no host. O Docker &eacute; ideal pra expor o painel num
servidor remoto (ex.: VPS) cobrindo as features que n&atilde;o dependem
do host.

## Testes

Cobertura m&iacute;nima focada em domain (fun&ccedil;&otilde;es puras) e
application services (com fakes in-memory dos outbound ports):

```bash
npm test           # roda todos os *.test.ts em src/
npm run typecheck  # inclui os testes na verifica&ccedil;&atilde;o de tipos
```

Stack: **`node:test`** (built-in do Node 20+) com **`tsx`** como loader.
Zero deps de teste. Fakes em `src/test/fakes/` implementam os outbound
ports, ent&atilde;o services s&atilde;o testados sem mexer no SQLite ou em
APIs externas.

Atualmente cobre (94 testes em 14 arquivos):

**Domain (33 testes):**
- **`domain/games/LaunchOptions`** (6) — parser do launch string (env vars, gamescope, args, resolu&ccedil;&atilde;o forced)
- **`domain/games/VdfParser`** (10) — leitura/escrita do `localconfig.vdf` do Steam (com round-trip)
- **`domain/check/Recommendation`** (10) — todos os 5 caminhos de recomenda&ccedil;&atilde;o (go/caution/risky/unreleased/no-data)
- **`domain/system/SudoersTemplate`** (7) — gera&ccedil;&atilde;o por distro + whitelist estrita (nao permite `-R`/`-U`)

**Application services (61 testes):**
- **`GamesService`** (8) — list/get/saveLaunch/clearNotes/etc
- **`AuthService`** (9) — bcrypt + valida&ccedil;&otilde;es de senha/usu&aacute;rio
- **`BackupService`** (7) — export/validate/plan/apply
- **`DashboardService`** (2) — stats consolidadas
- **`CheckService`** (6) — orquestra search + ProtonDB + Store + PCGW, valida 5 recomenda&ccedil;&otilde;es
- **`PCGWService`** (2) — passthrough (delega&ccedil;&atilde;o + force option)
- **`SystemService`** (7) — scan, groupStatuses (filtro por GPU), sudoersTemplate, buildInstallArgs, runSudoSequence
- **`SteamApplyService`** (9) — describe (configured/available/steamRunning) + apply (jogo inexistente, sem override, sem creds, sucesso, steam rodando)
- **`SyncService`** (5) — applySnapshot (upsert + snapshot record + system_info + enrichDefaults + preserva user fields)
- **`AIService`** (6) — get/setConfig, readProtonLog, valida&ccedil;&otilde;es de pre-condi&ccedil;&atilde;o, cache hit determin&iacute;stico via SHA-256

## Workflow

| Quando                              | Rode                                                          |
|-------------------------------------|---------------------------------------------------------------|
| Comprou jogo novo                   | `npm run sync` (ou bot&atilde;o "Sync" na sidebar)            |
| Editou config de um jogo na UI      | Salva no SQLite via form                                      |
| Quer ver overrides persistidos      | `sqlite3 data/panel.db "select appid, name, user_launch_options from games where user_launch_options is not null;"` |
| Pensando em comprar um jogo         | `/check` busca por nome e consolida ProtonDB + PCGW + Store   |
| Trocando de PC                      | `/backup` exporta JSON; importe na maquina nova               |
| Setup inicial em distro nova        | `/system` detecta e instala stack de gaming Proton            |

## Schema do banco

- `games` — uma linha por jogo da biblioteca, com snapshot ProtonDB + launch
  options geradas + colunas `user_launch_options` / `user_notes` que
  sobrevivem aos syncs.
- `snapshots` — historico de cada sync (raw JSON).
- `system_info` — singleton com hardware/monitor detectado no ultimo sync.
- `users` — conta admin (single-user), `password_hash` bcrypt.
- `ai_config` / `ai_cache` — provider e cache de respostas IA.
- `steam_config` — credenciais Steam (`api_key` + `steam_id64`).
- `pcgw_cache` — cache de paginas do PCGamingWiki (7d hits / 1d falhas).
- `external_cache` — cache generico (ProtonDB, Steam Store, Steam Search).
