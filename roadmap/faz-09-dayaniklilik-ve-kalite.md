# Faz 9 — Dayanıklılık & Kalite

**Amaç:** "Kesintisiz geliştirme" vaadini gerçek kılmak: kesinti, limit dolması, çökme ve
elle müdahale sonrası graph'ın tutarlı kalması ve kaldığı yerden devam etmesi.

**Ön koşul:** Faz 6. Faz 7–8 ile paralel ilerleyebilir.
**Çıktı:** Dayanıklı yürütme, kapsamlı testler, hata senaryoları dokümanı.

## Görevler

### 9.1 Kaldığı yerden en az maliyetle devam
**İlke:** Eski Claude oturumu asla sürdürülmez (tüm sohbet geçmişini yeniden yükler, pahalıdır).
Her devam **yeni temiz oturum + graph** ile başlar.

- [ ] `gp resume` komutu: devam için ~500 token'lık bir "nerede kaldık" özeti üretir
  - `gp status` özeti, `running` kalmış düğümler, sıradaki `ready` düğümler, son başarısızlıklar
- [ ] `/gp:run` başlarken önce `gp resume` çıktısını okur; graph'ın geri kalanını okumaz
- [ ] `status: running` kalmış düğüm için karar:
  - `## Yarım iş` notu + WIP commit varsa → düğüm **kaldığı yerden** devam eder (bağlam paketi + yarım iş notu + WIP diff özeti)
  - Not yoksa ve commit'lenmemiş değişiklik varsa → değişiklik geri alınır, düğüm `pending`'e döner
- [ ] Bitmiş düğümler tekrar okunmaz; sadece handoff'ları bağlam paketine girer (zaten Faz 2.8 kuralı)
- [ ] Prompt cache süresi dolmuş olacağı için ilk çağrıda brief yeniden cache'lenir; brief'in küçük tutulması bu maliyeti sınırlar
- [ ] **Faz 0 bulgusu:** agent frontmatter'ında `experimental.cacheTtl: 1h` var (varsayılan 5m).
      Uzun yürütmelerde cache ömrünü 1 saate çıkarmak devam maliyetini düşürebilir — Faz 8'de ölç
- [ ] `gp recover` komutu: tutarsızlıkları (yetim WIP commit, `running` ama değişikliği olmayan düğüm vb.) raporla ve düzelt
- [ ] Hedef metrik (Faz 8'de ölçülür): **devam maliyeti ≈ kalan düğümün tek başına maliyeti + küçük sabit ek**

### 9.2 Limit dolması
- [ ] Kullanım limiti veya rate limit hatasını tanı
- [ ] Davranış: mevcut düğümü güvenli noktada durdur, durumu kaydet, kullanıcıya "şu düğümden devam edilecek" bilgisi ver
- [ ] Mod B'de: bekleyip otomatik yeniden deneme seçeneği (`config.yml`)

### 9.3 Elle düzenleme toleransı
- [ ] Kullanıcı bir düğümü elle düzenlerse (`depends_on` değiştirmek, görev eklemek) `gp validate` + `gp index` yeterli olmalı
- [ ] Kullanıcı kodu elle değiştirirse: ilgili bilgi düğümlerini "şüpheli" işaretleme (dosya hash'i ile `source_files` karşılaştırması)
- [ ] `gp sync` komutu: kod ile bilgi düğümleri arasındaki farkları listeler

### 9.4 Graph bozulmalarına karşı koruma
- [ ] Atomik yazma (Faz 2.6) tüm yazma yollarında
- [ ] `INDEX.md` ve `_index.md` her zaman yeniden üretilebilir (kayıp kabul edilebilir)
- [ ] `.graph/` git'te izlenir; her `done` commit'i graph değişikliğini de içerir

### 9.5 Uç durumlar
- [ ] Döngüsel bağımlılık oluşturan genişletme
- [ ] Hiç `ready` düğüm yok ama bitmemiş düğüm var (deadlock) → raporla
- [ ] Çok büyük brief / bilgi düğümü → otomatik özetleme önerisi
- [ ] Agent handoff yazmadan bitirirse → bir kez "sadece handoff yaz" talebi (haiku)

### 9.6 Test kapsamı
- [ ] CLI: birim testleri (> %85)
- [ ] Entegrasyon: sahte (mock) agent ile tam döngü testi — LLM çağırmadan durum makinesini test eder
- [ ] Hata enjeksiyonu: düğüm ortasında süreç öldürme, bozuk frontmatter, eksik dosya

### 9.7 Güvenlik

> ❗ **Faz 0 kısıtı:** Plugin agent dosyalarında `permissionMode` **yok sayılır**. İzin kısıtı
> `tools`/`disallowedTools` (agent başına) + plugin `hooks/hooks.json` içinde `PreToolUse`
> (`permissionDecision: "deny"` veya exit kodu 2) ile yapılmalı.

- [ ] Agent'ların Bash izinleri kısıtlı — `tools: "Bash(npm test *)"` biçiminde izin kuralı
      sözdizimi + `PreToolUse` hook'u ile yasak komut filtresi
- [ ] `.env` ve gizli dosyalar bağlam paketine asla girmez (`gp context` dışlama listesi)
- [ ] `touches` dışındaki dosyalara yazma tespiti (PostToolUse hook) → uyarı

### 9.8 Hata senaryoları dokümanı
- [ ] `docs/TROUBLESHOOTING.md`: her senaryo için belirti, sebep, çözüm komutu

## Claude'a örnek prompt

```
faz-09 dosyasındaki 9.6 görevindeki "sahte agent ile tam döngü testi"ni yaz.
Agent çağrısını bir arayüzün arkasına al, testte rastgele başarılı/başarısız dönen
bir mock kullan. Retry → escalate → failed → blocked akışını doğrula.
```

## Kabul kriterleri
- [ ] Yürütme ortasında süreç öldürülüp yeniden başlatıldığında graph tutarlı devam ediyor
- [ ] Ertesi gün devam senaryosunda yarım kalan düğüm baştan değil, kaldığı yerden tamamlanıyor
- [ ] Mock agent'lı entegrasyon testi CI'da geçiyor
- [ ] TROUBLESHOOTING dokümanı en az 8 senaryo içeriyor

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
