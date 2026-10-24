#!/usr/bin/env bash
# cli/'ı derler ve derlenmiş çıktıyı plugin/lib/'e kopyalar.
# ADR-009: plugin/lib/ git'te İZLENİR (henüz gerçek bir build/release hattı yok —
# Faz 10'da bu script'in yerini otomatik bir paketleme adımı almalı).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ cli/ derleniyor..."
(cd cli && npm run build)

echo "→ plugin/lib/ güncelleniyor..."
rm -rf plugin/lib
mkdir -p plugin/lib
cp -r cli/dist/* plugin/lib/
# Test dosyalarının derlenmiş hali plugin'e gerekmiyor.
find plugin/lib -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true
find plugin/lib -name "testUtils" -type d -exec rm -rf {} + 2>/dev/null || true

echo "→ plugin/package.json (sadece çalışma zamanı bağımlılıkları) güncelleniyor..."
node -e '
const cli = require("./cli/package.json");
const pkg = {
  name: "gp-cli-runtime",
  private: true,
  type: "module",
  dependencies: cli.dependencies,
};
require("fs").writeFileSync("plugin/package.json", JSON.stringify(pkg, null, 2) + "\n");
'

echo "✓ plugin/lib/ ve plugin/package.json senkronize edildi."
