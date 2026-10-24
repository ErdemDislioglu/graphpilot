# GraphPilot (`gp`)

Claude Code için token-optimize bir orkestrasyon plugin'i. Görevi linkli markdown
dosyalarından oluşan bir graph'a böler (`.graph/`), her görevi `complexity`/`type`/`risk`
flag'lerine göre doğru modele (haiku/sonnet/opus) yönlendirir ve arka planda adım adım,
izole bağlamla yürütür.

## Kurulum

```bash
claude plugin marketplace add /yol/graphpilot-roadmap-2
claude plugin install gp@graphpilot
```

## Kullanım

- `/gp:init` — `.graph/` iskeletini oluştur
- `/gp:status` — durum özeti
- `/gp:plan`, `/gp:expand`, `/gp:run`, `/gp:report` — sırasıyla Faz 4/5/6/8'de dolacak

## Mimari

5 sabit agent (planner, coder, tester, docs, checker) + `gp` CLI'ı (deterministik: parse,
doğrulama, indeks, sıralama, routing, bağlam paketleme — hiçbiri LLM çağırmaz). Ayrıntı:
proje köküdeki `docs/SPEC.md` ve `docs/decisions.md`.

Geliştirme aşamasında (sürüm 0.1.0) — henüz Faz 3/11 arası tamamlanıyor.
