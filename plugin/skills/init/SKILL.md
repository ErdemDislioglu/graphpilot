---
description: >-
  `.graph/` iskeletini oluşturur (brief.md + config.yml varsayılanları). Kullanıcı
  "/gp:init" yazdığında veya yeni bir projede graph kurmak istediğinde çalışır.
---

# /gp:init

1. Çalıştır: `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" init --json`
   - Idempotent: `.graph/` zaten varsa var olan dosyaların üzerine yazmaz, sadece
     eksik parçaları tamamlar.
2. Çalıştır: `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" doctor --json` — kurulumu doğrula.
3. Kullanıcıya kısaca özetle: hangi dosyalar oluşturuldu (`created`), hangileri zaten
   vardı (`skipped`).
4. `brief.md` şu an sadece `(TODO)` placeholder'ları içeriyor — kullanıcıya
   **`/gp:plan`** komutunu çalıştırmasını öner (proje isteğini brief + epic'lere
   dönüştürür). Bu skill brief'i doldurmaz, sadece iskeleti kurar.
