# GraphPilot — Mimari Kararlar (ADR)

Her karar: bağlam → karar → gerekçe → sonuçlar. Kararlar numaralandırılır, geri alınmaz;
değişirse yeni ADR yazılır ve eskisi "Değiştirildi (ADR-XXX)" diye işaretlenir.
Dayanak bulgular: `research.md` (iç geliştirme notları — bu repoda yayınlanmıyor).

---

## ADR-001 — Yürütme modu: Mod A varsayılan, Mod B opsiyonel

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 0.5

### Bağlam
Graph düğümleri iki şekilde yürütülebilir:
- **Mod A:** `/gp:run` ana thread'de döner, her düğüm için subagent başlatır.
- **Mod B:** `gp run` CLI'ı her düğüm için ayrı `claude -p --model X` süreci başlatır.

### Karar
**Mod A varsayılan yürütücüdür. Mod B uzun otonom çalışmalar için opsiyonel kalır (Faz 6.9).**

### Gerekçe
1. **Abonelik uyumu belirleyici oldu.** Mod B'nin tek gerçek üstünlüğü `--bare` ile elde edilen
   deterministik bağlamdı. Ama `--bare` *"never reads OAuth credentials or the system keychain"* —
   `ANTHROPIC_API_KEY` ister. Bu, ürünün "kullanıcının kendi aboneliğiyle çalışır, ayrı login yok"
   temel ilkesini bozar. `--bare` olmadan Mod B'nin bağlam üstünlüğü büyük ölçüde kaybolur
   (CLAUDE.md ve kurulu plugin'ler yine yüklenir).
2. **Bağlam izolasyonu Mod A'da da yeterli.** Subagent zaten temiz, izole bir context window ile
   başlar; sohbet geçmişi aktarılmaz. `omitClaudeMd: true` ile CLAUDE.md hiyerarşisi de kesilir
   (bkz. ADR-003).
3. **Model seçimi iki modda da çözüldü** (bkz. ADR-002).
4. **Kullanıcı deneyimi.** Mod A'da kullanıcı `/gp:run` yazıp ilerlemeyi canlı görür; soru
   sorulması gerekirse ana thread sorabilir (subagent'ta `AskUserQuestion` yoktur).
5. **Eşzamanlılık limiti engel değil.** 20 eşzamanlı subagent sınırı, hedeflenen varsayılan
   paralellik 2'nin çok üstünde.

### Sonuçlar
- ✅ Faz 6 Mod A üzerine kurulur; `/gp:run` ana thread orkestratörü olur.
- ✅ Token ölçümü (Faz 8.1) transcript JSONL'den yapılır — Mod B'nin hazır JSON'u yok
  (bkz. ADR-004).
- ⚠️ Mod B Faz 6.9'da opsiyonel kalır; `--bare` **kullanılmaz**, böylece abonelik korunur.
  Bağlam determinizmi `--append-system-prompt` ve `--agents` ile telafi edilir.
- ⚠️ Benchmark'ın "ham Claude Code" kolu (Faz 8.4) headless koşar; orada da `--bare`
  kullanılmamalı ki iki kol aynı koşullarda ölçülsün.

---

## ADR-002 — Model seçimi: çağrı anında override, agent varyantı yok

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 0.2, 3.4

### Bağlam
`gp route <id>` her düğüm için bir model çözüyor (haiku/sonnet/opus). Bu modelin agent çağrısına
nasıl geçeceği belirsizdi. Roadmap Faz 3.4, model çağrı anında değiştirilemezse her model için
agent varyantı (`coder-haiku`, `coder-sonnet`, `coder-opus`) açmayı yedek plan olarak öngörüyordu.

### Karar
**Her rol için tek agent dosyası tanımlanır. Model, Agent tool çağrısında çağrı başına
`model` parametresiyle geçilir. Agent varyantı açılmaz.**

### Gerekçe
Doküman, model öncelik sırasını açıkça veriyor ve en tepede **"per-invocation `model` parameter
passed by Claude"** var; `model` alanı için *"Can be overridden per invocation"* deniyor.
Yedek plana gerek kalmadı.

### Sonuçlar
- ✅ 5 agent dosyası (planner, coder, tester, docs, checker) — 15 değil.
- ✅ Agent tanım token'ı düşük kalır (Faz 7.4 ile uyumlu).
- ✅ Agent dosyalarında `model` frontmatter'ı **varsayılan** olarak yazılır; `gp route` çıktısı
  bunu geçersiz kılar. Route çalışmazsa makul bir varsayılana düşülür.
- ✅ Routing tablosu değişince agent dosyalarına dokunmak gerekmez.
- ⚠️ Faz 3.7 duman testinde çağrı-anı override'ı **gerçekten** doğrulanmalı: aynı `coder`
  agent'ının farklı modellerle koştuğu gözlenmeli (dokümana güvenip geçmemeli).

---

## ADR-003 — Agent'larda `omitClaudeMd: true`

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 0.2, 3.3, 6.2

### Bağlam
Faz 6'nın kabul kriteri: *"Her agent çağrısında giden bağlam, `gp context` çıktısıyla birebir
aynı (fazlası yok)."* Subagent varsayılan olarak CLAUDE.md hiyerarşisinin tamamını da yükler
(`~/.claude/CLAUDE.md`, proje kuralları, `CLAUDE.local.md`, `AGENTS.md`). Kullanıcının kişisel
CLAUDE.md'si ölçülemeyen, kontrol edilemeyen bir bağlam kalemi demek — hem token yer hem
benchmark'ı kirletir (kullanıcıdan kullanıcıya değişir).

### Karar
**GP'nin iş yapan agent'ları (`coder`, `tester`, `docs`, `checker`) `omitClaudeMd: true`
ile tanımlanır.** Proje konvansiyonları onlara `brief.md` üzerinden, `gp context` paketi
içinde ulaşır.

### Gerekçe
1. `brief.md` (L0 proje anayasası) zaten CLAUDE.md'nin işlevini görüyor — ve `gp context`
   paketinin **sabit ilk parçası** olduğu için cache dostu (Faz 7.1).
2. Benchmark tekrarlanabilirliği: kullanıcının kişisel CLAUDE.md'si ölçüme karışmaz.
3. Kabul kriteri sağlanabilir hale gelir.

### Sonuçlar
- ✅ Giden bağlam = agent sistem prompt'u (sabit) + git durum anlık görüntüsü + `gp context`
  paketi. Kabul kriteri bu üç kalemle **yeniden yazılmalı** (aşağıya bakın).
- ⚠️ **Faz 6 kabul kriteri düzeltmesi gerekiyor:** "birebir aynı" literal olarak sağlanamaz,
  çünkü agent sistem prompt'u ve git durum anlık görüntüsü her zaman eklenir. Yeni ifade:
  > *"Agent'a giden değişken bağlam yalnızca `gp context` çıktısıdır; sabit kalemler
  > (agent sistem prompt'u, git durum anlık görüntüsü) dışında graph'tan başka dosya okunmaz."*
- ⚠️ `planner` agent'ında `omitClaudeMd` **kullanılmaz**: planlama sırasında mevcut projenin
  kurallarını görmesi faydalı (Faz 4.1 "mevcut proje tespiti").
- ⚠️ Git durum anlık görüntüsü hâlâ eklenir ve WIP commit'ler (Faz 6.7) onu büyütür.
  Faz 7'de ölçülmeli; gerekirse `includeGitInstructions` ayarı araştırılmalı.

---

## ADR-004 — Ölçüm kaynağı: transcript JSONL (hook'lar değil)

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 0.3, 0.4, 8.1

### Bağlam
Faz 8 ölçümü üç kaynaktan yapılabilirdi: hook verisi, transcript JSONL, veya
`claude -p --output-format json`. Faz 0 riski: *"Hook'larda token bilgisi yoksa → ölçüm
transcript JSONL okunarak yapılır."*

### Karar
**Birincil ölçüm kaynağı transcript JSONL'dir.** Hook'lar sadece *olay* kaydı için kullanılır
(düğüm başlangıç/bitiş zamanı, tool çağrı sayacı), token için değil. Mod B koşularında
`--output-format json` ikinci kaynak olarak kullanılır ve çapraz doğrulama sağlar.

### Gerekçe
1. **Risk gerçekleşti:** doküman net — hook girdisinde token sayısı, model kullanım
   istatistiği ve maliyet bilgisi **yoktur**.
2. **Ama hook'lar yolu veriyor:** `transcript_path` *tüm* hook olaylarında mevcut. Yani
   `SubagentStop` hook'u, o subagent'ın transcript'ini işaret edebilir.
3. `claude -p --output-format json` `total_cost_usd` ve model bazında kırılım veriyor —
   ama Mod A varsayılan olduğu için (ADR-001) bu yol sadece Mod B ve benchmark'ın ham kolunda
   kullanılabilir.

### Sonuçlar
- ✅ Faz 8.1 bir transcript JSONL okuyucusu gerektirir: `gp metrics ingest <transcript_path>`.
- ✅ Hook'lar tool çağrı sayacı için yine gerekli (Faz 7.2, 7.9: Read/Glob/Grep sayısı,
  Write ile yeniden yazılan dosya sayısı).
- ❌ **Açık iş:** transcript JSONL'in satır şeması dokümante edilmemiş; Faz 8.1'de gerçek bir
  dosya incelenip `docs/SPEC.md`'ye yazılmalı (research.md Açık Soru #4).
- ⚠️ Maliyet rakamları istemci tarafı tahmin; `docs/BENCHMARK.md`'de bu açıkça yazılmalı.

---

## ADR-005 — Log kırpma `PostToolUse` hook'u ile yapılır

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 0.3, 7.3

### Bağlam
Faz 7.3, test/build çıktısının sadece hata satırlarına kırpılmasını istiyor. İki yol vardı:
doğrulama script'i içinde kırpmak (garantili ama sınırlı), veya `PostToolUse` hook ile
(geniş kapsamlı ama desteklenip desteklenmediği belirsizdi).

### Karar
**İkisi birlikte.** Doğrulama script'i kendi çıktısını kırpar (garantili taban).
Ek olarak plugin, `matcher: "Bash"` ile bir `PostToolUse` hook'u sağlar ve `updatedToolOutput`
ile agent'ın kendi çağırdığı komutların çıktısını da kırpar. Hook `config.yml` ile kapatılabilir.

### Gerekçe
`PostToolUse` hook'u `hookSpecificOutput.updatedToolOutput` alanıyla tool sonucunu
**değiştirebiliyor/redakte edebiliyor** — doküman bunu açıkça destekliyor. Faz 0 belirsizliği
olumlu çözüldü.

### Sonuçlar
- ✅ Faz 7.3 tam kapsamda uygulanabilir; ablasyon testinde (7.10) iki katman ayrı ayrı ölçülebilir.
- ⚠️ **Plugin hook'ları plugin yüklendiği anda kaydedilir**, `/gp:run` beklemez. Yani hook her
  oturumda, her Bash çağrısında ateşlenir. Kırpma script'i `.graph/` yoksa veya `config.yml`'de
  kapalıysa **çıktıyı değiştirmeden hemen çıkmalı**. Aksi halde plugin, GraphPilot kullanmayan
  oturumları da etkiler — kabul edilemez. (research.md Açık Soru #3)
- ⚠️ Hook script'i hızlı olmalı; her Bash çağrısına gecikme eklemez.

---

## ADR-006 — `gp` CLI'ı plugin'in `bin/` klasöründen sunulur

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 0.1, 3.2

### Bağlam
Faz 3.2: plugin `gp` CLI'ını nasıl çağıracak? Global npm kurulumu, `npx`, veya plugin içinde
bundle? Global kurulum kullanıcıdan ek adım ister; `npx` her çağrıda yavaş ve ağ bağımlı.

### Karar
**`gp`, plugin'in `bin/` klasöründen sunulur.** Plugin aktifken Claude Code bu klasörü Bash
tool'un `PATH`'ine ekler, böylece agent'lar ve skill'ler `gp` komutunu **çıplak adıyla** çağırır.
Node bağımlılıkları ~~`${CLAUDE_PLUGIN_DATA}` altına kurulur~~ **DÜZELTİLDİ → [ADR-009](#adr-009):**
plugin kökü altına (`bin/`'in yanına) kurulur — gerekçe ADR-009'da.

### Gerekçe
1. Doküman: *"Files in `bin/` at the plugin root are on the `PATH` of the Bash tool's shell
   while the plugin is enabled, so Claude can run them as bare commands"* — tam bu iş için var.
2. Kullanıcı hiçbir şey kurmaz; plugin kurulumu yeterli (Faz 10.1 "tek adımlık kurulum").
3. `${CLAUDE_PLUGIN_DATA}` güncellemeler arasında korunuyor; `node_modules` oraya kurulur ve
   her güncellemede yeniden indirilmez. Doküman bunun için hazır bir `SessionStart` hook
   kalıbı veriyor.

### Sonuçlar
- ✅ Agent talimatlarında `gp context E02-F01-T03 --json` gibi düz komutlar yazılabilir.
- ✅ `${CLAUDE_PLUGIN_ROOT}` Bash ortamında **yok** — ama `bin/` PATH'te olduğu için buna
  ihtiyaç kalmıyor. (Bu değişkene güvenen bir tasarım çalışmazdı.)
- ⚠️ **Plugin `bin/` kullanıcının PATH'inden sonra gelir**, yani sistem komutlarını gölgeleyemez.
  `gp` adı çakışma riski taşıyor mu kontrol edilmeli (bazı sistemlerde `gp` başka bir araç olabilir).
- 🔴 **Taviz:** *"claude.ai and Cowork don't install a plugin that has a top-level `bin/`
  directory."* GP, `bin/` kullandığı sürece **claude.ai ve Cowork'te kurulmaz** — sadece
  Claude Code CLI / masaüstü / IDE'de çalışır. GP terminal/git tabanlı bir araç olduğu için
  bu kabul edilebilir, ama Faz 10.6'da açıkça belgelenmeli.
- ⚠️ Yedek yol: `bin/` sorun çıkarırsa `gp`, agent talimatlarında `node
  ${CLAUDE_PLUGIN_ROOT}/dist/cli.js` olarak çağrılabilir (skill/agent *metninde* bu değişken
  yerine konur). Daha çirkin ama çalışır.

---

## ADR-007 — Komutlar skill olarak yazılır, `commands/` kullanılmaz

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 0.1, 3.5

### Bağlam
Roadmap `/gp:plan`, `/gp:run` gibi komutları `plugin/commands/*.md` olarak öngörüyordu.
Doküman ise komutlar için şunu diyor: *"Commands are the older format, and skills supersede
them for new work… write new ones as skills and keep `commands/` for files you already have."*

### Karar
**Tüm `/gp:*` komutları `skills/<ad>/SKILL.md` olarak yazılır.** `commands/` klasörü kullanılmaz.

### Gerekçe
1. Skill, komutla aynı şekilde `/gp:<ad>` olarak çalışır — kullanıcı için fark yok.
2. Skill kendi klasöründe **yardımcı dosya taşıyabilir**. `/gp:run` için bu önemli: döngü
   talimatı, hata politikası durum makinesi ve routing tablosu açıklaması ayrı dosyalara
   bölünebilir, ana SKILL.md küçük kalır — token açısından doğrudan kazanç.
3. Skill `description`'ı Claude'un otomatik yüklemesini de sağlar (kullanıcı `/gp:status`
   yazmak yerine "graph durumu ne?" diyebilir).

### Sonuçlar
- ✅ Faz 3.5 komut iskeletleri `plugin/skills/{init,plan,expand,run,status,report}/SKILL.md`
  olarak kurulur.
- ✅ Faz 3.6'daki `skills/graph-conventions/` zaten bu yapıda — tutarlı.
- ⚠️ Roadmap'in Faz 4–6 "örnek prompt" bölümlerinde `plugin/commands/plan.md` gibi yollar
  geçiyor; bunlar `plugin/skills/plan/SKILL.md` olarak okunmalı.

---

## ADR-008 — Katman 2 kabul kontrolü `--json-schema` ile yapılandırılır

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 0.4, 6.3

### Bağlam
Faz 6.3 Katman 2, Haiku'nun kabul kriterlerini diff'e karşı işaretlemesini ve
`{ kriter, durum: ok | eksik, not }` biçiminde **yapılandırılmış** liste döndürmesini istiyor.
Modelden serbest metin alıp parse etmek kırılgan.

### Karar
**Katman 2, `claude -p --output-format json --json-schema '<şema>'` ile ayrı bir süreç olarak
çağrılır** ve sonuç `structured_output` alanından okunur.

### Gerekçe
1. `--json-schema` şemaya uygun çıktı garantisi veriyor; parse hatası riski kalkıyor.
2. Katman 2'nin girdisi zaten minimal (kabul kriterleri + diff) ve çıktısı yapılandırılmış —
   bu tam bir "sınırlı, ölçülebilir" çağrı. Ana oturum bağlamına hiç karışmaması iyi.
3. Aynı çağrı `total_cost_usd` döndürür, yani Katman 2'nin maliyeti **doğrudan** ölçülür
   (Faz 8.5b'nin "Katman 2'nin yakaladığı eksik sayısı / maliyeti" ölçümü için birebir).

### Sonuçlar
- ✅ `gp check <id>` komutu bu çağrıyı sarar; döngü mantığı script'te kalır (model düşünür,
  script çalışır ilkesi).
- ⚠️ Bu bir `claude -p` çağrısı, yani Mod A içinde bile küçük bir headless süreç kullanılır.
  ADR-001 ile çelişmiyor — orada *düğüm yürütmesi* Mod A'da kalıyor; bu sadece kısıtlı bir
  yardımcı çağrı. `--bare` **kullanılmaz** (abonelik korunur).
- ❌ **Doğrulanacak:** `structured_output` alanı modelin reddi vb. durumlarda **yok olabiliyor**
  (doküman uyarıyor). `gp check` alan yoksa "kontrol başarısız" döndürüp düğümü
  Katman 1 sonucuna göre değerlendirmeli — sessizce "ok" saymamalı.

---

## ADR-009 — `gp` node_modules'ı plugin kökü altında, `${CLAUDE_PLUGIN_DATA}` değil

**Tarih:** 2026-10-23 · **Durum:** Kabul edildi · **Faz:** 3.2 (ADR-006'yı düzeltir)

### Bağlam
ADR-006, `bin/gp`'nin node bağımlılıklarını `${CLAUDE_PLUGIN_DATA}` altına kurup oradan
okuyacağını öngörmüştü ("güncellemeler arasında korunur" avantajı için). Faz 3'te bunu inşa
ederken şu çelişki ortaya çıktı: **`${CLAUDE_PLUGIN_DATA}` bir ortam değişkenidir ve Faz 0
araştırması bunun açıkça Bash tool'un çalıştırdığı komutların ortamında YOK olduğunu
göstermişti.** `bin/gp`, bir agent'ın Bash tool çağrısıyla çalıştığı için bu değişkeni
**okuyamaz** — nereye `npm install` yapıldığını bilemez.

### Karar
**node_modules, `${CLAUDE_PLUGIN_DATA}` değil, plugin kökü altına (`bin/`'in yanına,
`<plugin-root>/node_modules`) kurulur.** `bin/gp` kendi konumunu (`import.meta.url`/`$0`)
**kendi kendine** bulur — hiçbir ortam değişkenine ihtiyaç duymadan sadece dosya sistemindeki
göreli konumuna (kardeş `lib/` klasörü, onun da üstündeki `node_modules`) güvenir. Node'un
standart modül çözümlemesi (üst dizinlere doğru `node_modules` arama) bunu otomatik yapar.

### Gerekçe
1. Bir betik kendi dosya yolunu **her zaman** bilir (bu bir ortam değişkenine değil, process'in
   kendi `argv[1]`/`import.meta.url`'üne dayanır) — bu, Bash tool'un ortam kısıtından tamamen
   bağımsız, sağlam bir temel.
2. `${CLAUDE_PLUGIN_DATA}` sadece **hook** süreçlerinde var (doğrulandı); `bin/` çalıştırıcıları
   için asla güvenilir bir kaynak değil. ADR-006 bunu gözden kaçırmıştı.
3. Alternatif (ADR-006'nın ilk taslağında değerlendirilen) — `SessionStart` hook'unun çözdüğü
   `CLAUDE_PLUGIN_DATA` yolunu bir "işaretçi dosyaya" yazıp `bin/gp`'nin o dosyayı okuması —
   çalışırdı ama gereksiz karmaşıklık ekliyordu; kazancı (güncellemeler arası node_modules
   korunması) küçük bağımlılık setinde (zod, gray-matter, commander, yaml, fast-glob — 5 paket)
   birkaç saniyelik kurulum süresine değmiyor.

### Sonuçlar
- ✅ ADR-006'nın `bin/` + PATH mekanizması **aynen kalıyor** — agent'lar hâlâ çıplak `gp` çağırır.
- ⚠️ **Kabul edilen taviz:** `${CLAUDE_PLUGIN_ROOT}` her plugin güncellemesinde değişen bir
  cache dizini olduğu için, node_modules **her güncellemede yeniden kurulur** (ADR-006'nın
  umduğu "güncellemeler arası korunur" avantajı yok). `SessionStart` hook'u bunu idempotent
  yapar (zaten kuruluysa ve `package.json` değişmemişse atlar) — maliyet güncelleme başına,
  oturum başına değil.
- ✅ `plugin/package.json` sadece **çalışma zamanı** bağımlılıklarını taşır (devDependencies yok,
  derlenmiş `.js` zaten `plugin/lib/`'de hazır — `tsc` tekrar çalışmaz).
- ✅ `plugin/node_modules/` **git'te izlenmez** (`.gitignore`); `SessionStart` hook'u kurar.
- 📝 Faz 10'da paketleme sırasında bu mekanizma tekrar gözden geçirilmeli: tek-dosya bundle
  (esbuild) ile node_modules ihtiyacını tamamen ortadan kaldırmak daha sağlam olabilir.

---

## ADR-010 — `max_turns` çağrı anında geçilemez; yumuşak talimat + sert frenler

**Tarih:** 2026-10-24 · **Durum:** Kabul edildi · **Faz:** 6.2

### Bağlam
`gp route`'un döndürdüğü `max_turns`, roadmap'in 6.2'sinde "Agent'a giden prompt = `gp context`
çıktısı + kısa standart talimat; `max_turns` sınırı uygulanır" diyerek ajan çağrısına
uygulanmasını bekliyordu. ADR-002, `model`'in **çağrı anında** override edilebildiğini
doğrulamıştı (Agent tool'un kendi parametresi). `max_turns` için aynı şey geçerli mi?

### Karar
**Hayır — doğrudan kanıtlandı: Agent tool'umun kendi şeması** (`description`, `isolation`,
`model`, `prompt`, `subagent_type`) **`maxTurns` parametresi içermiyor.** Bu, dokümana değil,
bu oturumda gerçekten kullanılabilir Agent tool'un tanımına bakılarak doğrulandı — ADR-002'nin
tersine, bu alan sadece agent dosyasının (`coder.md` vb.) frontmatter'ında **sabit** olarak
ayarlanabiliyor, çağrı anında değiştirilemiyor.

**Sonuç olarak `max_turns` iki katmanlı uygulanır:**
1. **Yumuşak:** `gp context` paketinin sonuna, orkestratörün ekleyeceği kısa bir talimat:
   "Bu görevi en fazla N turda bitir; bitiremezsen `## Yarım iş` notu yaz." (agent'ın kendi
   muhakemesine güvenilir, mekanik bir sınır değil.)
2. **Sert:** Doğrulama döngüsünün kendi frenleri (Faz 6.3: `fix_loop.max_rounds`, tur başına
   token sayacı, düğüm bütçesinin 2 katı aşılırsa döngü kırılır) — bunlar `gp`'nin kendi
   deterministik hesabı, agent'ın turuna değil **tur SAYISINA ve metrics'e** dayanır.

### Gerekçe
Model override'ı tersine, `max_turns` gibi ince ayarlar Claude Code'un Agent tool arayüzünde
henüz yok. Bunun üzerine inşa etmek yerine, zaten var olan tur-bazlı freni (fix-loop'un kendi
döngü sayacı) birincil güvence yapmak daha sağlam — agent'ın kendi iç turlarına güvenmiyoruz.

### Sonuçlar
- ✅ `gp route`'un `max_turns` alanı hâlâ anlamlı — ama agent çağrısına değil, (a) delegasyon
  metnine yumuşak talimat olarak, (b) fix-loop'un round sayacına sert sınır olarak giriyor.
- ⚠️ Bu, Mod B'de (6.9, `claude -p --max-turns N`) **değişmez** — headless CLI'ın kendi
  `--max-turns` bayrağı çağrı anında gerçekten çalışıyor (Faz 0 research, CLI referansından
  doğrulandı). Fark **sadece Mod A'daki Agent tool çağrısı** için geçerli.

---

## ADR-011 — Faz 7 ölçüm hook'u: `agent_id` ile "düğüm başına" sayım, savunmacı `tool_response` okuma

**Tarih:** 2026-10-24 · **Durum:** Kabul edildi (kısmen DOĞRULANMAMIŞ varsayımla) · **Faz:** 7.2/7.3/7.7/7.9

### Bağlam
Faz 7.2 ("düğüm başına Glob/Grep/Read sayısı"), 7.3 (Bash çıktı kırpma), 7.7 (tekrar
tespiti) ve 7.9 (mevcut dosyanın üzerine Write sayısı) hepsi aynı mekanizmaya dayanıyor:
`PreToolUse`/`PostToolUse` hook'larının ölçtüğü ham tool çağrıları. İki noktada
research.md'nin doğrulamadığı varsayım yapmak gerekti.

### Karar
1. **"Düğüm başına" sayım anahtarı `agent_id`.** research.md, `agent_id`'yi tüm hook
   olaylarında bulunan evrensel bir alan olarak listeliyor (§0.3) ama HER Agent tool
   çağrısına (= her coder/tester node'una) ayrı bir `agent_id` verildiğini bu oturumda
   gerçek bir paralel subagent koşusuyla DOĞRULAMADIK. Sayaç dosyası `agent_id`'ye göre
   adlanır (`.graph/_runtime/hook-counters/<agent_id>.json`), yoksa `session_id`'ye düşer.
   **Yanlışsa sonuç:** sayaçlar node'lar arası karışır (örn. iki paralel coder'ın Read
   sayıları toplanır) — bu bir YANLIŞ POZİTİF döngü-uyarısına yol açabilir ama hiçbir
   zaman veri kaybına/çökmeye yol açmaz (sayaç sadece artar, asla kritik bir karara göre
   davranış değiştirmez — sadece `additionalContext` uyarısı).
2. **`trimBash.ts`'in `tool_response` okuyucusu savunmacı.** Bash `tool_response`'un TAM
   iç şekli (`stdout`/`stderr` mi, başka mı) DOĞRULANMADI. `extractText()` birkaç tanıdık
   alanı dener (`stdout`, `output`, `text`, `stderr`); hiçbiri uymazsa **no-op** döner —
   asla tahmin edip yanlış metni kırpmaz.

### Gerekçe
Her iki varsayım da **başarısızlık modunda zararsız** olacak şekilde seçildi: yanlış
olsalarsa bile hook en kötü ihtimalle "ölçmez" ya da "gereksiz bir uyarı ekler" —
asla bir tool çıktısını bozmaz ya da bir oturumu çökertmez (7.3'ün ❗ kuralı). Faz 8'de
gerçek paralel bir `/gp:run` koşusunda `agent_id`'nin node'a göre nasıl dağıldığı
`tool-use.jsonl`'den gözlemlenip buraya geri yazılmalı.

### Sonuçlar
- ✅ `.graph/_metrics/tool-use.jsonl`'deki her kayıt artık `scopeId` (`agent_id` ya da
  `session_id`) taşıyor — Faz 8.1 bunun node'a 1:1 denk gelip gelmediğini gerçek bir
  koşuda doğrulayabilir.
- ⚠️ Bu oturumda gerçek bir Claude Code hook ateşlemesi (gerçek `claude` süreci) hiç
  gözlemlenmedi — `hookCli.test.ts` gerçek `gp hook` sürecini GERÇEK stdin/stdout ile test
  ediyor, ama JSON GİRDİSİ testte elle kurulmuş (gerçek Claude Code'un göndereceği ANLIK
  gerçek alan isimleri değil).

---

## Bekleyen kararlar

| Konu | Faz | Not |
|---|---|---|
| Test görevleri ayrı düğüm mü, kabul kriterine gömülü mü | 5.2 | Ölçüme göre |
| Handoff'u bilgi düğümüne kim işler (aynı agent mı, docs agent mı) | 6.4 | Ölçüme göre |
| Başarısız düğümde `git restore` mi, ayrı branch'e park mı | 6.6 | — |
| Paralel yürütmede `isolation: worktree` kullanılacak mı | 6.8 | research.md Açık Soru #6 |
