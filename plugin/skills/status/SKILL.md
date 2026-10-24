---
description: >-
  Graph'ın durum özetini gösterir (toplam, done, running, failed, blocked).
  Kullanıcı "/gp:status" yazdığında veya ilerleme sorduğunda çalışır.
---

# /gp:status

1. Çalıştır: `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" status --json`
2. `.graph/` yoksa (`gp doctor` ile kontrol edilebilir) kullanıcıya `/gp:init`
   önerisiyle bilgi ver, devam etme.
3. Sonucu insan-okur özetle: toplam düğüm, durum kırılımı (`byStatus`), tür kırılımı
   (`byKind`). `running` listesi varsa isimleriyle göster — bunlar kesinti sonrası
   devam adayları (ayrıntı: Faz 9.1, `/gp:run`'ın kendi `gp resume` çağrısı).
4. Ham JSON'u kullanıcıya dökme; okunabilir bir özet üret.
