#!/usr/bin/env bash
# ProtonDeck installer — instala em ~/.local/share/protondeck/ e cria
# systemd user service. Idempotente: rodar de novo faz upgrade preservando
# data/ e .env.
set -euo pipefail

# Caminhos (override via env var PROTONDECK_HOME)
INSTALL_DIR="${PROTONDECK_HOME:-$HOME/.local/share/protondeck}"
UNIT_DIR="$HOME/.config/systemd/user"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Cores pra output legivel
if [ -t 1 ]; then
  GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; RED=$'\033[0;31m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; BOLD=''; RESET=''
fi

err()  { echo "${RED}ERRO:${RESET} $1" >&2; exit 1; }
info() { echo "${GREEN}▸${RESET} $1"; }
warn() { echo "${YELLOW}⚠${RESET} $1"; }

echo ""
echo "${BOLD}ProtonDeck install${RESET}"
echo ""

# Checagens
command -v node >/dev/null || err "node nao encontrado. Instale Node.js >= 20.12 antes."
NODE_VERSION=$(node -p "process.versions.node.split('.').map(Number)")
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  err "Node.js >= 20.12 obrigatorio (detectado $(node -v))"
fi
command -v systemctl >/dev/null || warn "systemd nao detectado — pulando criacao do service"

# Confirma destino se nao for default
if [ "$INSTALL_DIR" != "$HOME/.local/share/protondeck" ]; then
  echo "Destino customizado: $INSTALL_DIR"
fi

# 1. Copia arquivos pro destino (preserva data/ e .env)
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  info "instalando em $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  # Backup do data/ se existir (rsync preservaria, mas evitamos a dep)
  if [ -d "$INSTALL_DIR/data" ]; then
    BACKUP=$(mktemp -d)
    cp -a "$INSTALL_DIR/data" "$BACKUP/"
    BACKUP_DATA="$BACKUP/data"
    info "data/ existente preservado durante upgrade"
  fi
  # Preserva .env existente
  if [ -f "$INSTALL_DIR/.env" ]; then
    KEEP_ENV="$INSTALL_DIR/.env"
  fi

  # Copia tudo (exclui install.sh — o que ja estamos rodando)
  find "$SCRIPT_DIR" -mindepth 1 -maxdepth 1 ! -name 'install.sh' -exec cp -r {} "$INSTALL_DIR/" \;

  # Restaura data/ se backupeamos
  if [ -n "${BACKUP_DATA:-}" ]; then
    rm -rf "$INSTALL_DIR/data"
    cp -a "$BACKUP_DATA" "$INSTALL_DIR/data"
    rm -rf "$BACKUP"
  fi
fi

# 2. .env (gera SESSION_KEY na primeira vez)
if [ ! -f "$INSTALL_DIR/.env" ]; then
  if command -v openssl >/dev/null; then
    SESSION_KEY=$(openssl rand -hex 32)
  else
    SESSION_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  cat > "$INSTALL_DIR/.env" <<EOF
# ProtonDeck — config local
# NUNCA versionar este arquivo

# Chave de assinatura/criptografia da sessao (32 bytes hex)
SESSION_KEY=$SESSION_KEY

# Porta e bind
PORT=3030
HOST=127.0.0.1
EOF
  chmod 600 "$INSTALL_DIR/.env"
  info ".env gerado em $INSTALL_DIR/.env"
else
  info ".env existente preservado"
fi

# 3. systemd user service
if command -v systemctl >/dev/null; then
  mkdir -p "$UNIT_DIR"
  NODE_BIN=$(command -v node)
  cat > "$UNIT_DIR/protondeck.service" <<EOF
[Unit]
Description=ProtonDeck — Proton config dashboard
Documentation=https://gitea.homelab-cloud.com/admin/protondeck
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$NODE_BIN $INSTALL_DIR/dist/main.js
Restart=on-failure
RestartSec=5
# Roda como user normal — sem privilegios extras
NoNewPrivileges=true

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  info "systemd unit instalada em $UNIT_DIR/protondeck.service"
fi

# 4. Output final
PORT=$(grep -E '^PORT=' "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d '"' || echo 3030)
echo ""
echo "${BOLD}${GREEN}✓ Instalacao completa${RESET}"
echo ""
echo "Diretorio: $INSTALL_DIR"
echo "Banco:     $INSTALL_DIR/data/panel.db (criado no primeiro start)"
echo ""
echo "${BOLD}Proximos passos:${RESET}"
if command -v systemctl >/dev/null; then
  echo "  systemctl --user enable --now protondeck      # sobe agora + ao boot"
  echo "  systemctl --user status protondeck            # ver status"
  echo "  journalctl --user -u protondeck -f            # logs"
else
  echo "  cd $INSTALL_DIR && node dist/main.js          # start manual"
fi
echo ""
echo "Depois, abra ${BOLD}http://127.0.0.1:$PORT${RESET}"
echo "Primeiro acesso: cria conta admin em /setup"
echo ""
echo "Pra rodar mesmo apos logout (background persistente):"
echo "  sudo loginctl enable-linger \$USER"
