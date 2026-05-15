# ProtonDeck

Dashboard self-hosted das configs Proton da biblioteca Steam. Cruza Steam Web API + ProtonDB
+ detec&ccedil;&atilde;o de hardware local, mostra tudo em uma tabela filtrav&eacute;l, deixa
voc&ecirc; sobrescrever launch options por jogo, persiste tudo em SQLite.

Stack: Fastify 5 + TypeScript + better-sqlite3 + EJS (server-rendered, sem SPA).

## Pre-requisitos

1. A skill `steam-launch` instalada em `~/.claude/tools/steam-launch/` (ou symlinked do
   repo `claude-skills`).
2. `credentials.json` configurado em `~/.claude/tools/steam-launch/data/credentials.json`:

   ```json
   {
     "steam_api_key": "...",
     "steam_id64": "..."
   }
   ```

3. Node.js 20+.

## Setup

```bash
npm install
cp .env.example .env
# Gere a chave de sessao (32 bytes hex) e cole em SESSION_KEY no .env:
openssl rand -hex 32
npm run sync     # popula data/panel.db com o snapshot inicial (chama steam-launch)
npm run dev      # http://localhost:3030
```

No primeiro acesso, o painel redireciona pra `/setup` pra criar a conta admin
(user/senha persistidos no SQLite com bcrypt). Single-user: nao tem cadastro
aberto, so o admin inicial. Pra resetar, apague a linha em `users`:

```bash
sqlite3 data/panel.db "DELETE FROM users;"
```

## Workflow

| Quando                          | Rode                                  |
|---------------------------------|---------------------------------------|
| Comprou jogo novo               | `npm run sync` (ou bot&atilde;o "Sync" na UI) |
| Editou config de um jogo na UI  | Salva no SQLite via form              |
| Quer ver overrides persistidos  | `sqlite3 data/panel.db "select appid, name, user_launch_options from games where user_launch_options is not null;"` |

## Schema

- `games` — uma linha por jogo da biblioteca, com snapshot ProtonDB + launch options
  geradas + colunas `user_launch_options` / `user_notes` que sobrevivem aos syncs.
- `snapshots` — historico de cada sync (raw JSON).
- `system_info` — uma linha singleton com hardware/monitor detectado no ultimo sync.
- `users` — conta admin (single-user), `password_hash` bcrypt.

## Estrutura

```
src/
  server.ts            # Fastify + view + static
  db.ts                # better-sqlite3 + migrations
  sync.ts              # CLI: chama steam-launch, popula SQLite
  routes/
    index.ts           # GET /
    game.ts            # GET /game/:appid, POST /game/:appid, POST /sync
  views/               # EJS templates
  public/style.css
data/panel.db          # gitignored
```
