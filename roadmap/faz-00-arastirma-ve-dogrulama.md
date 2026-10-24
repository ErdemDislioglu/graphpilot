# Faz 0 — Araştırma & Doğrulama

**Amaç:** Kod yazmadan önce, mimariyi etkileyen Claude Code yeteneklerini ve kısıtlarını
güncel dokümanlardan doğrulamak ve "ham Claude Code" baseline'ını ölçmek.

**Ön koşul:** Yok.
**Çıktı:** `docs/research.md`, `docs/decisions.md` (ilk kararlar), `bench/baseline/` (ilk ölçümler).

> Not: Claude Code hızlı değişiyor. Bu fazdaki her madde **güncel resmi dokümana** karşı doğrulanmalı;
> hafızadan veya eski blog yazılarından alınan bilgi "doğrulanmadı" olarak işaretlenmeli.

## Görevler

### 0.1 Plugin yapısını doğrula
- [x] Plugin manifest formatı (`.claude-plugin/plugin.json`) ve zorunlu alanlar
- [x] Plugin içinde desteklenen klasörler: `agents/`, `commands/`, `skills/`, `hooks/`, MCP server
- [x] Yerel marketplace ile plugin kurma ve güncelleme akışı
- [x] Plugin komutlarının isim alanı (`/gp:plan` gibi) nasıl oluşuyor

### 0.2 Subagent yeteneklerini doğrula
- [x] Agent tanım dosyasında `model` alanı (haiku / sonnet / opus / inherit) çalışıyor mu
- [x] `tools` alanıyla araç kısıtlama
- [x] Subagent'ın başlangıç bağlamı: ne görüyor, ne görmüyor (sistem prompt'u, CLAUDE.md, ana sohbet)
- [x] Bilinen kısıtlar: subagent başka subagent başlatabiliyor mu, kullanıcıyla etkileşebiliyor mu
- [x] Paralel subagent çalıştırma limiti ve davranışı

### 0.3 Hook'ları doğrula
- [x] Mevcut hook olayları (PreToolUse, PostToolUse, SubagentStop, Stop vb.)
- [x] Hook'a gelen veri: `transcript_path` var mı, içinde token `usage` bilgisi bulunuyor mu
- [x] Hook'la tool çıktısını değiştirmek/kırpmak mümkün mü (log kırpma için kritik)

### 0.4 Headless mod ve ölçüm
- [x] `claude -p` ile `--model`, `--output-format json`, `--max-turns`, `--allowedTools` seçenekleri
- [x] JSON çıktısında token kullanımı ve maliyet alanları
- [x] Kişisel aboneliğin headless/SDK kullanımına güncel kuralları (Agent SDK kredisi vb.) — sadece bilgi notu

### 0.5 Yürütme modu kararı (spike)
İki yolu küçük bir denemeyle karşılaştır:
- [x] **Mod A — Oturum içi subagent:** `/gp:run` komutu ana thread'de çalışır, her düğüm için subagent başlatır.
- [x] **Mod B — Headless süreç:** `gp run` CLI'ı her düğüm için ayrı `claude -p --model X` süreci başlatır.
- [x] Karşılaştırma ölçütleri: bağlam kontrolü, token ölçülebilirliği, kesinti sonrası devam, kullanıcı deneyimi
- [x] Kararı `docs/decisions.md`'ye ADR formatında yaz (beklenen: Mod A varsayılan, Mod B "uzun otonom" seçeneği)

### 0.6 Baseline benchmark

> **ERTELENDİ (2026-10-23).** Baseline ölçümü, Faz 8.4 benchmark koşucusu yazılırken aynı
> harness ile alınacak — böylece ham ve gp kolları birebir aynı koşullarda ölçülür ve
> metodoloji değişirse ölçüm tekrarlanmak zorunda kalmaz. Kabul kriteri de ertelendi.

- [ ] 3 referans senaryo seç (küçük / orta / büyük), örneğin:
  - Küçük: TODO REST API (CRUD + test)
  - Orta: Kitap satış sitesi (katalog, sepet, auth)
  - Büyük: Çok modüllü SaaS iskeleti
- [ ] Her senaryo için sabit bir görev metni yaz (`bench/scenarios/*.md`)
- [ ] Ham Claude Code ile her senaryoyu en az 2 kez çalıştır
- [ ] Kaydet: toplam input/output/cache token, maliyet, süre, test geçme oranı, manuel müdahale sayısı
- [ ] Sonuçları `bench/baseline/results.md`'ye tablo olarak yaz

