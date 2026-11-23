#!/usr/bin/env bash
# À sourcer par les scripts .sh : garantit la présence du Node.js local.
# Ne modifie que le PATH du processus courant (jamais l'environnement global).
set -euo pipefail

DL_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DL_ROOT="$(cd "$DL_SCRIPT_DIR/.." && pwd)"
DL_VERSION="$(tr -d '\r\n ' < "$DL_ROOT/scripts/node-version.txt")"

case "$(uname -s)" in
  Linux*)  DL_OS=linux ;;
  Darwin*) DL_OS=darwin ;;
  *) echo "[DIGITAL LIFE] Système non pris en charge : $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) DL_ARCH=x64 ;;
  aarch64|arm64) DL_ARCH=arm64 ;;
  *) echo "[DIGITAL LIFE] Architecture non prise en charge : $(uname -m)" >&2; exit 1 ;;
esac

DL_NODE="$DL_ROOT/.tools/node/versions/${DL_VERSION}-${DL_OS}-${DL_ARCH}/bin/node"

if [ ! -x "$DL_NODE" ] || [ ! -d "$DL_ROOT/node_modules" ]; then
  echo '[DIGITAL LIFE] Premier lancement ou dépendances manquantes : bootstrap…'
  bash "$DL_ROOT/scripts/bootstrap.sh"
fi

export PATH="$(dirname "$DL_NODE"):$PATH"
