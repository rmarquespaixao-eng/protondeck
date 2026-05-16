#!/usr/bin/env bash
# Gera tarball de release auto-contido em dist-release/protondeck-<version>.tar.gz
# Conteudo: dist/ (JS transpilado + views/public copiados), node_modules de prod,
# package.json, install.sh, uninstall.sh, run.sh, README.md, .env.example.
#
# Por default empacota o binario do Node (alvo "embed-node") — release totalmente
# self-contained, ~50–70 MB. Use NO_EMBED_NODE=1 pra release "lite" (~22 MB) que
# depende do Node do sistema do user.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=$(node -p "require('./package.json').version")
NAME="protondeck-${VERSION}"
STAGE=$(mktemp -d)
trap "rm -rf '$STAGE'" EXIT
TARGET="$STAGE/$NAME"

# Versao do Node a empacotar (a mesma que rodou o npm ci — garante ABI match
# pro better-sqlite3.node compilado neste build).
NODE_VERSION="$(node -p 'process.versions.node')"

# Arquitetura — pra agora so linux-x64. Pra outras (linux-arm64, macos),
# defina NODE_ARCH no env (ex: NODE_ARCH=linux-arm64).
NODE_ARCH="${NODE_ARCH:-linux-x64}"

CACHE_DIR="${PROTONDECK_BUILD_CACHE:-$HOME/.cache/protondeck-build}"

echo "▸ build TypeScript"
npm run build --silent

echo "▸ stage em $TARGET"
mkdir -p "$TARGET/dist"
cp -r dist/* "$TARGET/dist/"

# tsc nao copia .ejs e static — copiamos manualmente
cp -r src/adapters/in/http/views  "$TARGET/dist/adapters/in/http/"
cp -r src/adapters/in/http/public "$TARGET/dist/adapters/in/http/"

cp package.json package-lock.json .env.example README.md "$TARGET/"

# Scripts entrypoint + wrapper de start
cp scripts/install.sh scripts/uninstall.sh scripts/run.sh "$TARGET/"
chmod +x "$TARGET/install.sh" "$TARGET/uninstall.sh" "$TARGET/run.sh"

echo "▸ npm install (prod-only) no stage"
( cd "$TARGET" && npm ci --omit=dev --omit=optional --no-audit --no-fund --silent )

# ── Embed do Node binary ──
if [ "${NO_EMBED_NODE:-0}" != "1" ]; then
  NODE_TARBALL="node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz"
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
  mkdir -p "$CACHE_DIR"

  if [ ! -f "$CACHE_DIR/$NODE_TARBALL" ]; then
    echo "▸ baixando Node v${NODE_VERSION} (${NODE_ARCH})"
    curl -fsSL "$NODE_URL" -o "$CACHE_DIR/$NODE_TARBALL.tmp"
    mv "$CACHE_DIR/$NODE_TARBALL.tmp" "$CACHE_DIR/$NODE_TARBALL"
  else
    echo "▸ Node v${NODE_VERSION} (${NODE_ARCH}) ja no cache"
  fi

  echo "▸ extraindo node binary pro stage"
  # tarball oficial: node-v<X>.<Y>.<Z>-<arch>/bin/node
  tar -xJf "$CACHE_DIR/$NODE_TARBALL" -C "$TARGET" --strip-components=2 \
    "node-v${NODE_VERSION}-${NODE_ARCH}/bin/node"
  chmod +x "$TARGET/node"
  echo "  → $(du -h "$TARGET/node" | cut -f1) node binary"
fi

echo "▸ tarball"
mkdir -p dist-release
TARBALL="dist-release/${NAME}.tar.gz"
tar czf "$TARBALL" -C "$STAGE" "$NAME"

SIZE=$(du -h "$TARBALL" | cut -f1)
echo ""
echo "✓ $TARBALL ($SIZE)"
if [ "${NO_EMBED_NODE:-0}" != "1" ]; then
  echo "  (com Node v${NODE_VERSION} embarcado pra ${NODE_ARCH})"
fi
echo ""
echo "Pra instalar:"
echo "  tar xzf $TARBALL"
echo "  cd $NAME"
echo "  ./install.sh"