### 0.7 Rakip notları
- [x] Task Master, CCPM, prd-task-loop, LeanKG/Graphify gibi araçların neyi yaptığını 1'er paragrafla `docs/research.md`'ye yaz
- [x] "Bizim farkımız" bölümü: görev graph'ı + bilgi graph'ı + flag routing + ölçülmüş tasarruf

## Claude'a örnek prompt

```
faz-00 dosyasındaki 0.2 görevini yap. Resmi Claude Code dokümanlarını kullan,
her bulgunun yanına kaynak linki koy. Doğrulayamadığın her şeyi "DOĞRULANMADI" diye işaretle.
Sonuçları docs/research.md içinde "Subagent'lar" başlığı altına yaz.
```

## Kabul kriterleri
- [x] `docs/research.md` tüm 0.1–0.4 maddelerini kaynaklı olarak içeriyor
- [x] Yürütme modu kararı ADR olarak yazıldı
- [ ] 3 senaryonun baseline ölçümleri tabloda
- [x] Mimariyi bozan bir kısıt bulunduysa ROADMAP güncellendi

## Riskler — sonuçlandı

| Risk | Sonuç |
|---|---|
| Hook'larda token bilgisi yoksa → transcript JSONL | 🔴 **GERÇEKLEŞTİ.** Hook girdisinde token/maliyet alanı yok. Ölçüm `transcript_path` üzerinden yapılacak → [ADR-004](../docs/decisions.md#adr-004) |
| Subagent `model` alanı çalışmazsa → Mod B varsayılan | 🟢 **GERÇEKLEŞMEDİ.** Model çağrı anında override edilebiliyor; agent varyantı bile gerekmiyor → [ADR-002](../docs/decisions.md#adr-002) |

### Faz 0'da ortaya çıkan yeni bulgular

1. 🟢 **`omitClaudeMd: true`** — agent'lar CLAUDE.md hiyerarşisini atlayabiliyor.
   Faz 6'nın bağlam izolasyonu kabul kriteri sağlanabilir hale geldi → [ADR-003](../docs/decisions.md#adr-003)
2. 🟢 **`PostToolUse` → `updatedToolOutput`** — tool çıktısı hook ile kırpılabiliyor.
   Faz 7.3 tam kapsamda uygulanabilir → [ADR-005](../docs/decisions.md#adr-005)
3. 🟢 **Plugin `bin/`** — Bash tool'un PATH'ine ekleniyor; `gp` CLI'ı kurulum gerektirmiyor
   → [ADR-006](../docs/decisions.md#adr-006)
4. 🔴 **`--bare` abonelik ile çalışmıyor** (API key ister) — Mod B'nin bağlam üstünlüğünü
   büyük ölçüde iptal ediyor → [ADR-001](../docs/decisions.md#adr-001)
5. 🟡 **Komutlar yerine skill** — doküman `commands/`'ı eski biçim ilan etmiş
   → [ADR-007](../docs/decisions.md#adr-007)
6. 🟡 **Subagent'ta `AskUserQuestion` yok** — netleştirme soruları (Faz 4.2) ana thread'de sorulmalı
7. 🟡 **Plugin agent'larında `permissionMode`/`hooks`/`mcpServers` yok sayılıyor** —
   Faz 9.7 güvenlik kısıtları `tools`/`disallowedTools` + plugin hook'ları ile yapılmalı

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
| 2026-10-23 | 0.1–0.5 | Resmi doküman (`code.claude.com`, v2.1.309) ile doğrulandı. `docs/research.md` yazıldı. 5 kritik bulgu, 8 ADR. |
| 2026-10-23 | 0.5 | Yürütme modu kararı: Mod A varsayılan (ADR-001). Gerekçe: `--bare` abonelikle çalışmıyor. |
| 2026-10-23 | 0.7 | Rakip notları (Task Master, CCPM, claudetm, Graphify) + "Bizim farkımız" tablosu yazıldı. |
| 2026-10-23 | 0.6 | **Ertelendi** → Faz 8.4 koşucusuyla birlikte alınacak (kullanıcı kararı). |
| 2026-10-23 | — | Node 20.20.2 nvm ile kuruldu, `default` alias 20'ye çekildi, `cli/.nvmrc` eklendi. Açık Soru #1 çözüldü. |
| 2026-10-23 | 4.2 (ileri besleme) | Açık Soru #2 detaylandırıldı: iki-çağrılı planlama akışı (planner soru modu → ana thread `AskUserQuestion` ile sorar → planner üretim modu). faz-04'e işlendi. |
