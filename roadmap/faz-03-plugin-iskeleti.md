# Faz 3 — Plugin İskeleti

**Amaç:** Kurulabilir, boş ama doğru yapılandırılmış bir Claude Code plugin'i oluşturmak;
sabit agent'ları ve komut iskeletlerini yerleştirmek.

**Ön koşul:** Faz 0 (plugin yapısı doğrulandı), Faz 2 (`gp` CLI hazır).
**Çıktı:** `plugin/` klasörü, yerel marketplace'ten kurulabilir.

## Görevler

### 3.1 Manifest ve yapı
- [x] `plugin/.claude-plugin/plugin.json` (isim: `gp`, sürüm, açıklama)
- [x] Klasörler kuruldu — **değişiklikle**: `commands/` yerine `skills/` (ADR-007);
      `hooks/` sadece `SessionStart` (node_modules kurulumu, ADR-009) için var,
      henüz boş `commands/` yok
- [x] Yerel marketplace tanımı ve kurulum talimatı (`docs/INSTALL.md`)
- [x] Faz 0'da doğrulanan formata birebir uy

### 3.2 `gp` CLI erişimi

> **Faz 0 kararı — [ADR-006](../docs/decisions.md#adr-006):** `gp`, plugin'in **`bin/`** klasöründen
> sunulur. Plugin aktifken Claude Code bu klasörü Bash tool'un `PATH`'ine ekler; agent'lar `gp`'yi
> çıplak adıyla çağırır. `node_modules` `${CLAUDE_PLUGIN_DATA}` altına kurulur (SessionStart hook).
> ⚠️ `${CLAUDE_PLUGIN_ROOT}` Bash ortamında **yoktur** — buna güvenen tasarım çalışmaz.
> 🔴 Taviz: `bin/` olan plugin claude.ai ve Cowork'te **kurulmaz**; GP sadece CLI/masaüstü/IDE'de çalışır.

- [x] ~~Plugin'in `gp` CLI'ını nasıl çağıracağına karar ver~~ → `bin/` (ADR-006)
- [x] `gp doctor` komutu: kurulum, Node sürümü, `.graph/` varlığı kontrolü

### 3.3 Sabit agent tanımları
Her agent için `agents/<isim>.md`: açıklama, model (varsayılan), araç listesi, sistem talimatı.

> **Faz 0 bulguları:**
> - ✅ `omitClaudeMd: true` **zorunlu** (coder/tester/docs/checker) — [ADR-003](../docs/decisions.md#adr-003).
>   `planner`'da kullanılmaz (mevcut proje kurallarını görmesi faydalı).
> - ✅ Kullanılabilir alanlar: `tools`, `disallowedTools` (tools'tan önce uygulanır), `model`,
>   `maxTurns`, `skills`, `effort`, `experimental.cacheTtl: 1h`, `color`, `isolation: worktree`.
> - ❗ Plugin agent'larında **yok sayılan** alanlar: `permissionMode`, `hooks`, `mcpServers`,
>   `initialPrompt`. Güvenlik kısıtı (Faz 9.7) `tools`/`disallowedTools` + plugin
>   `hooks/hooks.json` (PreToolUse) ile yapılmalı.
> - ❗ Subagent'lar `Agent`, `AskUserQuestion`, `EnterPlanMode` araçlarını **her zaman kaybeder** —
>   hiçbir agent kullanıcıya soru soramaz, alt agent başlatamaz.

- [x] **planner** — Varsayılan model: opus. Araçlar: Read, Glob, Grep, `gp` (Bash kısıtlı). Görev: brief + epic + genişletme.
- [x] **coder** — Model: çalışma anında routing ile belirlenir (varsayılan sonnet). Araçlar: Read, Edit, Write, Bash (kısıtlı).
- [x] **tester** — Model: haiku/sonnet. Araçlar: Read, Edit, Write, Bash (test komutları).
- [x] **docs** — Model: haiku. Araçlar: Read, Edit, Write. Shell yok.
- [x] **checker** — Model: haiku. Araçlar: Read. Görev: doğrulama döngüsünün Katman 2'si (kabul kriteri kontrolü). Yazma yok.
- [x] ~~reviewer~~ — MVP dışı, Faz 11'de eklenecek.

Her agent talimatında ortak kurallar:
- [x] "Sadece sana verilen bağlam paketiyle çalış. Gerekmedikçe başka dosya açma."
- [x] "Repo'da gezinme; önce repo-map'e bak."
- [x] "Dosyayı baştan yazma, düzenle."
- [x] "Bitince düğümün Handoff bölümünü doldur (max ~300 token)."
- [x] "Kapsam dışı bir ihtiyaç görürsen yapma; Handoff'ta 'Açık iş' olarak yaz."

### 3.4 Model seçimi mekanizması

> **Faz 0'da çözüldü — [ADR-002](../docs/decisions.md#adr-002).** Model önceliği:
> (1) çağrı başına `model` parametresi → (2) agent frontmatter'ı → (3) `CLAUDE_CODE_SUBAGENT_MODEL`
> → (4) ana sohbetin modeli. **Çağrı anında override edilebiliyor**, yani agent varyantı gerekmiyor.

- [x] ~~Model nerede belirleniyor?~~ → Çağrı anında, Agent tool'un `model` parametresiyle
- [x] ~~Agent varyantı gerekli mi?~~ → **Hayır.** Tek `coder` agent'ı; `gp route` modeli geçer
- [x] ~~Kararı `docs/decisions.md`'ye yaz~~ → ADR-002
- [ ] **Canlı doğrulama yapılamadı — kasıtlı sınır:** Agent tool'u kullanmam bu oturumda
      politika dışı (kullanıcı/CLAUDE.md/skill istemedi) ve gerçek bir `claude -p` çağrısı
      kullanıcının hesabından gerçek model kullanımı harcardı — onay almadan yapılmadı.
      Doğrulanan: resmi dokümanın öncelik sırası (Faz 0) + `claude plugin validate`'in
      agent dosyalarını hatasız yüklediği. **Gerçek canlı test kullanıcının kendi
      interaktif oturumunda yapılmalı:** `@agent-gp:coder` ile çağırıp farklı model
      parametresiyle tekrar çağırarak gözlemlenebilir.
- [x] Agent dosyalarına makul `model` **varsayılanı** yaz (route çalışmazsa düşülecek değer)

### 3.5 Komut iskeletleri

> **Faz 0 kararı — [ADR-007](../docs/decisions.md#adr-007):** Komutlar `commands/` değil
> **`skills/<ad>/SKILL.md`** olarak yazılır. Doküman `commands/`'ı eski biçim ilan etti; skill
> aynı şekilde `/gp:<ad>` olarak çalışır ve kendi klasöründe yardımcı dosya taşıyabilir
> (`/gp:run`'ın döngü talimatı, hata politikası ve routing açıklaması ayrı dosyalara bölünür →
> ana SKILL.md küçük kalır, token kazancı). Aşağıdaki yollar `plugin/skills/<ad>/SKILL.md`'dir.

- [x] `/gp:init` — `.graph/` oluştur, `config.yml` varsayılanlarını yaz
- [x] `/gp:plan` — iskelet dosyası oluşturuldu (placeholder, Faz 4'te doldurulacak)
- [x] `/gp:expand` — iskelet dosyası oluşturuldu (placeholder, Faz 5'te doldurulacak)
- [x] `/gp:run` — iskelet dosyası oluşturuldu (placeholder, Faz 6'da doldurulacak)
- [x] `/gp:status` — `gp status` çıktısını göster
- [x] `/gp:report` — iskelet dosyası oluşturuldu (placeholder, Faz 8'de doldurulacak)

### 3.6 Skill: graph kuralları
- [x] `skills/graph-conventions/SKILL.md`: graph formatı, ID kuralları, `gp new` kullanımı, handoff yazma kuralları
- [x] Agent'lar format sorusu olduğunda bu skill'e başvurur (SPEC'in kısa, agent dostu versiyonu)

### 3.7 Duman testi
- [x] Boş bir test projesinde plugin'i kur
- [x] `/gp:init` ve `/gp:status` çalışıyor
- [ ] Her agent elle çağrıldığında doğru modelle çalışıyor — **doğrulanamadı** (yukarıdaki
      kasıtlı sınır, 3.4). Araç kısıtı (`tools`/`disallowedTools`) dosyalarda doğru yazıldı,
      `claude plugin validate` bunu statik olarak onaylıyor.

## Claude'a örnek prompt

```
faz-03 dosyasındaki 3.3 görevini yap. Faz 0'daki docs/research.md'de doğrulanan
agent dosya formatını kullan. Her agent için araç listesini en az yetki prensibiyle seç.
Talimatları kısa tut; her agent talimatı 400 token'ı geçmesin.
```

## Kabul kriterleri
- [x] `claude plugin validate ./plugin` hatasız — **gerçekten çalıştırıldı**: "Validation
      passed with warnings" (tek kalan uyarı: icon eksik, Faz 10 kozmetik konusu).
      `--strict` sadece icon'da takılıyor; README/LICENSE eklendikten sonra diğer tüm
      "directory" uyarıları temizlendi.
- [x] Plugin temiz bir projede tek komutla kuruluyor — **gerçekten kuruldu**:
      `claude plugin marketplace add` + `claude plugin install gp@graphpilot` çalıştırıldı,
      `claude plugin list` → `gp@graphpilot ... Status: ✔ enabled`.
- [x] 5 agent tanımlı, doğru araç setiyle (statik doğrulandı) — **model override canlı
      test edilmedi** (bkz. 3.4/3.7, kasıtlı sınır).
- [x] `/gp:init` ve `/gp:status` uçtan uca çalışıyor — **gerçek kurulu plugin'in**
      `lib/bin.js`'i üzerinden `init`+`doctor` çalıştırıldı, geçici bir projede
      sıfırdan `.graph/` oluşturup doğrulandı (tüm `doctor` kontrolleri ✓).

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
| 2026-10-24 | 3.1–3.7 | Plugin iskeleti kuruldu: manifest, yerel marketplace, 5 agent, 3 gerçek + 4 placeholder skill, SessionStart hook. `claude plugin validate`/`marketplace add`/`install` ile GERÇEKTEN test edildi (unit test değil, asıl CLI). |
| 2026-10-24 | 3.2 | ADR-006 düzeltildi → **ADR-009**: `bin/gp` Bash tool ortamında `${CLAUDE_PLUGIN_DATA}`'yı okuyamıyor (Faz 0 bulgusu burada pratikte ortaya çıktı). node_modules artık plugin köküne kuruluyor, kendi kendine konum bulma ile. |
| 2026-10-24 | — | `gp init`/`gp doctor` CLI komutları `cli/`'a eklendi (Faz 2'de kasıtlı atlanmıştı, 3.5'in bağımlılığıydı) — 6 yeni test, hepsi geçti. |
| 2026-10-24 | — | Plugin kurulumunu test ederken **gerçek bir yüksek-önem güvenlik açığı** bulundu: zod 3.x'te DoS açığı (GHSA-mrhx-c7xc-m3w5). zod 4.6.7'ye yükseltildi — **sıfır kod değişikliği gerekti**, 129/129 test geçti. `cli/` ve `plugin/` ikisi de güncellendi. |
| 2026-10-24 | 3.7 | Dürüst sınır: canlı agent/model-override testi yapılamadı (Agent tool politika dışı, gerçek `claude -p` onaysız gerçek kullanım harcardı). Kullanıcının kendi oturumunda doğrulaması gerekiyor. |
