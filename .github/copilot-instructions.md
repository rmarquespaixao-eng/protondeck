# Instruções do repositório protondeck — GitHub Copilot (VS Code)

> **Fonte única de verdade canônica (global):** `~/workspace/AGENTS.md`
> (aplica-se a todos os repos deste ambiente). Se houver divergência,
> **o global vence** e este deve ser corrigido.

## Boot (agente, antes de agir)
1. Leia a fonte canônica global `~/workspace/AGENTS.md` (SDD/TDD, `model_routing`,
   segurança OWASP, convenções por stack, remote de repos).
2. Leia o índice de memória `/mnt/c/Users/rafael/ObsidianVault/agent-memory/MEMORY.md`
   quando precisar de contexto arquitetural/histórico.

## Este repositório
**protondeck** — App desktop (Electron) de configs Proton da biblioteca Steam — IPC + Vue 3 + SQLite (better-sqlite3). (protondeck) (stack: `node`).

### Build / teste
- `npm run build`
- `npm run test`
- `npm run lint`

### Guideline de stack (resumo do canônico global)
- TDD estrito: teste em Red antes do código; nunca afrouxar tests/contratos sem `"UPDATE SPECIFICATION"`.
- SDD: não escrever código de feature (Track A/B) sem artefatos aprovados; Chore/Track C dispensa.
- Racional: propor solução + 2 alternativas com trade-offs antes de codar.
- Diagramas de arquitetura/fluxo em **ASCII**, nunca Mermaid.

## Remote e git
- **Todos** os repositórios — públicos e privados — vão para o **GitHub**
  (`github.com/rmarquespaixao-eng`); Gitea homelab não é mais destino.
- Commit atômico por task, Conventional Commits, sem quebrar build.

## ARQUIVOS DE DIRETRIZES POR CLI
- **codex / opencode / Cursor:** `AGENTS.md` (raiz)
- **Claude Code:** `CLAUDE.md`
- **GitHub Copilot (VS Code):** `.github/copilot-instructions.md` e `.github/AGENTS.md`

Todos apontam para a fonte canônica global `~/workspace/AGENTS.md`.
