# GraphPilot — Graph Spesifikasyonu (SPEC)

**Durum:** Faz 1 taslağı · **Tarih:** 2026-10-23 · **Kaynak faz:** `roadmap/faz-01-graph-semasi.md`

Bu dosya graph'ın dilini tanımlar: klasör yapısı, düğüm tipleri, frontmatter alanları, link
kuralları, indeks formatı, routing config. Faz 2+'ta her şey buna göre kodlanır.

Zod şemaları: `cli/src/schema/*.ts`. Örnek graph: `docs/examples/bookstore/.graph/`.

> **Okuma notu:** Roadmap'in bazı maddeleri (epic/feature frontmatter'ı, dosya adlandırma
> detayı, brief'in kind alanı) tam speslenmemişti. Bu SPEC onları doldurdu; her doldurma
> **Tasarım Notu** kutusunda açıkça işaretlendi — sessiz bir varsayım yok.

---

## 1. Klasör yapısı

```
.graph/
├── INDEX.md                 # otomatik, kök indeks (dokunma)
├── brief.md                 # L0 proje anayasası
├── config.yml                # routing tablosu, bütçeler (opsiyonel override)
├── E01-<slug>/
│   ├── _index.md             # otomatik, epic indeksi (dokunma)
│   ├── epic.md
│   ├── tasks/
│   │   ├── F01-<slug>.md             # feature (L2)
│   │   ├── F01-T01-<slug>.md         # atomik görev (L3)
│   │   └── F01-T02-<slug>.md
│   └── knowledge/
│       ├── <modul>.md                # arayüzler, modül özeti
│       └── decisions.md
├── _shared/knowledge/        # epic'ler arası ortak bilgi (ör. db-schema.md)
└── _metrics/                 # düğüm bazında ölçümler (JSONL)
```

`INDEX.md` ve her `_index.md`, `gp index` (Faz 2.4) tarafından üretilir — elle düzenlenmez,
kayıp olması sorun değildir (yeniden üretilebilir, bkz. §9).

---

## 2. Kimlik (ID) kuralları

| Seviye | ID biçimi | Örnek | Regex |
|---|---|---|---|
| Epic (L1) | `E<2 hane>` | `E01` | `^E\d{2}$` |
| Feature (L2) | `<epic-id>-F<2 hane>` | `E01-F02` | `^E\d{2}-F\d{2}$` |
| Task (L3) | `<feature-id>-T<2 hane>` | `E01-F02-T03` | `^E\d{2}-F\d{2}-T\d{2}$` |
| Knowledge | serbest kebab-case slug | `catalog-api` | `^[a-z][a-z0-9-]*$` |

- **ID'ler asla yeniden kullanılmaz.** Silinen düğümün numarası boşta kalır; `gp new`
  (Faz 2.10) her zaman bir sonraki kullanılmamış numarayı verir.
- İki hane (`01`–`99`) yeterli görülüyor; bir epic 99'dan fazla feature/task gerektirirse
  (olası değil ama olursa) hane sayısı artırılır — geriye dönük uyumluluk `format_version`
  ile yönetilir (Faz 10.4).

### Tasarım Notu — dosya adlandırma (roadmap'te çelişkili)

Roadmap'in §1.1 klasör ağacı `tasks/` altında kısaltılmış adlar gösteriyordu (`F01-<slug>.md`,
`T01-<slug>.md`), ama §1.2 "Dosya adı: `<ID>-<slug>.md`" diyor ve `[[wikilink]]` tekilliği
global olmak zorunda (§8). Kısaltılmış ad kullanılırsa iki farklı epic'in `F01`'i veya iki
farklı feature'ın `T01`'i aynı dosya adını paylaşır — çakışma.

