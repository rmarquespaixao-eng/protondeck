#!/usr/bin/env bash
# Wrapper de start do ProtonDeck — resolve Node em runtime cobrindo
# fnm, nvm, asdf e instalacao do sistema. Imune a trocas de versao
# Node pelo user apos o install (que invalidariam um ExecStart com
# path absoluto).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_node() {
  # 0. Node embarcado no release — prioridade absoluta. Tarball self-contained
  #    inclui $SCRIPT_DIR/node (mesma versao usada pra compilar better-sqlite3,
  #    garantindo ABI match).
  if [ -x "$SCRIPT_DIR/node" ]; then
    export PATH="$SCRIPT_DIR:$PATH"
    return 0
  fi

  # 1. fnm — symlink aliases/default eh estavel (atualizado via "fnm alias default <ver>").
  # O symlink ja aponta pra <dir>/installation, entao node fica em aliases/default/bin/node.
  local fnm_dirs=(
    "$HOME/.local/share/fnm"
    "$HOME/.fnm"
  )
  for d in "${fnm_dirs[@]}"; do
    if [ -L "$d/aliases/default" ]; then
      local bin="$d/aliases/default/bin"
      if [ -x "$bin/node" ]; then
        export PATH="$bin:$PATH"
        return 0
      fi
    fi
  done

  # 2. nvm — resolve cadeia "default → lts/X → vX.Y.Z"
  if [ -d "$HOME/.nvm/alias" ]; then
    local nvm_ver
    if [ -f "$HOME/.nvm/alias/default" ]; then
      nvm_ver=$(cat "$HOME/.nvm/alias/default")
      local hops=0
      while [ -f "$HOME/.nvm/alias/$nvm_ver" ] && [ $hops -lt 10 ]; do
        nvm_ver=$(cat "$HOME/.nvm/alias/$nvm_ver")
        hops=$((hops + 1))
      done
      local nvm_bin="$HOME/.nvm/versions/node/$nvm_ver/bin"
      if [ -x "$nvm_bin/node" ]; then
        export PATH="$nvm_bin:$PATH"
        return 0
      fi
    fi
  fi

  # 3. asdf — shims sao estaveis
  if [ -x "$HOME/.asdf/shims/node" ]; then
    export PATH="$HOME/.asdf/shims:$PATH"
    return 0
  fi

  # 4. Fallback: node no PATH (sistema, ou ja exportado)
  if command -v node >/dev/null 2>&1; then
    return 0
  fi

  return 1
}

if ! resolve_node; then
  echo "ERRO: node nao encontrado." >&2
  echo "Tentei: fnm aliases/default, nvm aliases/default, asdf shims, PATH." >&2
  echo "Instale Node.js >= 20.12 ou ajuste o PATH na unit systemd." >&2
  exit 127
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERRO: Node $(node -v) muito antigo. Precisa >= 20.12." >&2
  exit 1
fi

exec node "$SCRIPT_DIR/dist/main.js"
