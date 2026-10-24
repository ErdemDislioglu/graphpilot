## Amaç

GraphPilot (`gp`) — Claude Code için token-optimize bir orkestrasyon plugin'i. Görevi
linkli markdown düğümlerinden oluşan bir graph'a böler, flag'ler, doğru modele yönlendirir
ve arka planda adım adım, izole bağlamla yürütür. Bu brief, projenin KENDİ geliştirilmesini
yönetmek için yazıldı (dogfooding) — Faz 7'den itibaren kalan fazlar bu graph üzerinden
`/gp:expand` + `/gp:run` ile gerçek agent çağrılarıyla yürütülecek.

## Stack

TypeScript (Node 22+, strict mode) + Claude Code plugin. Tek paket: `cli/` (gp CLI).
Test: Vitest. Lint: ESLint + Prettier. Bağımlılık: zod 4, gray-matter, commander, yaml,
fast-glob. Java yok.

## Klasör yapısı

- `cli/src/` — CLI kaynak kodu (her modül kendi dosyasında, tek sorumluluk)
- `cli/src/schema/` — Zod şemaları (SPEC.md §3-§10)
- `cli/src/__tests__/` — testler (co-located `__tests__` klasörleri)
- `plugin/agents/` — 5 sabit agent (planner, coder, tester, docs, checker)
- `plugin/skills/` — `/gp:*` komutları (SKILL.md, `commands/` DEĞİL — ADR-007)
- `plugin/lib/` — `cli/dist/`'ten senkronize edilen derlenmiş kopya (ADR-009, elle düzenleme)
- `docs/SPEC.md` — graph formatı · `docs/decisions.md` — ADR'ler (bağlayıcı kararlar)
- `roadmap/faz-XX-*.md` — her fazın görev listesi, kabul kriterleri, Faz Günlüğü

## Konvansiyonlar

- Dosyayı baştan yazma, düzenle (Edit).
- Her yeni fonksiyon için Vitest testi; mock gereken yerde (örn. `claude -p` çağrıları)
  enjekte edilebilir bir fonksiyon parametresi kullan (bkz. `check.ts`, `checks.ts`).
- `cli/`'da değişiklik sonrası: `npx tsc --noEmit`, `npx vitest run`, `npx eslint src`,
  `npx prettier --write src`, `npm run build`, sonra proje köküdeki
  `./scripts/sync-cli-to-plugin.sh` ile `plugin/lib/`'i güncelle.
- Yeni bir platform kısıtı/tasarım kararı bulursan `docs/decisions.md`'ye ADR olarak yaz.
- Roadmap'in kendi SPEC/ADR boşluklarını (açıkça "kararı ver" dediği yerler) doldurursan
  `docs/SPEC.md`'ye de işle, sessizce geçme.
- Commit mesajı: `gp(<id>): <summary>`.

## Test stratejisi

`cd cli && npm test` (Vitest). Yeni bir CLI komutu eklersen: (1) alttaki fonksiyonu
`src/__tests__/*.test.ts`'de gerçek mantıkla test et, (2) `cli.ts`'e bağla, (3)
`src/__tests__/cli.test.ts`'e sadece wiring testi ekle (mantığı tekrar test etme).

## Kapsam dışı

- Gerçek bir `claude -p`/Agent tool çağrısı GEREKTİREN testler bu pilot dışında elle/mock
  ile doğrulanır — gerçek LLM kullanımı gerektiren adımlar açıkça işaretlenip kullanıcıya
  onay için bırakılır.
- Faz 8-11'in kendi kapsamları (benchmark, dayanıklılık, paketleme, review/API testi) —
  sadece Faz 7 pilot kapsamında.
