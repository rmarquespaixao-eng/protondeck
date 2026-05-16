#!/usr/bin/env bash
# Remove o systemd service. Pergunta antes de remover dados.
set -euo pipefail

INSTALL_DIR="${PROTONDECK_HOME:-$HOME/.local/share/protondeck}"
UNIT_DIR="$HOME/.config/systemd/user"

if [ -t 1 ]; then
  GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; RESET=$'\033[0m'
else
  GREEN=''; YELLOW=''; RESET=''
fi

echo "ProtonDeck uninstall"
echo ""

if command -v systemctl >/dev/null; then
  systemctl --user stop protondeck 2>/dev/null && echo "${GREEN}✓${RESET} service parado" || true
  systemctl --user disable protondeck 2>/dev/null && echo "${GREEN}✓${RESET} service desabilitado" || true
  rm -f "$UNIT_DIR/protondeck.service"
  systemctl --user daemon-reload
  echo "${GREEN}✓${RESET} unit removida"
fi

if [ -d "$INSTALL_DIR" ]; then
  echo ""
  echo "${YELLOW}Dados em:${RESET} $INSTALL_DIR/data"
  read -r -p "Apagar tudo (inclusive panel.db e .env)? [y/N] " yn
  if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
    rm -rf "$INSTALL_DIR"
    echo "${GREEN}✓${RESET} $INSTALL_DIR removido"
  else
    # Remove so binarios; mantem data/ e .env
    find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
      ! -name data ! -name .env -exec rm -rf {} +
    echo "${GREEN}✓${RESET} binarios removidos; data/ e .env preservados"
  fi
fi
