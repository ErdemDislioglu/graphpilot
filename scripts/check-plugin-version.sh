#!/usr/bin/env bash
# Faz 14 B12 — plugin/ değiştiyse plugin.json sürümü de artmış olmalı. Claude Code kurulu
# plugin'i sürüm klasörüne önbellekler (~/.claude/plugins/cache/<market>/<plugin>/<sürüm>);
# sürüm aynı kalırsa yeniden kurulumda eski dosyalar kalır (pilotta 0.1.0 önbelleğinde
# senior.md, reviewer.md ve lib/* eksikti). Kullanım: scripts/check-plugin-version.sh [ref]
# (varsayılan ref: origin/main). Push öncesi çalıştır.
set -euo pipefail
cd "$(dirname "$0")/.."
ref="${1:-origin/main}"
manifest="plugin/.claude-plugin/plugin.json"

version_of() { node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).version)'; }

if ! git rev-parse --verify --quiet "$ref" >/dev/null; then
  echo "✗ ref bulunamadı: $ref" >&2
  exit 2
fi
if git diff --quiet "$ref" -- plugin/; then
  echo "✓ plugin/ $ref'e göre değişmedi."
  exit 0
fi
old="$(git show "$ref:$manifest" | version_of)"
new="$(version_of < "$manifest")"
if [ "$old" = "$new" ]; then
  echo "✗ plugin/ değişti ama $manifest sürümü hâlâ $new — artır (kurulu önbellek bayat kalır)." >&2
  exit 1
fi
echo "✓ plugin sürümü $old → $new"
