# Faz 11 — Optimize Review & API Testi

**Amaç:** Review ve API testini, tipik kullanımda en çok token yakan iki iş olmaktan çıkarıp
ucuz hale getirmek. İlke: **model düşünsün, script çalışsın.**

**Ön koşul:** Faz 8 (MVP benchmark'ı review/API testi kapalıyken alındı). Faz 10'dan önce ya da sonra yapılabilir.
**Çıktı:** Seviyesi ayarlanabilir review, LLM'in API'yi elle çağırmadığı API test akışı,
ve bunlar açıkken yeniden alınmış benchmark.

## Neden pahalılar? (tasarımın çıkış noktası)
- Reviewer tüm kodu ya da çok geniş bir bağlamı okuyor
- Agent API'yi kendisi çağırıp büyük JSON yanıtlarını bağlama alıyor
- Tarayıcı / Swagger UI üzerinden ekran ekran test (ekran görüntüsü ve sayfa okuma çok pahalı)
- Her seferinde tüm API ya da tüm modül test ediliyor

## A. Optimize review

### 11.1 Reviewer agent
- [ ] `agents/reviewer.md` — `omitClaudeMd: true`, `tools: Read, Grep, Glob`,
      `disallowedTools` ile Write/Edit/Bash kapalı
- [x] ~~`reviewer-triage` Haiku varyantı~~ → **gereksiz.** Model çağrı anında geçilir
      ([ADR-002](../docs/decisions.md#adr-002)); tek `reviewer` agent'ı hem triyaj (haiku)
      hem derin review (sonnet) için kullanılır.

### 11.2 Review seviyeleri
- [ ] `config.yml`:

```yaml
review:
  level: risky_only   # off | risky_only | every_node | epic_end
  triage_model: haiku
  deep_model: sonnet
  max_findings: 5
```

- [ ] `risky_only`: sadece `risk: high` veya `complexity: high` düğümler
- [ ] `epic_end`: epic bitince tüm epic diff'i tek seferde (küçük düğümlerde daha ucuz olabilir — ölç)

### 11.3 Önce araçlar, sonra model
- [ ] Review'dan önce deterministik kontroller: lint, tip kontrolü, statik analiz (ör. Semgrep), testler
- [ ] Bu araçların bulgusu varsa review'a geçilmez; önce doğrulama döngüsü düzeltir
- [ ] Reviewer'a "araçların zaten kontrol ettiği şeylere bakma" talimatı

### 11.4 Sadece diff
- [ ] Reviewer girdisi: düğümün diff'i + ilgili bilgi düğümünün `## Arayüz` ve `## Kararlar` bölümleri + kabul kriterleri
- [ ] Tüm dosya ya da repo okunmaz; gerekirse sadece diff'teki fonksiyonun çevresi

### 11.5 Kademeli review
- [ ] Haiku triyaj: diff'i tarar, şüpheli parçaları (hunk) işaretler ya da "temiz" der
- [ ] Sadece işaretlenen parçalar Sonnet'e gider
- [ ] Ölç: triyajın kaçırdığı gerçek sorun oranı (bilerek hata enjekte edilmiş senaryolarla)

### 11.6 Kontrol listesi ve yapılandırılmış çıktı
- [ ] Sabit kontrol listesi: mantık hatası, sınır durumları, hata yönetimi, güvenlik, mimariye (bilgi düğümüne) uyum
- [ ] Çıktı: `[{ dosya, satır, kategori, önem, öneri }]`, en fazla `max_findings`
- [ ] Bulgular doğrulama döngüsüne "eksik listesi" olarak girer (Faz 6.3 ile aynı mekanizma)

## B. Optimize API testi

### 11.7 Model API'yi çağırmaz, test yazar
- [ ] Tester agent, OpenAPI şemasından ya da bilgi düğümündeki endpoint sözleşmesinden **bir kez** test dosyası üretir
- [ ] Testleri script çalıştırır; modele sadece başarısız testlerin kısa özeti döner
- [ ] Agent'ın `curl` ile elle istek atması talimatla yasak + **`PreToolUse` hook** ile
      engelli (`permissionDecision: "deny"`, Faz 0'da doğrulandı). Sadece talimata güvenme —
      `tools`/`disallowedTools` ve hook birlikte kullanılır.

### 11.8 Sözleşme testleri (sıfır token)
- [ ] OpenAPI şemasından otomatik test üreten bir araç entegrasyonu (ör. Schemathesis) — LLM olmadan çalışır
- [ ] Şema yoksa: önce şemayı üretmek bir görev düğümü olur (interface-first kuralıyla uyumlu)

### 11.9 Tarayıcı yok
- [ ] API testi için Swagger UI / tarayıcı otomasyonu kullanılmaz; doğrudan şema JSON'u ve HTTP test kodu
- [ ] Tarayıcı sadece gerçek UI testi gereken düğümlerde ve ayrı bir flag ile (`type: e2e`)

### 11.10 Sadece etkilenen endpoint'ler
- [ ] `touches` + bilgi düğümündeki endpoint listesi → değişen endpoint'ler
- [ ] Sadece bunların testleri çalışır; tam test seti epic sonunda bir kez

### 11.11 Yanıt kırpma
- [ ] Başarısız testte tüm yanıt gövdesi değil: beklenen vs gelen farkı, status kodu, ilk N satır
- [ ] Büyük JSON'larda sadece farklı alanların yolu (path) ve değerleri

### 11.12 Test ortamı
- [ ] Uygulamayı test için ayağa kaldırma/indirme script'i (port, test veritabanı, seed verisi)
- [ ] Bu adım tamamen deterministik; modele sadece "ortam hazır / hata" bilgisi gider

## C. Ölçüm

### 11.13 Yeniden benchmark
- [ ] Faz 8 senaryoları review ve API testi **açık** olarak tekrar koşturulur
- [ ] Karşılaştırma: ham Claude Code'da "kodu review et + API'yi test et" isteği vs GraphPilot
- [ ] Ablasyon: her teknik (diff-only, triyaj, sözleşme testi, kırpma) tek tek kapatılarak etkisi
- [ ] Kalite: bilerek enjekte edilmiş hataların kaçı yakalandı

## Claude'a örnek prompt

```
faz-11 dosyasındaki 11.7 görevini yap. Tester agent talimatını, OpenAPI şemasından tek seferde
test dosyası üretecek ve API'yi asla elle çağırmayacak şekilde güncelle. Test çalıştırma ve
çıktı kırpma script'ini cli/ altına ekle. Örnek bir şema ile dene ve token kullanımını raporla.
```

## Kabul kriterleri
- [ ] Review seviyeleri `config.yml` ile değiştirilebiliyor
- [ ] API testi akışında agent hiç doğrudan HTTP isteği atmıyor
- [ ] Yeniden benchmark'ta review + API testinin ek maliyeti ham Claude Code'a göre belirgin şekilde düşük ve hata yakalama oranı kabul edilebilir

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
