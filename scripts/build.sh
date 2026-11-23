#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/ensure-node.sh"
exec "$DL_NODE" "$DL_ROOT/scripts/build.mjs" "$@"
