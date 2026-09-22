# CLAUDE.md — diretrizes do repositório protondeck (Claude Code)

> **Fonte única de verdade canônica (global):** `~/workspace/AGENTS.md`
> (aplica-se a todos os repos deste ambiente). Se houver divergência,
> **o global vence** e este deve ser corrigido.

## 1. Boot obrigatório (a cada sessão)
1. Leia a fonte canônica global `~/workspace/AGENTS.md` (SDD/TDD, `model_routing`,
   segurança OWASP, convenções por stack, remote de repos).
2. Leia o índice de memória `/mnt/c/Users/rafael/ObsidianVault/agent-memory/MEMORY.md`
   quando precisar de contexto arquitetural/histórico.

## 2. Este repositório
**protondeck** — App desktop (Electron) de configs Proton da biblioteca Steam — IPC + Vue 3 + SQLite (better-sqlite3). (protondeck) (stack: `node`).

### Build / teste
- `npm run build`
- `npm run test`
- `npm run lint`

## 3. Todo o restante do processo
Siga o canônico global `~/workspace/AGENTS.md`:
- **TDD estrito**: teste em Red antes do código; nunca alterar teste sem `"UPDATE SPECIFICATION"`.
- **SDD**: não escrever código de feature (Track A/B) sem artefatos aprovados; Chore/Track C dispensa.
- **Racional**: propor solução + 2 alternativas com trade-offs antes de codar.
- Diagramas de arquitetura/fluxo em **ASCII**, nunca Mermaid.
- **Git Hygiene**: commit atômico por task, Conventional Commits.
- **Remote**: **todos** os repositórios no **GitHub** (`github.com/rmarquespaixao-eng`).

## 4. ARQUIVOS DE DIRETRIZES POR CLI
- **codex / opencode / Cursor:** `AGENTS.md` (raiz)
- **Claude Code:** `CLAUDE.md`
- **GitHub Copilot (VS Code):** `.github/copilot-instructions.md` e `.github/AGENTS.md`