**Çözüm (bu SPEC'te kesinleşti):**
- **Feature dosyası:** epic-göreli ID + slug → `F01-<slug>.md` (epic zaten klasör ile
  scope'landığı için epic önekini dosya adında tekrarlamaya gerek yok; feature ID'si
  `tasks/` klasörü içinde tekil).
- **Task dosyası:** feature-göreli ID + slug → `F01-T03-<slug>.md` (feature segmenti **zorunlu**,
  çünkü aynı `tasks/` klasöründe birden fazla feature'ın görevleri yan yana durur — sadece
  `T03` yetmez, `F01-T03` ile `F02-T03` ayrılır).
- **`id:` frontmatter alanı her zaman TAM ID'dir** (`E01-F01-T03`) — dosya adındaki kısaltma
  sadece görsel/klasör-bağlamlı; `depends_on` gibi çapraz referanslar her zaman tam ID kullanır.
- **`name:` frontmatter alanı = dosya adının kökü** (uzantısız), yani `F01-T03-<slug>`.
  `[[wikilink]]` bu alanı hedefler (§8), `id` değil.
- Knowledge dosyaları kısaltılmaz: `<modul>.md` (epic-scope) veya `_shared/knowledge/<modul>.md`.
  `id` = `name` = dosya adı kökü, **global tekil** olmalı (validator kontrol eder).

---

## 3. Düğüm tipleri — ortak alanlar

Her graph düğümü (`epic` | `feature` | `task` | `knowledge`) frontmatter'ında şu dört alanı
taşır: `id`, `kind`, `name`, `summary` (≤100 karakter, indeks satırı için). `brief.md` ve
`config.yml` bu kümenin dışındadır (sabit yoldan tanınır, frontmatter zorunlu değil — aşağıda).

Token sayımı (handoff/brief üst sınırları için) **yaklaşık**: `karakter sayısı / 4`.
Kesin sayaç gerekmiyor; Faz 2.3'teki validator bu yaklaşıklıkla çalışır.

---

## 4. Epic ve Feature düğümleri

### Tasarım Notu — roadmap'te tam speslenmemişti

Roadmap §1.3 sadece **task** frontmatter'ını tam örnekliyordu. Epic/feature'ın alanları bu
SPEC'te, task şemasıyla tutarlı olacak şekilde dolduruldu. Eklenen `expanded` alanı roadmap'te
hiç geçmiyordu ama **Faz 5**'in "tembel genişletme" davranışı (`/gp:run` sırası gelen bir
epic/feature açılmamışsa otomatik `expand` çağırır) bu bilgiyi bir yerde tutmak zorunda —
en doğal yer düğümün kendisi.

### Epic frontmatter

```yaml
id: E01                    # ^E\d{2}$
kind: epic
name: E01-catalog          # dosya adı kökü
summary: "Katalog ve ürün arama"      # ≤100 karakter
status: pending             # pending | ready | running | done | failed | blocked | skipped
expanded: false              # feature'lara bölündü mü (Faz 5 lazy expansion)
depends_on: []               # diğer epic ID'leri
draft: false                  # true ise bu düğümden çıkan linkler henüz var olmayabilir (§8)
```

### Feature frontmatter

```yaml
id: E01-F01                 # ^E\d{2}-F\d{2}$
kind: feature
name: F01-search             # dosya adı kökü
summary: "Ürün arama API'si"
status: pending
expanded: false               # görevlere bölündü mü
depends_on: [E01-F02]          # diğer feature ID'leri (aynı epic içinde tipik, zorunlu değil)
draft: false                   # true ise bu düğümden çıkan linkler henüz var olmayabilir (§8)
```

`status` her iki düzeyde de task'in tam enum'unu paylaşır (§5) — ayrı bir enum icat etmek
gereksiz karmaşıklık; roll-up semantiği (çocukların durumuna göre özet) `gp index`'in işi.

---

## 5. Görev (task) düğümü — frontmatter

```yaml
id: E02-F01-T03
kind: task
name: F01-T03-search-endpoint     # dosya adı kökü
level: 3
summary: "Kitap arama API endpoint'i"   # ≤100 karakter
type: feature                # scaffold | feature | refactor | test | docs | config | fix
complexity: med               # low | med | high
risk: low                     # low | med | high  (geri alınabilirlik)
context_size: small           # small | medium | large  (dokunulan dosya sayısı)
model: auto                   # auto | haiku | sonnet | opus | fable
agent: auto                   # auto | coder | tester | docs  (checker dahili, reviewer → Faz 11)
depends_on: [E02-F01-T01, E02-F01-T02]   # tam task ID'leri
reads: ["[[catalog-api]]", "[[db-schema]]"]   # [[name]] — knowledge düğümlerine
touches: ["src/catalog/**"]
context_budget: 8000           # token
status: pending                 # pending | ready | running | done | failed | blocked | skipped
attempts: 0
draft: false                     # true ise depends_on/reads hedefleri henüz var olmayabilir (§8)
```

