# Faz 10 — Paketleme & Yayın

**Amaç:** Plugin'i başkalarının birkaç dakikada kurup kullanabileceği hale getirmek ve
benchmark sonuçlarıyla birlikte yayınlamak.

**Ön koşul:** Faz 8 (kanıt) ve Faz 9 (dayanıklılık).
**Çıktı:** Yayınlanmış plugin, dokümantasyon, demo.

## Görevler

### 10.1 Kurulum deneyimi
- [ ] Tek adımlık kurulum: `claude plugin marketplace add <yol>` + `claude plugin install gp@graphpilot`
- [x] ~~`gp` CLI kurulumu~~ → plugin `bin/` klasöründen ([ADR-006](../docs/decisions.md#adr-006))
- [ ] ❗ **Platform sınırı belgelenmeli:** `bin/` içeren plugin **claude.ai ve Cowork'te
      kurulmaz**. GP yalnızca Claude Code CLI / masaüstü uygulaması / IDE eklentisinde çalışır.
- [ ] Node sürüm gereksinimi (`engines`) ve nvm notu — yerel ortamda v18 bulundu, 20+ gerekiyor
      (research.md Açık Soru #1)
- [ ] `/gp:doctor` ilk çalıştırmada eksikleri söyler
- [ ] Windows, macOS, Linux'ta test

### 10.2 Dokümantasyon
- [ ] `README.md`: 30 saniyelik özet, kurulum, ilk proje (5 dakikalık hızlı başlangıç)
- [ ] `docs/CONCEPTS.md`: graph, düğüm tipleri, flag'ler, routing — görsellerle
- [ ] `docs/CONFIG.md`: `config.yml` tüm alanlar
- [ ] `docs/BENCHMARK.md`: metodoloji ve sonuçlar (Faz 8 raporundan)
- [ ] Türkçe ve İngilizce

### 10.3 Varsayılanları kilitleme
- [ ] Ablasyon sonuçlarına göre varsayılan `config.yml` son hali
- [ ] Routing tablosu son hali
- [ ] Agent talimatlarının son gözden geçirmesi (kısa, tutarlı)

### 10.4 Sürümleme
- [ ] Semantic versioning
- [ ] `CHANGELOG.md`
- [ ] Graph format sürümü (`.graph/config.yml` içinde `format_version`) ve migration stratejisi

### 10.5 Demo
- [ ] Kayıtlı demo: "kitap satış sitesi" isteğinden çalışan uygulamaya, yan yana ham Claude Code ile token sayacı
- [ ] Örnek graph'ın Obsidian graph görünümü ekran görüntüsü
- [ ] Demo projesi ayrı bir repo olarak

### 10.6 Yayın
- [ ] GitHub repo (lisans seçimi: MIT önerilir)
- [ ] ❗ Plugin adı `gp` — `claude`/`anthropic` içeren adlar `claude plugin validate`'te
      hata/uyarı veriyor (Faz 0 bulgusu). Marketplace adı da rezerve adlardan olmamalı.
- [ ] ❗ Abonelik planlarında headless kota kurallarını yayın öncesi **tekrar doğrula**
      (research.md Açık Soru #5)
- [ ] Topluluk plugin listelerine / marketplace'lere başvuru
- [ ] Lansman yazısı: problem, yaklaşım, benchmark, sınırlar

### 10.7 Geri bildirim döngüsü
- [ ] Issue şablonları (hata, öneri, benchmark sonucu paylaşımı)
- [ ] Opsiyonel ve açık rızalı anonim metrik paylaşımı (`/gp:report --share` → sadece özet sayılar)

### 10.8 Sonraki adımlar (Faz 11+ adayları)
- [ ] Dinamik agent'lar (düğüme özel talimat üretimi)
- [ ] Tree-sitter tabanlı gerçek kod graph'ı (repo-map yerine)
- [ ] Bağımsız orkestratör (Agent SDK + kullanıcının kendi API key'i) — bağlam üzerinde tam kontrol
- [ ] Web/masaüstü panel: graph görselleştirme ve canlı ilerleme
- [ ] Ekip modu: birden fazla kişi aynı graph üzerinde

## Claude'a örnek prompt

```
faz-10 dosyasındaki 10.2 görevindeki README.md'yi yaz. Hedef okuyucu: Claude Code kullanan
bir geliştirici. İlk ekranda: ne yapar, neden daha ucuz (benchmark'tan tek rakam),
kurulum. Uzun anlatımları docs/ altına linkle.
```

> Not: Faz 11 (optimize review & API testi) bu fazdan önce bitirilirse ilk sürüme dahil edilir;
> sonra bitirilirse ayrı bir sürüm olarak yayınlanır.

## Kabul kriterleri
- [ ] Projeyi hiç bilmeyen biri README ile 10 dakikada ilk planı çalıştırabiliyor
- [ ] Üç işletim sisteminde kurulum test edildi
- [ ] Benchmark sonuçları ve sınırları açıkça yayınlandı

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
