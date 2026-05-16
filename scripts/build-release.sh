#!/usr/bin/env bash
# Gera tarball de release auto-contido em dist-release/protondeck-<version>.tar.gz
# Conteudo: dist/ (JS transpilado + views/public copiados), node_modules de prod,
# package.json, install.sh, uninstall.sh, README.md, .env.example.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=$(node -p "require('./package.json').version")
NAME="protondeck-${VERSION}"
STAGE=$(mktemp -d)
trap "rm -rf '$STAGE'" EXIT
TARGET="$STAGE/$NAME"

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

echo "▸ tarball"
mkdir -p dist-release
TARBALL="dist-release/${NAME}.tar.gz"
tar czf "$TARBALL" -C "$STAGE" "$NAME"

SIZE=$(du -h "$TARBALL" | cut -f1)
echo ""
echo "✓ $TARBALL ($SIZE)"
echo ""
echo "Pra instalar:"
echo "  tar xzf $TARBALL"
echo "  cd $NAME"
echo "  ./install.sh"
