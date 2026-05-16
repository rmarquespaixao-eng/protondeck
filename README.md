# ProtonDeck

Plataforma self-hosted de curadoria Proton pra Linux gamers. Combina Steam
Web API, ProtonDB, PCGamingWiki e detec&ccedil;&atilde;o de hardware local
pra te ajudar a configurar jogos com Proton, verificar compatibilidade antes
de comprar, e instalar o stack de gaming na sua distro.

Stack: Fastify 5 + TypeScript + better-sqlite3 + EJS (server-rendered, sem SPA).
Arquitetura hexagonal — domain puro / ports / use cases / adapters separados.

## Screenshots

| Dashboard                                | Builder de launch options (Evil West)  |
|------------------------------------------|----------------------------------------|
| ![Dashboard](docs/screenshots/02-dashboard.png) | ![Game detail](docs/screenshots/04-game-detail.png) |

| "Vai rodar?" — Resident Evil 4           | Wizard de pacotes                      |
|------------------------------------------|----------------------------------------|
| ![Check RE4](docs/screenshots/06-check-detail.png) | ![System wizard](docs/screenshots/07-system.png) |

| Biblioteca                               | Backup &amp; Import                    |
|------------------------------------------|----------------------------------------|
| ![Games](docs/screenshots/03-games.png)  | ![Backup](docs/screenshots/08-backup.png) |

| "Vai rodar?" (busca vazia)               | Login                                  |
|------------------------------------------|----------------------------------------|
| ![Check empty](docs/screenshots/05-check-empty.png) | ![Login](docs/screenshots/01-login.png) |

Pra regenerar os screenshots ap&oacute;s mudan&ccedil;as na UI:

```bash
npm run dev &                       # outro terminal
node scripts/screenshots.mjs        # gera docs/screenshots/*.png
```

Script usa Playwright + Chromium headless. Faz login com o user/senha em
`PD_USER` / `PD_PASSWORD` (defaults `admin` / `1354a52a`).

## O que tem

