# Faz 1 — Graph Şeması & Spesifikasyon

**Amaç:** Graph'ın dilini kesinleştirmek: klasör yapısı, düğüm tipleri, frontmatter alanları,
link kuralları, indeks formatı. Bu faz bitince her şey bu spesifikasyona göre kodlanır.

**Ön koşul:** Faz 0.
**Çıktı:** `docs/SPEC.md`, `cli/src/schema/*.ts` (Zod şemaları), `docs/examples/` (örnek graph).

## Görevler

### 1.1 Klasör yapısı
- [x] Nihai yapıyı SPEC'e yaz:

```
.graph/
├── INDEX.md                 # otomatik, kök indeks (dokunma)
├── brief.md                 # L0 proje anayasası
├── config.yml               # routing tablosu, bütçeler (opsiyonel override)
├── E01-<slug>/
│   ├── _index.md            # otomatik, epic indeksi (dokunma)
│   ├── epic.md
│   ├── tasks/
│   │   ├── F01-<slug>.md    # feature (L2)
│   │   └── T01-<slug>.md    # atomik görev (L3)
│   └── knowledge/
│       ├── <modul>.md       # arayüzler, modül özeti
│       └── decisions.md
├── _shared/knowledge/       # epic'ler arası ortak bilgi (ör. db-schema.md)
└── _metrics/                # düğüm bazında ölçümler (JSONL)
```

### 1.2 Kimlik (ID) kuralları

> **Çözüldü:** roadmap'in §1.1 klasör ağacı ile §1.2'nin dosya adı kuralı çelişiyordu
> (kısaltılmış `F01-<slug>.md` vs tam `<ID>-<slug>.md`). SPEC §2'de kesinleşti: feature
> dosyası epic-göreli (`F01-<slug>.md`), task dosyası feature-göreli (`F01-T03-<slug>.md`),
> `id:` frontmatter'ı her zaman tam ID. Ayrıntı: [SPEC.md §2](../docs/SPEC.md#2-kimlik-id-kuralları).

- [x] Format: `E01`, `E01-F02`, `E01-F02-T03` (hiyerarşi ID'den okunabilir)
- [x] Dosya adı: `<ID>-<slug>.md`, `name` frontmatter = dosya adı kökü
- [x] ID'ler asla yeniden kullanılmaz (silinen düğümün ID'si boşta kalır)

### 1.3 Görev düğümü frontmatter

