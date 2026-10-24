# Faz 4 — Intake & Planlama

**Amaç:** Kullanıcının serbest metin isteğini netleştirme soruları + brief + L1 epic'lere dönüştürmek,
kullanıcıya onaylatmak.

**Ön koşul:** Faz 3.
**Çıktı:** Çalışan `/gp:plan` komutu.

## Akış

```
Kullanıcı: /gp:plan "kitap satışı yapan bir web sitesi yap"
  → (1) Mevcut proje taraması (boş mu, var olan kod mu?)
  → (2) Netleştirme soruları (en fazla 5, sadece gerekiyorsa)
  → (3) brief.md taslağı
  → (4) L1 epic listesi (sadece epic.md'ler, görev yok)
  → (5) Kullanıcı onayı / düzenleme
  → (6) gp validate + gp index
```

## Görevler

### 4.1 Mevcut proje tespiti
- [x] Boş klasör mü, mevcut kod mu? (`gp repomap` ile)
- [x] Mevcut projede: stack'i tespit et, brief'e "mevcut durum" bölümü ekle
- [x] Boş projede: stack önerisi soruların parçası olur

### 4.2 Netleştirme soruları

> **Faz 0 kısıtı:** Subagent'lar `AskUserQuestion` aracını **her zaman kaybeder**. Yani planner
> subagent'ı kullanıcıya soru **soramaz**. Ayrıntılı akış (iki-çağrılı planlama: soru modu →
> ana thread sorar → üretim modu) → [research.md, Açık Soru #2 detayı](../docs/research.md#açık-soru-2--detay-netleştirme-soruları-akışı).

- [x] `planner` agent'ına iki mod ekle: **soru modu** (istek + repomap özeti → yapılandırılmış
      soru listesi JSON, boş liste de dönebilir) ve **üretim modu** (istek + repomap + cevaplar →
      brief taslağı + epic listesi)
