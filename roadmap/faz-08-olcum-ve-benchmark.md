# Faz 8 — Ölçüm & Benchmark

**Amaç:** "Ham Claude Code'a göre daha az token" iddiasını tekrarlanabilir şekilde kanıtlamak.
Bu faz ürünün pazarlama iddiasının temelidir.

**Ön koşul:** Faz 6. (Ölçüm altyapısı 8.1–8.3, Faz 6 ile paralel başlayabilir.)
**Çıktı:** Düğüm bazında metrikler, `/gp:report`, karşılaştırmalı benchmark raporu.

## Görevler

### 8.1 Metrik toplama

> **Faz 0 kararı — [ADR-004](../docs/decisions.md#adr-004):** Hook girdisinde **token/maliyet
> alanı yok** (doküman net). Birincil kaynak **transcript JSONL**; yolu her hook olayında
> `transcript_path` ile geliyor. Hook'lar sadece *olay* kaydı için (tool çağrı sayacı, zaman).
> `claude -p --output-format json` (`total_cost_usd` + model bazında kırılım) Mod B ve
> benchmark'ın ham kolunda ikinci kaynak / çapraz doğrulama.
> ⚠️ Maliyet rakamları **istemci tarafı tahmin**; faturadan farklı olabilir — raporda belirt.

- [x] ~~Kaynak kararı~~ → transcript JSONL birincil (ADR-004)
- [ ] `gp metrics ingest <transcript_path>` — JSONL okuyucu
- [ ] ❗ **Önce şemayı çöz:** transcript JSONL'in satır biçimi ve `usage` alan adları
      (`input_tokens`, `cache_read_input_tokens` vb.) dokümante **değil**. Gerçek bir dosya
      `jq` ile incelenip `docs/SPEC.md`'ye yazılmalı (research.md Açık Soru #4)
- [ ] Düğüm başına kayıt (`_metrics/<epic>.jsonl`):

```json
{"node":"E02-F01-T03","model":"sonnet","agent":"coder","attempt":1,
 "input_tokens":0,"output_tokens":0,"cache_read":0,"cache_write":0,
 "cost_usd":0,"duration_s":0,"turns":0,"tool_calls":{"Read":0,"Edit":0,"Bash":0},
 "result":"done"}
```

- [ ] Planlama ve genişletme oturumları da ayrı kayıt
- [ ] Doğrulama döngüsü turları ayrı kayıt: `{"node":"...","round":2,"issues_found":1,"tokens":0}`
- [ ] Devam (resume) oturumları `kind: resume` etiketiyle ayrı kayıt

### 8.2 Maliyet hesabı
- [ ] Model başına fiyat tablosu `config.yml`'de (güncel fiyatlar resmi sayfadan alınır, tarihli)
- [ ] Abonelik kullanıcıları için "API eşdeğeri maliyet" olarak raporlanır

### 8.3 `/gp:report`
- [ ] Proje özeti: toplam token, maliyet, süre, model dağılımı, en pahalı 5 düğüm
- [ ] Epic bazında kırılım
- [ ] Başarısız/yükseltilmiş düğümler listesi
- [ ] Çıktı: `.graph/_metrics/report.md`

> **Kapsam:** Bu benchmark review ve API testleri **kapalıyken** alınır (MVP).
> Faz 11 tamamlandığında aynı senaryolar review/API testi açık olarak yeniden koşturulur.

### 8.4 Benchmark koşturucu

> **Faz 0'dan devredilen iş:** Faz 0.6 baseline ölçümü **buraya ertelendi** (kullanıcı kararı,
> 2026-10-23) — ham ve gp kolları aynı harness'ta koşsun, metodoloji değişirse ölçüm
> tekrarlanmak zorunda kalmasın. Yani bu görev hem baseline'ı hem karşılaştırmayı üretir.
> ❗ Ham kolda da **`--bare` kullanılmaz** (ADR-001); iki kol aynı koşullarda ölçülmeli.
> ⚠️ `--bare` olmadan `claude -p`, güvenilmeyen klasörde bile proje hook'larını ve MCP
> server'larını çalıştırır, onay istemez. Koşular temiz klasörlerde yapıldığı için bizi
> etkilemiyor; `docs/BENCHMARK.md`'de not düşülmeli.

- [ ] 3 referans senaryo seç ve sabit görev metinlerini yaz (`bench/scenarios/*.md`) *(Faz 0.6'dan)*
- [ ] `bench/run.ts`: senaryo × mod (ham / gp) × tekrar sayısı
- [ ] Her koşu temiz bir klasörde, aynı görev metniyle
- [ ] Ham mod: aynı görev metni doğrudan Claude Code'a (headless) verilir
- [ ] GP modu: `/gp:plan` (soru cevapları önceden sabitlenmiş) → `/gp:run`
- [ ] Kontrollü değişkenler: aynı Claude Code sürümü, aynı tarih aralığı, aynı varsayılan model

### 8.5 Kalite ölçümü
- [ ] Token azaltmak kaliteyi düşürmemeli. Her senaryo için:
  - Gizli kabul testi seti (`bench/scenarios/<s>/acceptance/`) — agent'lar görmez
  - Geçen test oranı
  - Manuel müdahale sayısı
  - Build/lint temiz mi
- [ ] Rapor: token tasarrufu **ve** kalite yan yana

### 8.5b Doğrulama döngüsü ölçümü
- [ ] Döngü açık vs kapalı: token farkı ve gizli kabul testi geçme oranı farkı
- [ ] Ortalama kaç turda yakınsıyor, kaç düğümde sınırda kırılıyor
- [ ] Katman 2'nin (Haiku kabul kontrolü) yakaladığı ve Katman 1'in kaçırdığı eksik sayısı

### 8.5c Kesinti sonrası devam ölçümü
- [ ] Senaryo: orta senaryo yürütmesini rastgele bir düğümün ortasında öldür, ertesi gün simülasyonu (cache soğuk) ile devam ettir
- [ ] Karşılaştır: ham Claude Code'da aynı noktadan `--continue`/`--resume` ile devam vs `/gp:run` ile devam
- [ ] Metrik: devam oturumunun ilk çağrı token'ı ve toplam ek maliyet

### 8.6 Benchmark raporu
- [ ] `bench/results/report.md`: senaryo başına ortalama ± sapma
- [ ] Grafik (token ve maliyet karşılaştırması)
- [ ] Dürüst sınırlar bölümü: hangi senaryoda kazanç az ya da yok
- [ ] Faz 0 baseline'ıyla tutarlılık kontrolü

### 8.7 Sürekli benchmark
- [ ] Küçük senaryo her sürümde otomatik koşar (CI veya manuel script)
- [ ] Gerileme (regression) eşiği: token %10'dan fazla artarsa uyarı

## Claude'a örnek prompt

```
faz-08 dosyasındaki 8.4 görevini yap. bench/run.ts'yi yaz; senaryo, mod ve tekrar sayısı
parametre olsun. Her koşuyu ayrı geçici klasörde yap ve sonuçları bench/results/raw/ altına
JSON olarak kaydet. Önce küçük senaryoda 1 tekrarla dene, çıktıyı bana göster.
```

## Kabul kriterleri
- [ ] 3 senaryo × 2 mod × en az 3 tekrar tamamlandı
- [ ] Rapor token, maliyet ve kalite metriklerini yan yana gösteriyor
- [ ] Sonuçlar tekrarlanabilir (aynı komutla başkası da koşturabilir)

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