`model: fable` roadmap'in orijinal routing örneğinde yoktu; Claude Code'un güncel model
takımına (Faz 0 araştırması) göre eklendi, varsayılan routing tablosu şu an onu kullanmıyor.

## 5a. Görev düğümü gövdesi (body)

**Zorunlu bölümler:** `## Görev`, `## Kabul kriterleri`, `## Handoff`
**Opsiyonel:** `## Notlar`, `## Hata geçmişi`, `## Yarım iş` (Faz 6.7, kesinti sonrası devam)

**Handoff alt başlıkları** (hepsi zorunlu, içerik `done` olmadan önce boş/placeholder olabilir):
- `Oluşturulan/değişen dosyalar`
- `Public arayüz`
- `Kararlar`
- `Bilgi düğümü güncellemeleri`

**Handoff üst sınırı:** ~300 token. Validator (Faz 2.3) bu sınırı **sadece `status: done`**
düğümlerde zorunlu tutar — `pending`/`running` düğümde Handoff biçimsel olarak var olmalı ama
boş/placeholder (`*(Henüz çalıştırılmadı.)*`) kabul edilir.

### Tasarım Kararı — testler her zaman ayrı görev düğümü (Faz 5.2)

Roadmap §5.2 bu kararı açıkça SPEC'e yazılmak üzere bıraktı: **test yazımı her zaman
`type: test` ile ayrı bir görev düğümüdür** — ilgili implementasyon görevinin kabul
kriterine gömülmez. Gerekçe:
1. **Ayrı routing:** bir test görevi genelde implementasyonundan daha düşük `complexity`
   taşır (haiku'ya düşebilir) — tek düğümde birleşirse en yüksek karmaşıklığa göre
   (çoğunlukla implementasyonun karmaşıklığına) tek bir model seçilmek zorunda kalınır.
2. **Ayrı agent:** `tester` agent'ı `coder`'dan farklı talimatlarla çalışır (API'yi elle
   çağırma yasağı, Faz 11 ile sıkılaşacak).
3. **Tutarlılık:** Faz 1'in örnek bookstore graph'ı (`E01-F01-T03-search-tests.md`) zaten
   bu şekilde yazılmıştı; karar o örneği resmileştiriyor.
4. **Ayrı Handoff:** implementasyon görevi "ne yaptım", test görevü "neyi hangi
   senaryolarla doğruladım" der — ikisini karıştırmak sonraki düğümlerin bağlamını büyütür.

Sonuç: bir feature'ın görev listesi tipik olarak `[arayüz-tanımı, implementasyon, test]`
sıralamasını izler; test görevü implementasyon görevine `depends_on` ile bağlanır.

---

## 6. Bilgi (knowledge) düğümü

```yaml
id: catalog-api
kind: knowledge
name: catalog-api          # id ile aynı — knowledge'ta ikisi her zaman eşleşir
summary: "Katalog arama arayüzü: Book tipi, GET /search"
scope: epic                 # epic | shared
updated_by: [E01-F01-T01, E01-F01-T02]   # task ID listesi
source_files: ["src/catalog/types.ts", "src/catalog/search.ts"]
```

**Gövde:** `## Özet`, `## Arayüz` (imzalar, endpoint'ler, tipler), `## Kararlar`, `## Dikkat`

**Kural:** knowledge düğümü kod kopyalamaz — sadece imza ve sözleşme. `source_files` dosya
hash'leriyle karşılaştırılarak "şüpheli" (kod değişmiş ama bilgi düğümü güncellenmemiş)
tespitine izin verir (Faz 9.3, `gp sync`); hash'in kendisi bu dosyada tutulmaz, `gp sync`
çalışma anında hesaplar.

---

## 7. Brief (L0)

**Zorunlu bölümler:** Amaç, Stack, Klasör yapısı, Konvansiyonlar, Test stratejisi, Kapsam dışı
**Üst sınır:** ~1500 token

### Tasarım Notu — frontmatter yok

`brief.md` sabit bir yoldan tanınır (`.graph/brief.md`); bir `kind:` alanına ihtiyacı yok.
Diğer düğüm tiplerinin aksine frontmatter **zorunlu değil** — gerekirse serbest notlar
(örn. `updated_at`) eklenebilir ama şema bunu zorlamaz. Aynı mantık `config.yml` için de
geçerli: o bir YAML dosyası, graph düğümü değil (§10).

---

## 8. Link kuralları

- **`[[name]]`** = hedef düğümün `name` alanı (= dosya adı kökü). **Global tekil** olmalı —
  iki düğüm aynı `name`'i paylaşamaz (validator hata verir).
- Wikilink **hem frontmatter dizi değerlerinde** (`reads: ["[[catalog-api]]"]`) **hem de
  body prose içinde** geçebilir; parser (Faz 2.2) ikisini de tarar.
- **`depends_on`** → sadece aynı seviyedeki görev/feature/epic düğümlerine işaret eder
  (task→task, feature→feature, epic→epic). Tam ID kullanır, `[[..]]` değil.
- **`reads`** → sadece knowledge düğümlerine işaret eder, `[[name]]` sözdizimiyle.
- **Döngü yasak** — `depends_on` grafiğinde döngü validator hatası (Faz 2.3, topolojik sıralama
  Faz 2.5).
- **Var olmayan link = hata**, taslak düğümler hariç.

### Tasarım Notu — "taslak" mekanizması (Faz 2'de çözüldü)

Faz 1'de bu kural somutlaştırılmamıştı ("taslak = frontmatter'da henüz belirlenmemiş" diye
belirsiz bırakılmıştı). Faz 2.3'te (`gp validate`) netleşti: **`draft: boolean` alanı**
(varsayılan `false`), epic/feature/task frontmatter'ına eklendi (knowledge'a eklenmedi —
knowledge zaten iskelet olarak oluşturulur, Faz 5.4). `draft: true` olan bir düğümden
**çıkan** `depends_on`/`reads` hedefleri henüz var olmasa da `gp validate` hata vermez;
bu düğüme **gelen** linkler (başka bir düğümün ona işaret etmesi) her zaman kontrol edilir.

