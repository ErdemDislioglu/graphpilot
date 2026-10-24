---
description: >-
  Epic'leri feature'lara, feature'ları atomik görevlere açar (tembel genişletme).
  Kullanıcı "/gp:expand" (hedefi otomatik seçer) veya "/gp:expand <id>" yazdığında çalışır.
argument-hint: "[epic-id veya feature-id, opsiyonel]"
---

# /gp:expand

> Bu skill ANA THREAD'de çalışır. `planner`'ı GENİŞLETME-FEATURE veya GENİŞLETME-TASK
> modunda çağırırsın — hangisi, hedefin `kind`'ına bağlı.

## 1. Hedefi belirle
- Argüman verildiyse: `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" status --json` ile o ID'nin
  `kind`'ını ve `expanded` durumunu doğrula. Zaten genişletilmişse kullanıcıya söyle, çık.
- Argüman verilmediyse: `gp status --json`'daki düğümler arasında `expanded: false` olan
  ve `depends_on`'ları `done`/yoksa en küçük ID'li **epic**'i seç; epic kalmadıysa aynı
  şekilde en küçük ID'li **feature**'ı seç. Hiçbiri yoksa "genişletilecek bir şey yok" de, çık.

## 2. `confirm_expand` kontrolü
`.graph/config.yml`'de `confirm_expand: true` ise, genişletmeden önce `AskUserQuestion`
ile onay al ("E01'i feature'lara aç?" / evet-hayır). `false` (varsayılan) ise direkt geç.

## 3. Planner'ı çağır
- Hedef bir **epic** ise → `planner`'ı `MOD: GENİŞLETME-FEATURE` ile çağır. Girdi:
  epic ID + epic.md içeriği + brief + kardeş epic'lerin bilgi düğümü özetleri (varsa).
- Hedef bir **feature** ise → `planner`'ı `MOD: GENİŞLETME-TASK` ile çağır. Girdi:
  feature ID + feature.md + epic bilgi düğümlerinin özetleri + o epic'in knowledge/
  klasöründeki iskelet dosyaların adları.

## 4. Sonuç tablosu göster
Planner'ın döndürdüğü JSON'dan: yeni düğümler (id, summary), flag'ler varsa
(complexity/risk/type), ve **sadece task'lar için** çözülen model:
`node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" route <task-id> --json` her yeni task için.

## 5. Doğrulama
`node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" validate --json`. `error` varsa planner'ı tekrar
çağırıp düzelt. `warning` varsa (aşırı bölme, küçük görev, bütçe aşımı) kullanıcıya
bilgi olarak göster, otomatik düzeltmeye çalışma (bunlar planner'ın muhakeme gerektiren
kararları — SPEC §5.5).

## 6. Bitir
`node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" index --json`. Kullanıcıya: "`N` yeni düğüm
oluşturuldu. `/gp:run` ile çalıştırabilirsin (Faz 6)." `/gp:run` henüz hazır değilse
(bu plugin sürümünde placeholder) bunu da belirt.
