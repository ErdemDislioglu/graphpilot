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
`node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" config --key efficiency --json` → Agent çağrısında
`model: <expansion_model>` (Faz 14 O14 — genişletme sık çalışır; `opus` yazılırsa eski davranış).
Prompt'a mod satırı + hedef ID + `efficiency` değerlerini koy; dosya içeriklerini
yapıştırma — planner brief'i, hedef düğümü ve bilgi düğümü özetlerini `.graph/`'tan kendi okur.
- Hedef bir **epic** ise → `MOD: GENİŞLETME-FEATURE` (küçük epic'te görevleri de açar — O4).
- Hedef bir **feature** ise → `MOD: GENİŞLETME-TASK`.
Planner düğümleri `gp apply` ile yazar.

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
oluşturuldu. `/gp:run` ile çalıştırabilirsin." (`/gp:run` genişletmeyi kendisi de yapar —
bu skill yalnız elle genişletme içindir.)
