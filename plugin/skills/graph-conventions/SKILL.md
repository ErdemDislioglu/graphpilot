---
description: >-
  GraphPilot graph formatı, ID kuralları, `gp new` kullanımı, handoff yazma
  kuralları. Agent'lar format sorusu olduğunda bu skill'e başvurur.
---

# Graph konvansiyonları (ajan-dostu özet — tam spesifikasyon: docs/SPEC.md)

## ID ve dosya adı
- Epic: `E01` · Feature: `E01-F01` · Task: `E01-F01-T03`. Hane sayısı sabit (2).
- Dosya adı feature/task'ta kısaltılır: `tasks/F01-search.md`, `tasks/F01-T03-x.md`.
  `id:` frontmatter'ı **her zaman tam ID**; dosya adı kısaltılmış olabilir.
- Knowledge: `id` = `name` = dosya adı kökü, **global tekil**.
- Yeni düğüm **elle yazılmaz**. Planlama: tek planla `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" apply <plan.json> --json`
  (biçim: `planner.md` §Plan biçimi). Tek düğüm: `... new <epic|feature|task|knowledge> --parent <id> --slug <slug> --summary "..." --json`.

## Link kuralları
- `depends_on`: sadece aynı türe (task→task, feature→feature, epic→epic), tam ID.
  task→task başka bir feature'daki task'a da bağlanabilir.
- `reads`: sadece knowledge düğümüne, `[[name]]` sözdizimiyle.
- `draft: true` olan bir düğümden çıkan linkler henüz var olmayabilir (SPEC §8).

## Handoff yazma kuralları
- Zorunlu alt başlıklar: Oluşturulan/değişen dosyalar, Public arayüz, Kararlar,
  Bilgi düğümü güncellemeleri.
- Üst sınır ~250 token, sert sınır 300 (`gp validate` kontrol eder, `status: done` düğümlerde zorunlu).
- Kısa ve somut yaz — sonraki düğümler SADECE bunu okuyacak, tüm kodunu değil.

## Bilgi düğümü kuralı
- Kod kopyalamaz; sadece `## Arayüz` (imza/endpoint/tip), `## Kararlar`, `## Dikkat`.

## Durum kontrolü
- Elle frontmatter düzenleme yerine: `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" set <id> status=done attempts=1`
  (liste alanları: `depends_on=a,b` ya da `tags='["x","y"]'`; yalnız değişen satır yazılır).
- Kendi düğüm dosyanı (Handoff) ve `reads`'teki bilgi düğümlerini Edit ile düzenleyebilirsin.