| Area                          | URL          | O que faz                                                                                     |
|-------------------------------|--------------|-----------------------------------------------------------------------------------------------|
| **Dashboard**                 | `/`          | stats da biblioteca, distribui&ccedil;&atilde;o por tier ProtonDB, atalhos pros principais fluxos. |
| **Biblioteca**                | `/games`     | tabela filtravel da Steam library: tier, engine detectada, Proton version, override pessoal. |
| **Editor de launch options**  | `/game/:appid` | builder visual com checkboxes pra gamescope, env vars (DXVK/VKD3D/Proton/NVIDIA), args, presets por engine, preview ao vivo, diagnostico de conflitos, assistente IA. |
| **PCGamingWiki widescreen**   | (dentro do `/game/:appid`) | suporte a widescreen 16:9 / ultra-widescreen 21:9 / multi-monitor / 4K / FOV, com notas extraidas da wiki. |
| **"Vai rodar?"**              | `/check`     | busca jogo na Steam por nome (mesmo que nao esteja na biblioteca) e cruza ProtonDB + PCGW + Steam Store; retorna recomendacao em 5 niveis (go / caution / risky / unreleased / no-data). [diagrama de fluxo abaixo](#fluxo-vai-rodar-check) |
| **Wizard de pacotes**         | `/system`    | detecta distro (Arch/CachyOS, Ubuntu/Debian, Fedora) + GPU e instala em tempo real via SSE o stack Proton (gamescope, mangohud, gamemode, Vulkan, Steam, protontricks). |
| **Backup &amp; Import**       | `/backup`    | exporta seus overrides em JSON; importa com preview antes de aplicar.                       |
| **Aplicar direto no Steam**   | botao em `/game/:appid` | edita `~/.steam/steam/userdata/&lt;id&gt;/config/localconfig.vdf` com backup automatico e barreira se o cliente Steam estiver rodando. |
| **Auth single-user**          | `/setup` &rarr; `/login` | bcrypt + sess&atilde;o assinada via `@fastify/secure-session`.                    |

## Arquitetura

Hexagonal cl&aacute;ssica (ports &amp; adapters de Cockburn) com camadas
**domain / application / adapters**.

```mermaid
flowchart LR
    subgraph in["adapters/in (driving)"]
        HTTP["HTTP / Fastify<br/>routes + views"]
        CLI["CLI<br/>sync.command"]
    end

    subgraph app["application"]
        direction TB
        PIN["ports/in<br/>UseCase interfaces"]
        SVC["services<br/>Games / Dashboard / Check<br/>PCGW / System / Backup<br/>Auth / SteamApply / Sync / AI"]
        POUT["ports/out<br/>Repository &amp; Client interfaces"]
        PIN -. implements .- SVC
        SVC --> POUT
    end

    DOM["domain<br/>(funções puras, zero I/O)<br/>LaunchOptions · VdfParser<br/>ConfigCatalog · CompatibilityRules<br/>Recommendation · WidescreenInfo<br/>Recipes · SudoersTemplate"]

    subgraph out["adapters/out (driven)"]
        SQLITE["SQLite repos<br/>1 por dom&iacute;nio"]
        HTTPC["HTTP clients<br/>PCGW · ProtonDB · Steam"]
        AI["AI providers<br/>Anthropic · OpenAI · Ollama"]
        FS["Filesystem<br/>localconfig.vdf · proton-log"]
        SYS["System<br/>detect · sudo runner"]
    end

    HTTP --> PIN
    CLI --> PIN
    SVC --> DOM
    POUT -. implements .- SQLITE
    POUT -. implements .- HTTPC
    POUT -. implements .- AI
    POUT -. implements .- FS
    POUT -. implements .- SYS
```

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

## Tarball (recomendado pra uso completo)

Pra rodar com TODAS as features (incluindo wizard de pacotes, sync,
apply Steam, proton log) o painel precisa de acesso ao host — Docker
isola e bloqueia tudo isso. Use o tarball release:

### Gerar o tarball (no repo)

```bash
npm run release
# gera dist-release/protondeck-<version>.tar.gz (~22 MB)
```

### Instalar (na máquina alvo)

```bash
tar xzf protondeck-0.1.0.tar.gz
cd protondeck-0.1.0
./install.sh
```

O `install.sh`:

- copia tudo pra `~/.local/share/protondeck/` (override via `PROTONDECK_HOME`);
- gera `.env` com `SESSION_KEY` aleat&oacute;ria (64 hex chars);
- cria `~/.config/systemd/user/protondeck.service`;
- preserva `data/` e `.env` em re-execu&ccedil;&otilde;es (upgrade).

Pra subir:

```bash
systemctl --user enable --now protondeck   # roda agora + ao boot
systemctl --user status protondeck         # ver estado
journalctl --user -u protondeck -f         # logs
```

Pra rodar mesmo ap&oacute;s logout (background persistente em servidor sem GUI):

```bash
sudo loginctl enable-linger $USER
```

### Atualizar

```bash
tar xzf protondeck-0.2.0.tar.gz
cd protondeck-0.2.0
./install.sh           # detecta install existente, preserva data/ e .env
systemctl --user restart protondeck
```

### Desinstalar

```bash
~/.local/share/protondeck/uninstall.sh
# pergunta se quer manter ou apagar data/ (panel.db)
```

### Node manager (fnm / nvm / asdf)

O `ExecStart` da unit aponta pra `run.sh` — um wrapper que resolve o `node`
**em runtime**, n&atilde;o no install. Cobre, em ordem:

1. **fnm** — symlink `~/.local/share/fnm/aliases/default` (estavel; atualiza
   sozinho quando voc&ecirc; troca via `fnm alias default`).
2. **nvm** — `~/.nvm/alias/default` (resolve cadeia `default → lts/iron → vX.Y.Z`).
3. **asdf** — `~/.asdf/shims/node` (shims sao estaveis).
4. **PATH** — fallback pro `node` que estiver no PATH.

Isso significa que voc&ecirc; pode trocar de vers&atilde;o Node depois do
install que o service continua funcionando. S&oacute; precisa reinstalar
se mudar de **manager** (ex: migrar de nvm pra fnm).

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

## Fluxo "Vai rodar?" (`/check`)

```mermaid
sequenceDiagram
    actor User
    participant UI as Browser /check
    participant API as ProtonDeck API
    participant Steam as Steam Search
    participant Store as Steam Store
    participant Proton as ProtonDB
    participant PCGW as PCGamingWiki

    User->>UI: busca "resident evil 4"
    UI->>API: GET /api/check/search?q=...
    API->>Steam: SearchApps(query)
    Steam-->>API: appid + nome + logo
    API-->>UI: lista de resultados
    UI-->>User: mostra hits clic&aacute;veis

    User->>UI: clica num resultado
    UI->>API: GET /api/check/:appid

    par fetches paralelos
        API->>Store: appdetails
        Store-->>API: plataformas, pre&ccedil;o, release
    and
        API->>Proton: summary(appid)
        Proton-->>API: tier + confidence + total
    and
        API->>PCGW: parse Video infobox
        PCGW-->>API: widescreen / ultrawide / FOV
    end

    Note over API: computeRecommendation()<br/>(dom&iacute;nio puro)
    API-->>UI: CheckResult + recomenda&ccedil;&atilde;o
    UI-->>User: badge go/caution/risky + raz&otilde;es
```

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

Schema flat — sem foreign keys entre tabelas. `games` agrega tudo que importa
por jogo; o resto e' singleton ou cache:

```mermaid
erDiagram
    games {
        text appid PK
        text name
        int installed
        text install_path
        int playtime_minutes
        text last_played
        text tier
        text trending_tier
        text confidence
        int reports
        text engine
        text engine_source
        text proton
        text launch_options
        text config_source
        text notes_json
        text user_launch_options
        text user_notes
        text updated_at
    }
    snapshots {
        int id PK
        text generated_at
        text steam_id64
        int game_count
        text raw_json
    }
    system_info {
        int id PK
        text detected_at
        text payload_json
    }
    users {
        int id PK
        text username UK
        text password_hash
        text created_at
    }
    ai_config {
        int id PK
        text provider
        text model
        text api_key
        text base_url
        text updated_at
    }
    ai_cache {
        text cache_key PK
        text payload
        text created_at
    }
    steam_config {
        int id PK
        text api_key
        text steam_id64
        text updated_at
    }
    pcgw_cache {
        text appid PK
        text payload
        text fetched_at
        int status
    }
    external_cache {
        text scope PK
        text cache_key PK
        text payload
        text fetched_at
        int status
    }
```