> Task şeması roadmap'teki örnekle birebir ([SPEC.md §5](../docs/SPEC.md#5-görev-task-düğümü--frontmatter)).
> Epic/feature frontmatter'ı roadmap'te **tam speslenmemişti** — SPEC §4'te task'le tutarlı
> dolduruldu; `expanded: boolean` alanı eklendi (Faz 5'in tembel genişletme tespiti için gerekli,
> roadmap'te yoktu — filled gap olarak işaretli).

- [x] Alanları ve tiplerini tanımla:

```yaml
id: E02-F01-T03
kind: task                 # epic | feature | task
level: 3
summary: "Kitap arama API endpoint'i"   # indeks için tek satır, max 100 karakter
type: feature              # scaffold | feature | refactor | test | docs | config | fix
complexity: med            # low | med | high
risk: low                  # low | med | high  (geri alınabilirlik)
context_size: small        # small | medium | large  (dokunulan dosya sayısı)
model: auto                # auto | haiku | sonnet | opus  (auto = routing tablosu)
agent: auto                # auto | coder | tester | docs  (reviewer → Faz 11)
depends_on: [E02-F01-T01, E02-F01-T02]
reads: ["[[catalog-api]]", "[[db-schema]]"]   # okunacak bilgi düğümleri
touches: ["src/catalog/**"]
context_budget: 8000       # token
status: pending            # pending | ready | running | done | failed | blocked | skipped
attempts: 0
```

### 1.4 Görev düğümü gövdesi (body)
- [x] Zorunlu bölümler: `## Görev`, `## Kabul kriterleri`, `## Handoff`
- [x] Opsiyonel: `## Notlar`, `## Hata geçmişi`, `## Yarım iş` (kesinti sonrası devam için, Faz 6.7)
- [x] Handoff alt başlıkları: `Oluşturulan/değişen dosyalar`, `Public arayüz`, `Kararlar`, `Bilgi düğümü güncellemeleri`
- [x] Handoff üst sınırı: ~300 token (validator kontrol eder)

### 1.5 Bilgi düğümü şeması
- [x] Frontmatter: `id`, `kind: knowledge`, `summary`, `scope` (epic / shared), `updated_by` (görev ID listesi), `source_files`
- [x] Gövde: `## Özet`, `## Arayüz` (imzalar, endpoint'ler, tipler), `## Kararlar`, `## Dikkat`
- [x] Kural: bilgi düğümü kod kopyalamaz, sadece imza ve sözleşme içerir

### 1.6 Brief (L0) şeması

> **Tasarım notu:** `brief.md`'nin frontmatter'ı yok — sabit yoldan (`.graph/brief.md`)
> tanınıyor, diğer düğüm tiplerinin aksine `kind` alanına ihtiyacı yok ([SPEC.md §7](../docs/SPEC.md#7-brief-l0)).

- [x] Bölümler: Amaç, Stack, Klasör yapısı, Konvansiyonlar, Test stratejisi, Kapsam dışı
- [x] Üst sınır: ~1500 token (cache'lenecek sabit önek)

### 1.7 Link kuralları
- [x] `[[name]]` = dosya adı kökü; tekil olmalı
- [x] `depends_on` sadece görev düğümlerine, `reads` sadece bilgi düğümlerine işaret eder
- [x] Döngü yasak (validator yakalar)
- [x] Var olmayan link = hata (taslak düğümler hariç)

### 1.8 İndeks formatı
- [x] Kök `INDEX.md`: brief + epic'ler (id, tür, özet, durum, ilerleme %)
- [x] Epic `_index.md`: o epic'in tüm düğümleri (id, tür, özet, durum, model)
- [x] Dosya başında "Bu dosya otomatik üretilir, elle düzenleme" uyarısı
- [x] Satır başına tek satır; tablo formatı

### 1.9 Routing config şeması

> **Eşleştirme semantiği netleştirildi** ([SPEC.md §10](../docs/SPEC.md#10-routing-config-configyml)):
> `when` içindeki anahtarlar AND, değer dizi ise "herhangi biri", kurallar sırayla denenir
> ilk eşleşen kazanır. Şema üst seviyede `.passthrough()` — Faz 6/7/11'in ekleyeceği
> `fix_loop`/`optimizations`/`review` anahtarları bu şemayı kırmayacak.

- [x] `config.yml` varsayılanları:

```yaml
routing:
  - when: { complexity: low, type: [scaffold, docs, config] }
    model: haiku
  - when: { complexity: low }
    model: haiku
  - when: { complexity: med }
    model: sonnet
  - when: { complexity: high }
    model: opus
  - when: { risk: high }
    model: opus
    # review: true  → Faz 11'de aktif olacak
escalation: [haiku, sonnet, opus]
max_attempts_per_model: 1
budgets:
  default_context: 8000
  max_turns: 25
```

### 1.10 Zod şemaları ve örnekler
- [x] Yukarıdaki her şemayı `cli/src/schema/` altında Zod ile yaz
- [x] `docs/examples/bookstore/` altında elle yazılmış küçük bir örnek graph (1 epic, 2 feature, 5 task, 3 bilgi düğümü)

## Claude'a örnek prompt

```
faz-01 dosyasındaki 1.3 ve 1.4 görevlerini yap. Kararlarını docs/SPEC.md'ye yaz.
Her alan için: tip, zorunlu mu, varsayılan değer, örnek. Belirsiz kalan noktaları
"Açık Sorular" bölümüne ekle, kendi başına karar verme.
```

## Kabul kriterleri
- [x] `docs/SPEC.md` tüm düğüm tiplerini, alanları ve kuralları içeriyor
- [x] Zod şemaları örnek graph'ı hatasız doğruluyor
- [ ] Örnek graph Obsidian'da açıldığında linkler çalışıyor (opsiyonel kontrol) — **doğrulanamadı**, bu ortamda Obsidian yok; `[[wikilink]]` sözdizimi standart Obsidian biçimiyle yazıldı, kullanıcı elle açıp kontrol edebilir

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
| 2026-10-23 | 1.1–1.9 | `docs/SPEC.md` yazıldı. Roadmap'teki iki çelişki çözüldü: dosya adlandırma (§2) ve epic/feature frontmatter'ı (§4, roadmap'te tam speslenmemişti). |
| 2026-10-23 | — | Node 20 → **22** LTS'e yükseltildi: vitest 5.0.5 (dev bağımlılıklarındaki kritik güvenlik açıklarını kapatan sürüm) Node 20'yi resmi desteklemiyor. `cli/.nvmrc`, `package.json#engines` güncellendi. |
| 2026-10-23 | 1.10 | Zod şemaları (`cli/src/schema/*.ts`) + örnek bookstore graph'ı (`docs/examples/bookstore/.graph/`, 1 epic + 2 feature + 5 task + 3 knowledge) yazıldı. `npm test` ile **17 test** çalıştırıldı ve geçti (11 dosya doğrulaması + config.yml + 5 bilinçli-hata reddi). `npx tsc --noEmit` temiz. `npm audit`: 0 açık. |