---

## 9. İndeks formatı

Her iki dosya da **otomatik üretilir** (`gp index`, Faz 2.4); tepesinde
`<!-- OTOMATİK ÜRETİLİR — ELLE DÜZENLEME -->` uyarısı taşır. Kayıp olmaları sorun değildir,
yeniden üretilebilir — bu yüzden örnek graph'a (`docs/examples/bookstore/`) dahil edilmedi.

**Kök `INDEX.md`:** brief özeti + epic tablosu — sütunlar: `id`, `tür`, `özet`, `durum`,
`ilerleme %`. Satır başına tek satır, ID'ye göre deterministik sıralı (tarih/rastgelelik yok
— prompt cache için, Faz 7.1).

**Epic `_index.md`:** o epic'in tüm düğümleri — sütunlar: `id`, `tür`, `özet`, `durum`, `model`.
Aynı deterministik sıralama kuralı.

---

## 10. Routing config (`config.yml`)

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
    review: false   # Faz 11'de review:true kullanılabilir hale gelecek, şimdilik inert
escalation: [haiku, sonnet, opus]
max_attempts_per_model: 1
budgets:
  default_context: 8000
  max_turns: 25
confirm_expand: false   # Faz 5.6 — true ise /gp:expand her genişletmeden önce onay ister
parallelism: 2           # Faz 6.8 — /gp:run'ın aynı anda çalıştıracağı çakışmasız düğüm sayısı
checks:                   # Faz 6.3 Katman 1 — tanımlı olmayan alan hiç çalıştırılmaz
  build: "npm run build"
  lint: "npm run lint"
  test: "npm test"
