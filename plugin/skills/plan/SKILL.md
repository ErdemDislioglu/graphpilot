---
description: >-
  Kullanıcının serbest metin isteğini netleştirme soruları + brief + L1 epic'lere
  dönüştürür, onaylatır. Kullanıcı "/gp:plan <istek>" yazdığında çalışır.
argument-hint: "<proje isteği>"
---

# /gp:plan

> Bu skill ANA THREAD'de çalışır (sen, bu mesajı okuyan). `planner` subagent'ı
> kullanıcıya soru SORAMAZ (`AskUserQuestion` aracı yok) — soru sorma işini SEN yaparsın.

## Akış

### 1. Mevcut proje taraması
`.graph/` yoksa önce **`/gp:init`**'i (bu skill'i) çalıştır. Sonra:
`node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" repomap --json`
`fileCount: 0` → boş proje. `fileCount > 0` → mevcut proje, repomap özetini planner'a
geçeceksin.

### 2. Netleştirme soruları — planner'ı SORU MODUNDA çağır
`planner` agent'ını şu görev mesajıyla çağır (Agent tool):
```
MOD: SORU
İstek: <kullanıcının yazdığı istek>
Repomap özeti: <1. adımın çıktısı, veya "boş proje">
```
Planner'ın döndürdüğü `questions` dizisi **boşsa** adım 3'e geç, hiçbir şey sorma.
**Boş değilse**, `AskUserQuestion` aracını SEN çağır — planner'ın ürettiği
`question`/`options`/`recommended` alanlarını olduğu gibi kullan, kendi soru üretme.
Kullanıcı "sen karar ver" derse veya bir soruyu atlarsa, o alan için `recommended`
değerini kullanacağını not et (adım 3'e bunu "atlandı" olarak aktar).

### 3. Brief + epic üretimi — planner'ı ÜRETİM MODUNDA çağır
```
MOD: ÜRETİM
İstek: <istek>
Repomap özeti: <1. adım>
Cevaplar: <2. adımın cevapları, veya "kullanıcı atladı, varsayımları kullan">
```
Planner bu çağrı sırasında `gp brief` ve `gp new epic --depends-on ...` komutlarını
**kendisi** çalıştırır (brief.md ve epic.md'ler bu noktada zaten diskte yazılmıştır —
ama kullanıcı henüz ONAYLAMADI, bir sonraki adımda onay alınana kadar bu "taslak"
sayılır; onaylanmazsa adım 5'te düzeltilir/`gp new` ile yeniden yapılır).

### 4. Özet göster
Planner'ın döndürdüğü JSON'dan kullanıcıya göster:
- `briefSummary` (5 satırı geçmeyen özet)
- Epic tablosu: id, summary, dependsOn
- `assumptions` varsa (kullanıcının atladığı sorular için kullanılan varsayımlar)

### 5. Onay akışı
`AskUserQuestion` ile sor: **onayla** / **epic ekle-çıkar-birleştir** / **brief'i düzelt**.
- **Onayla** → adım 6'ya geç.
- **Düzeltme istenirse** → kullanıcının geri bildirimini planner'a ÜRETİM MODUNDA
  tekrar ver (`Cevaplar` alanına "Önceki taslak reddedildi, değişiklik: <geri bildirim>"
  ekle), planner gerekirse önceki epic'leri `gp set <id> ...` ile düzeltir ya da
  yeni epic ekler. Adım 4'e dön.
- **Onaya kadar hiçbir "gerçek" kod yazılmaz** — bu noktada sadece graph düğümleri
  (brief.md, epic.md'ler) var, henüz `/gp:expand` veya `/gp:run` çalışmadı.

### 6. Son kontrol
```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" validate --json
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" index --json
```
`validate` hata döndürürse düzelt (planner'ı tekrar çağır), `issues` boşalana kadar.
Kullanıcıya kısaca bitir: "`N` epic oluşturuldu, graph geçerli. `/gp:expand` ile
devam edebilirsin (Faz 5)."

## Planlama maliyeti
Bu oturumun token kullanımını not et (Faz 8'in `_metrics/plan.jsonl` altyapısı henüz
yok — şimdilik sadece kullanıcıya kabaca bildir, otomatik kayıt Faz 8'de gelecek).