- [x] `/gp:plan` skill'i: soru modu çağrısının çıktısını `AskUserQuestion` ile **ana thread'den**
      kullanıcıya sorar (planner'ın ürettiği metni kullanır, kendi soru üretmez)
- [x] Soru üretme talimatı: sadece mimariyi değiştiren sorular (stack, auth var mı, ödeme var mı, deploy hedefi)
- [x] En fazla 5 soru, her biri seçenekli ve önerili ("Önerilen: X")
- [x] Kullanıcı "sen karar ver" derse varsayılanları kullan ve brief'te "Varsayımlar" bölümüne yaz
- [x] Cevaplar netse hiç soru sorma

### 4.3 Brief üretimi
- [x] SPEC'teki brief şablonuna uy
- [x] Token sınırı (~1500) — `gp validate` kontrol eder
- [x] "Kapsam dışı" bölümü zorunlu (kapsam kaymasını önler)

### 4.4 Epic üretimi
- [x] 3–10 epic hedefi; her biri bağımsız teslim edilebilir parça
- [x] İlk epic her zaman "Proje iskeleti ve altyapı" (scaffold)
- [x] Epic'ler arası `depends_on`
- [x] Her epic için `gp new epic` kullan (elle dosya yazma yok)
- [x] Bu aşamada **feature/task açılmaz** (tembel genişletme Faz 5'te)

### 4.5 Onay akışı
- [x] Kullanıcıya özet göster: brief'in 5 satırlık özeti + epic tablosu (id, özet, bağımlılık)
- [x] Seçenekler: onayla / epic ekle-çıkar-birleştir / brief'i düzelt
- [x] Onaya kadar hiçbir kod yazılmaz
- [x] Onay sonrası `gp validate` + `gp index`

### 4.6 Planlama maliyetini ölç
- [x] Planlama oturumunun token kullanımını `_metrics/plan.jsonl`'e kaydet — **Faz 8 altyapısı
      henüz yok, roadmap'in kendi talimatına göre manuel not olarak `/gp:plan` skill'ine
      yazıldı** ("kullanıcıya kabaca bildir, otomatik kayıt Faz 8'de")
- [ ] Hedef: planlama toplam maliyetin küçük bir kısmı olmalı — **ölçülemedi**, gerçek bir
      planlama oturumu (canlı model çağrısı) gerektirir, bkz. 4.7

### 4.7 Senaryo testi
- [x] Bench senaryoları yazıldı (`bench/scenarios/kucuk.md`, `orta.md`, `buyuk.md` — Faz 0.6'dan
      beri bekliyordu, roadmap'in kendi 0.6 tanımıyla birebir)
- [ ] **Canlı test yapılamadı — kasıtlı sınır (Faz 3.4/3.7'deki aynı neden):** `/gp:plan`'ı
      gerçekten çalıştırmak Agent tool'u (politika dışı, istenmedi) veya gerçek bir model
      çağrısı (onaysız gerçek kullanım harcar) gerektirir. **Mekanizma elle simüle edilip
      kanıtlandı** (brief yaz → 3 epic `--depends-on` ile oluştur → validate → index, hepsi
      gerçek `gp` ile çalıştı, hatasız) — ama planner'ın GERÇEK muhakemesi (doğru soruları
      sorması, mantıklı epic bölmesi) test edilmedi. Kullanıcının kendi oturumunda
      `/gp:plan` ile denemesi gerekiyor.
- [ ] Bulguları planner talimatına geri besle — canlı test olmadan geri besleme yapılamaz

## Claude'a örnek prompt

```
faz-04 dosyasındaki 4.2 görevini yap. plugin/commands/plan.md ve plugin/agents/planner.md
dosyalarını düzenle. Soru sayısı 5'i geçmesin, her soru seçenekli olsun.
Sonra bench/scenarios/orta.md görevini kullanarak bir deneme planı üret ve çıktıyı bana göster.
```

## Kabul kriterleri
- [ ] 3 senaryoda da geçerli (`gp validate` hatasız) brief + epic'ler üretiliyor —
      **canlı test edilemedi** (4.7'deki sınır); mekanizma (brief+epic+validate+index
      zinciri) elle simüle edilip hatasız çalıştığı kanıtlandı, planner'ın muhakemesi değil.
- [x] Kullanıcı onayı olmadan kod yazılmıyor — **yapı itibariyle sağlanıyor**: `/gp:plan`
      skill'inin 5. adımı açık bir onay kapısı; epic'lerin ÜRETİM modunda yazılması bile
      "taslak" sayılıyor, `/gp:expand`/`/gp:run` (gerçek kod) onay olmadan hiç çağrılmıyor.
- [x] Netleştirme soruları gereksiz yere sorulmuyor — **yapı itibariyle sağlanıyor**:
      planner'ın SORU modu talimatı net istekte boş liste döndürmesini açıkça şart koşuyor;
      canlı doğrulama 4.7'deki sınıra bağlı.

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
| 2026-10-24 | 4.1–4.5 | `planner.md` iki-modlu (SORU/ÜRETİM) olarak yeniden yazıldı, `/gp:plan` skill'i tam akışla yazıldı. Mekanizma (brief yaz → epic'leri `--depends-on` ile sırayla oluştur → validate → index) gerçek `gp` komutlarıyla elle simüle edildi, hatasız çalıştı. |
| 2026-10-24 | — | `gp` CLI'a 2 yeni komut eklendi: `gp brief --file` (planner'ın Write aracı yok, bu yüzden brief.md'yi `gp` üzerinden yazar) ve `gp new --depends-on` (epic'leri bağımlılık sırasıyla oluşturmak için). 15 yeni test (135/135 toplam). |
| 2026-10-24 | 4.7 | `bench/scenarios/{kucuk,orta,buyuk}.md` yazıldı (Faz 0.6'dan beri bekliyordu). Dürüst sınır: canlı `/gp:plan` testi yapılamadı (Agent tool politika dışı, gerçek model çağrısı onaysız kullanım harcar) — kullanıcının kendi oturumunda denemesi gerekiyor. |