fix_loop:                  # Faz 6.3 — doğrulama döngüsünün frenleri
  enabled: true
  max_rounds: 3
  acceptance_check_model: haiku
  break_if_no_progress: true
```

**Eşleştirme semantiği (`gp route`, Faz 2.7 için bağlayıcı):**
- `when` içindeki her anahtar **AND** ile birleşir (hepsi uyuşmalı).
- Bir anahtarın değeri **skaler** ise tam eşleşme; **dizi** ise "herhangi biri" eşleşmesi
  (`type: [scaffold, docs, config]` → task'ın `type`'ı bu üçünden biriyse eşleşir).
- Kurallar **sırayla** denenir, **ilk eşleşen kazanır** (sonraki kurallara bakılmaz).
- Düğümde `model: <değer>` elle verilmişse (yani `auto` değilse) routing tablosu hiç
  çalışmaz, o değer doğrudan kullanılır.
- **`agent: auto` çözümü** (roadmap'te tanımsızdı, Faz 2.7'de dolduruldu): `type: test` →
  `tester`; `type: docs` → `docs`; diğer her `type` → `coder`.
- Hiçbir routing kuralı eşleşmezse `gp route` **hata fırlatır** (sessiz varsayılana düşmez) —
  yapılandırma boşluğu gürültülü başarısız olmalı.

### Tasarım Notu — ileriye dönük genişleme

`fix_loop` (Faz 6.3), `optimizations` (Faz 7), `review` (Faz 11, üst düzey) gibi bölümler
henüz bu şemada **zorunlu değil**. Zod şeması üst seviyede bilinmeyen anahtarlara izin verir
(`.passthrough()`), böylece sonraki fazlar kendi anahtarlarını eklerken bu şemayı kırmaz;
bilinen anahtarların (`routing`, `escalation`, `max_attempts_per_model`, `budgets`) kendi iç
yapısı ise sıkı (`.strict()`) kalır — tipo'lar orada hâlâ yakalanır.

---

## 11. Zod şemaları — dosya haritası

| Dosya | İçerik |
|---|---|
| `cli/src/schema/common.ts` | Paylaşılan enum'lar (Status, Complexity, Risk, ContextSize, TaskType, Agent, Model) + `IdSchema` yardımcıları |
| `cli/src/schema/epic.ts` | `EpicFrontmatterSchema` |
| `cli/src/schema/feature.ts` | `FeatureFrontmatterSchema` |
| `cli/src/schema/task.ts` | `TaskFrontmatterSchema` |
| `cli/src/schema/knowledge.ts` | `KnowledgeFrontmatterSchema` |
| `cli/src/schema/node.ts` | `NodeFrontmatterSchema` — `kind` üzerinden discriminated union |
| `cli/src/schema/config.ts` | `ConfigSchema` (routing config) |
| `cli/src/schema/index.ts` | Barrel export |

Testler: `cli/src/schema/__tests__/`. `fixtures-validate.test.ts`, örnek graph'ın (§12) her
dosyasını `gray-matter` ile okur ve `kind`'a göre doğru şemadan geçirir — bu Faz 1'in
"Zod şemaları örnek graph'ı hatasız doğruluyor" kabul kriterini **gerçekten çalıştırarak**
kanıtlar. (Bu geçici bir doğrulama kablolaması; gerçek parser Faz 2.2'de yazılır.)

---

## 12. Örnek graph — `docs/examples/bookstore/.graph/`

1 epic (`E01-catalog`), 2 feature (`F01-search`, `F02-cart`), 5 task, 3 knowledge düğümü
(2 epic-scope, 1 shared). Bağımlılık zinciri interface-first kuralını gösterir: her feature'ın
ilk görevi tipleri tanımlar, sonraki görevler ona bağlanır; `F02` (cart), `F01`'in (search)
knowledge düğümünü okur (`reads: ["[[catalog-api]]"]`) ve feature düzeyinde ona bağımlıdır
(`depends_on: [E01-F01]`).

INDEX.md / _index.md **dahil edilmedi** (§9 — otomatik üretilir, elle tutmak drift riski).
