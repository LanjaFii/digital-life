#!/usr/bin/env bash
# Bootstrap portable : télécharge et vérifie le Node.js LOCAL du projet,
# puis installe les dépendances npm dans le projet. Aucun Node global, aucun sudo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '\r\n ' < "$ROOT/scripts/node-version.txt")"
CACHE="$ROOT/.tools/node/cache"

case "$(uname -s)" in
  Linux*)  OS=linux ;;
  Darwin*) OS=darwin ;;
  *) echo "[DIGITAL LIFE] Système non pris en charge : $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "[DIGITAL LIFE] Architecture non prise en charge : $(uname -m)" >&2; exit 1 ;;
esac

if [ "$OS" = "linux" ]; then EXT=tar.xz; TAR_FLAGS=-xJf; else EXT=tar.gz; TAR_FLAGS=-xzf; fi
FILENAME="node-${VERSION}-${OS}-${ARCH}.${EXT}"
BASE_URL="https://nodejs.org/dist/${VERSION}"
TARGET="$ROOT/.tools/node/versions/${VERSION}-${OS}-${ARCH}"

NODE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --node-only) NODE_ONLY=1 ;;
    *) echo "[DIGITAL LIFE] Argument inconnu : $arg" >&2; exit 1 ;;
  esac
done

echo "[DIGITAL LIFE] Node portable : $VERSION ($OS/$ARCH)"

READY=0
if [ -x "$TARGET/bin/node" ]; then
  ACTUAL="$("$TARGET/bin/node" -p 'process.version')"
  if [ "$ACTUAL" = "$VERSION" ]; then
    echo "[DIGITAL LIFE] Node local déjà présent ($ACTUAL)."
    READY=1
  else
    echo "[DIGITAL LIFE] Version obsolète ($ACTUAL), remplacement par $VERSION."
  fi
fi

if [ "$READY" -ne 1 ]; then
  mkdir -p "$CACHE"
  TMP="$(mktemp -d "$CACHE/bootstrap.XXXXXX")"
  trap 'rm -rf "$TMP"' EXIT

  echo "[DIGITAL LIFE] Téléchargement de $FILENAME (source officielle nodejs.org)…"
  curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 900 \
    "$BASE_URL/$FILENAME" -o "$TMP/$FILENAME"

  echo "[DIGITAL LIFE] Téléchargement des sommes de contrôle officielles…"
  curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 120 \
    "$BASE_URL/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"

  EXPECTED="$(awk -v f="$FILENAME" '$2 == f { print $1 }' "$TMP/SHASUMS256.txt")"
  if [ -z "$EXPECTED" ]; then
    echo "[DIGITAL LIFE] Somme de contrôle introuvable pour $FILENAME." >&2
    exit 1
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_HASH="$(sha256sum "$TMP/$FILENAME" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_HASH="$(shasum -a 256 "$TMP/$FILENAME" | awk '{print $1}')"
  else
    echo "[DIGITAL LIFE] Outil de hachage SHA-256 absent (sha256sum ou shasum)." >&2
    exit 1
  fi

  if [ "$ACTUAL_HASH" != "$EXPECTED" ]; then
    echo "[DIGITAL LIFE] Échec de vérification SHA-256." >&2
    echo "  attendu : $EXPECTED" >&2
    echo "  obtenu  : $ACTUAL_HASH" >&2
    exit 1
  fi
  echo "[DIGITAL LIFE] SHA-256 vérifié."

  mkdir -p "$TMP/extract"
  tar "$TAR_FLAGS" "$TMP/$FILENAME" -C "$TMP/extract" --strip-components=1
  if [ ! -x "$TMP/extract/bin/node" ]; then
    echo "[DIGITAL LIFE] Archive Node invalide (bin/node absent)." >&2
    exit 1
  fi

  mkdir -p "$(dirname "$TARGET")"
  STAGING="${TARGET}.staging"
  rm -rf "$STAGING"
  mv "$TMP/extract" "$STAGING"
  rm -rf "$TARGET"
  mv "$STAGING" "$TARGET"
  echo "[DIGITAL LIFE] Node local installé dans $TARGET"
fi

NODE_BIN="$TARGET/bin/node"
NPM_CLI="$TARGET/lib/node_modules/npm/bin/npm-cli.js"

if [ "$NODE_ONLY" -eq 1 ]; then
  echo "[DIGITAL LIFE] Bootstrap Node terminé (--node-only)."
  exit 0
fi

echo "[DIGITAL LIFE] Installation des dépendances npm (dossier local)…"
"$NODE_BIN" "$NPM_CLI" install --no-audit --no-fund

echo "[DIGITAL LIFE] Copie du binaire WebAssembly sql.js…"
"$NODE_BIN" "$ROOT/scripts/copy-wasm.mjs"

echo "[DIGITAL LIFE] Vérification des dépendances…"
"$NODE_BIN" "$ROOT/scripts/check-deps.mjs"

echo "[DIGITAL LIFE] Bootstrap terminé."
