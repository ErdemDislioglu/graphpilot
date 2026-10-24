# Faz 5 — Tembel Genişletme & Flag'leme

**Amaç:** Epic'leri ihtiyaç anında feature'lara, feature'ları atomik görevlere bölmek;
her görevi flag'leyip routing'e hazır hale getirmek; bilgi düğümlerini başlatmak.

**Ön koşul:** Faz 4.
**Çıktı:** Çalışan `/gp:expand` komutu, kalibre edilmiş flag kuralları.

## Tembel genişletme prensibi

- Epic, **çalışmaya başlanacağı zaman** feature'lara açılır.
- Feature, **çalışmaya başlanacağı zaman** görevlere açılır.
- Böylece her bölme, önceki düğümlerin handoff'larıyla güncel bilgiyle yapılır.
- `/gp:run` sırası gelen bir epic/feature açılmamışsa otomatik `expand` çağırır.

## Görevler

### 5.1 Epic → Feature genişletme
- [x] Planner girdisi: brief + epic.md + tamamlanmış epic'lerin bilgi düğümleri özetleri (kod değil)
- [x] Çıktı: 2–8 feature, aralarında `depends_on`
- [x] `gp new feature` ile oluşturma

### 5.2 Feature → Task genişletme
- [x] Atomik görev tanımı: tek oturumda, tek agent'la, `context_budget` içinde bitebilen iş
- [x] Her görev için: `## Görev`, `## Kabul kriterleri` (test edilebilir), `touches`, `reads`
- [x] **Interface-first kuralı:** feature'ın ilk görevi tipleri/arayüzü/şemayı tanımlar; diğerleri ona bağlanır
- [x] **Karar verildi ve SPEC'e yazıldı** (SPEC §5a Tasarım Kararı): test görevleri HER ZAMAN
      ayrı düğüm (`type: test`), implementasyona `depends_on` ile bağlı. Gerekçe: ayrı routing,
      ayrı agent (tester), ayrı Handoff. Faz 1'in bookstore örneği zaten bu şekildeydi.

### 5.3 Flag'leme
- [x] Planner her görevi flag'ler: `type`, `complexity`, `risk`, `context_size`
- [x] Flag rehberi (planner talimatına):
  - `complexity: low` → kalıp iş, tek dosya, belirsizlik yok
  - `complexity: med` → birkaç dosya, iş mantığı var
  - `complexity: high` → mimari karar, algoritma, entegrasyon, güvenlik
  - `risk: high` → veri silme, migration, auth, ödeme, geri alınması zor
- [x] Deterministik düzeltme kuralları — **gerçek kod** (`fixFlags.ts` + `gp validate --fix-flags`):
  - `touches` > 5 dosya → `context_size: large`
  - `type: docs` → `complexity` en fazla `med`
  - Gerçek CLI ile test edildi: `gp validate --fix-flags` 6 dosyaya dokunan bir görevin
    `context_size`'ını `small`→`large` olarak diske yazdı (elle doğrulandı)

### 5.4 Bilgi düğümlerini başlatma
- [x] Feature açılırken ilgili bilgi düğümleri iskelet olarak oluşturulur (`## Arayüz` boş)
- [x] Görevlerin `reads` alanı bu düğümlere link verir
- [x] Ortak bilgi (db şeması, auth modeli) `_shared/knowledge/` altına

### 5.5 Aşırı bölme / yetersiz bölme kontrolü
- [x] Uyarı kuralları: feature başına > 12 görev, ya da `context_budget` tahmini aşan görev
- [x] Çok küçük görevler (ör. tek satır config) için **birleştirme önerisi** (Faz 7.5 ile bağlantılı)

### 5.6 Kullanıcı görünürlüğü
- [x] `/gp:expand` sonunda tablo: yeni görevler, flag'ler, çözülen model (`gp route`)
- [x] Varsayılan: genişletme otomatik onaylı (epic onayı yeterli); `config.yml`'de `confirm_expand: true` ile kapatılabilir

### 5.7 Kalibrasyon
- [ ] **Canlı test yapılamadı — aynı kasıtlı sınır (Faz 3.4/4.7).** Mekanizmanın kendisi
      (knowledge iskelet → feature → interface-first task → test task ayrı → reads/touches →
      validate → route) gerçek `gp` komutlarıyla elle simüle edildi ve hatasız çalıştı;
      planner'ın GERÇEK flag muhakemesi test edilmedi.
- [ ] Yanlış flag örneklerini toplayıp planner talimatına "örnekler" olarak ekle — canlı
      test olmadan toplanacak örnek yok

## Claude'a örnek prompt

```
faz-05 dosyasındaki 5.3 görevini yap. Flag rehberini plugin/agents/planner.md'ye ekle
ve deterministik düzeltme kurallarını gp validate --fix-flags olarak CLI'a yaz.
Testleri yaz. Rehberde her flag değeri için 2 somut örnek ver.
```

## Kabul kriterleri
- [x] Bir epic feature + görevlere açılıyor, `gp validate` hatasız — **mekanizma gerçek `gp`
      komutlarıyla elle simüle edildi** (knowledge→feature→3 task→validate, 6 düğüm, 0 hata).
      "Tek komutla" kısmı (`/gp:expand`'in kendisi) canlı bir planner çağrısı gerektirir,
      bkz. 5.7'deki sınır.
- [x] Her görev `gp route` ile bir modele çözülüyor — simülasyonda doğrulandı (T01/T02→coder,
      T03 (type:test)→tester, hepsi sonnet — gp init varsayılan routing tablosuna göre doğru).
- [ ] Bench orta senaryosunda flag dağılımı makul — **ölçülemedi**, canlı planner çağrısı gerekir (5.7).

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
| 2026-10-24 | 5.1–5.6 | `planner.md`'ye GENİŞLETME-FEATURE/GENİŞLETME-TASK modları + 2 örnekli flag rehberi eklendi, `/gp:expand` skill'i tam akışla yazıldı. Tüm zincir (knowledge iskelet→feature→interface-first task→ayrı test task→reads/touches→validate→route) gerçek `gp` komutlarıyla elle simüle edildi, hatasız. |
| 2026-10-24 | 5.2 | **Karar verildi:** test görevleri her zaman ayrı düğüm — SPEC §5a'ya yazıldı. |
| 2026-10-24 | 5.3 | `gp validate --fix-flags` gerçek kodla eklendi (`fixFlags.ts`): touches>5→context_size:large, type:docs+complexity:high→med. Gerçek CLI ile diske yazdığı doğrulandı. |
| 2026-10-24 | 5.5 | `validate.ts`'e 3 yeni uyarı: feature>12 görev, 2+ küçük görev birleştirme adayı, `gp context`'i yeniden kullanan context_budget aşımı tahmini. |
| 2026-10-24 | — | `gp new task`'a `--reads`/`--touches` bayrakları eklendi (aynı `gp set` dizi-koersiyon boşluğu, `--depends-on` ile aynı gerekçe). `confirm_expand` config alanı eklendi. 14 yeni test (149/149 toplam). |
| 2026-10-24 | 5.7 | Dürüst sınır: canlı genişletme kalibrasyonu yapılamadı (Agent tool politika dışı, gerçek model çağrısı onaysız kullanım harcar). |
