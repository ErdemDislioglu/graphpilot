#!/usr/bin/env bash
# SessionStart hook'u tarafından çalıştırılır (ADR-009). Idempotent: node_modules zaten
# güncelse hiçbir şey yapmaz. ${CLAUDE_PLUGIN_ROOT} hook sürecine ortam değişkeni olarak
# gelir (bin/gp'ye GELMEZ — bu yüzden kurulum burada, self-location bin.js'te).
set -euo pipefail
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

if [ -d node_modules ] && [ -f node_modules/.install-stamp ] && \
   [ "$(cat node_modules/.install-stamp 2>/dev/null)" = "$(md5sum package.json 2>/dev/null || md5 -q package.json)" ]; then
  exit 0
fi

npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1
(md5sum package.json 2>/dev/null || md5 -q package.json) > node_modules/.install-stamp
