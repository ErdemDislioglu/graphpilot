# GraphPilot — Kurulum

**Doğrulanan sürüm:** Claude Code 2.1.309, Node 22+ (bkz. `cli/.nvmrc`).

## Yerel marketplace üzerinden (geliştirme)

Bu repo'nun kökü aynı zamanda yerel bir marketplace'tir
(`.claude-plugin/marketplace.json`, tek plugin: `gp` → `./plugin`).

```bash
claude plugin marketplace add /mutlak/yol/graphpilot-roadmap-2
claude plugin install gp@graphpilot
```

Kurulumu doğrula:

```bash
claude plugin validate ./plugin
claude plugin list
```

## İlk çalıştırma

Oturum başladığında (`SessionStart` hook'u) plugin kendi `node_modules`'ını
otomatik kurar (ADR-009 — `${CLAUDE_PLUGIN_ROOT}` altına, idempotent). İlk
oturumda bir kaç saniye sürer, sonrakilerde atlanır.

```
/gp:init      # .graph/ iskeleti (brief.md + config.yml varsayılanları)
/gp:status    # durum özeti
```

## Güncelleme

```bash
claude plugin marketplace update graphpilot
```

## Kaldırma

```bash
claude plugin uninstall gp
claude plugin marketplace remove graphpilot
```

## Sorun giderme

- `/gp:init` sonrası `gp doctor` komutunun çıktısını kontrol et: Node sürümü,
  `.graph/` varlığı, `config.yml` geçerliliği.
- `node_modules` kurulumu başarısız olursa: `plugin/scripts/ensure-deps.sh`'yi
  elle çalıştır (hata mesajını görmek için `set -x` ekleyerek).

## Platform sınırı

Bu plugin `claude.ai` ve Cowork'te **kurulamaz** (CLI'ın kendi `node_modules`'ını
kurduğu, kod yürüten bir yapı) — sadece Claude Code CLI / masaüstü uygulaması /
IDE eklentisinde çalışır.
