# Faz 0 — Araştırma Bulguları

**Tarih:** 2026-10-23
**Doğrulanan sürüm:** Claude Code **2.1.309** (yerel kurulum)
**Yöntem:** Resmi dokümantasyon (`code.claude.com/docs`) + yerel `claude --version` / `claude plugin --help`

> **Not:** Dokümantasyon `docs.claude.com/en/docs/claude-code/*` adresinden
> `code.claude.com/docs/en/*` adresine taşınmış (301). Eski linkler artık yönlendiriyor.

**İşaretleme:** ✅ doğrulandı (kaynak linkli) · ⚠️ kısmen · ❌ DOĞRULANMADI

**Ortam notu — çözüldü, sonra düzeltildi (2026-10-23):** Önce Node 20.20.2 kuruldu. Faz 1'de
`cli/` bağımlılıkları kurulurken **vitest 5.0.5'in Node 20'yi resmi desteklemediği** ortaya
çıktı (`EBADENGINE`, gereken: `^22.12.0 || ^24.0.0 || >=26.0.0`) — vitest 2.x'te kalmak ise
dev-only ama **kritik** (prototype pollution → RCE, `tinypool`) bir güvenlik açığı demekti.
Bu yüzden **Node 22 LTS**'e geçildi (`nvm install 22 --lts`, `nvm alias default 22`).
`cli/.nvmrc` = `22`, `package.json#engines` = `>=22`. `npm audit`: 0 açık.
⚠️ Bu makinede kabuk profillerinin dışında PATH'i eski bir sürüme sabitleyen bir katman var
(kaynağı bulunamadı — `.zshrc`/`.zprofile`/`.bashrc`/`.zshenv`'de ilgili satır yok); yeni bir
terminal penceresi veya açık `nvm use 22` bunu düzeltmeli.
⚠️ **Ayrı not:** `npm@10.8.2`, vitest 5'in opsiyonel peer bağımlılık ağacını çözerken çöküyor
(`Cannot read properties of null (reading 'edgesOut')` — arborist hatası). `npm@11+`'e
güncellemek bunu çözüyor; `npm@12` Node 22'yi bile yetersiz buluyor (Node 22/24/26 ister,
tam sürüm önemli). `npm install -g npm@11` yeterli oldu.

---

## 0.1 Plugin yapısı

**Kaynak:** [Plugin manifest reference](https://code.claude.com/docs/en/plugins-reference) ·
[Plugin components](https://code.claude.com/docs/en/plugins/components) ·
[Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference) ·
[Plugin CLI reference](https://code.claude.com/docs/en/plugins/cli-reference)

### Manifest

✅ Konum: `.claude-plugin/plugin.json` (plugin kökünde). **Manifest opsiyoneldir** —
dosya yoksa Claude Code standart klasörleri tarar.
✅ **Tek zorunlu alan: `name`.** kebab-case, boşluk/`@`/`:`/path ayracı içeremez.
✅ Diğer alanlar: `displayName`, `version`, `description`, `author` (`name` zorunlu alt alan),
`homepage` (geçerli URL olmalı yoksa plugin yüklenmez), `repository`, `license`, `keywords`,
`metadata`, `defaultEnabled` (varsayılan `true`), `dependencies`, `settings`, `userConfig`,
ve bileşen anahtarları: `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`,
`outputStyles`, `workflows`, `experimental.{themes,monitors,evals}`.
✅ Tanınmayan üst düzey alan **sessizce atılır** (plugin yüklenir, `claude plugin validate` uyarır).
✅ Doğrulama komutu: `claude plugin validate ./plugin` — `--strict` ile uyarılar hataya döner (CI için).

#### ⚠️ GP için isim kısıtı
`name` içinde `claude`/`anthropic` geçmesi **uyarı veya hata** üretir.
`gp` temiz — ama `claude-graphpilot` gibi bir isim **hata** verirdi. Karar: plugin adı `gp`.

### Desteklenen klasörler (standart yerleşim)

| Bileşen | Varsayılan konum | Not |
|---|---|---|
| Manifest | `.claude-plugin/plugin.json` | Opsiyonel |
| Skills | `skills/<ad>/SKILL.md` | **Yeni plugin'ler için tercih edilen biçim** |
| Commands | `commands/<ad>.md` | *Eski biçim*; doküman skills'e yönlendiriyor |
| Agents | `agents/<ad>.md` | Alt klasörler isme `:` ile eklenir |
| Hooks | `hooks/hooks.json` | Üstte `"hooks"` sarmalayıcı **zorunlu** |
| MCP | `.mcp.json` | Plugin kökünde |
| **Executables** | **`bin/`** | **Plugin aktifken Bash tool'un `PATH`'ine eklenir** |
| Settings | `settings.json` | Sadece `agent` ve `subagentStatusLine` etkili |

✅ Plugin kökündeki `CLAUDE.md` **context olarak yüklenmez**; `validate` uyarır.
Talimat vermek için skill kullanılmalı. → GP'de `skills/graph-conventions/` (Faz 3.6) doğru tasarım.

### İsim alanı (namespace)

✅ Her bileşen plugin adı altında isimlenir:
- Skill `skills/plan/SKILL.md` → **`/gp:plan`**
- Command `commands/run.md` → **`/gp:run`**; `commands/db/migrate.md` → `/gp:db:migrate`
- Agent `agents/coder.md` → **`gp:coder`**, kullanıcı `@agent-gp:coder` ile çağırır
- Agent `agents/review/security.md` → `gp:review:security`
- MCP server → `plugin:gp:<server>`, tool adı `mcp__plugin_gp_<server>__<tool>`

→ Roadmap'teki `/gp:plan`, `/gp:run` adlandırması **doğru**.

### Yerel marketplace ve kurulum

✅ `marketplace.json` konumu: `<kök>/.claude-plugin/marketplace.json`
✅ Zorunlu üst düzey alanlar: **`name`, `owner`, `plugins`**. (`owner.name` zorunlu.)
✅ Plugin girdisi zorunlu alanları: **`name`, `source`**.
✅ Yerel (göreli) kaynak: `"source": "./plugin"` — **`./` öneki zorunlu**, `..` içeremez.
✅ Komutlar:
```bash
claude plugin marketplace add /mutlak/yol/graphpilot   # dizin veya .json yolu
claude plugin install gp@graphpilot
claude plugin validate ./plugin
# Marketplace'siz tek oturum denemesi:
claude --plugin-dir ./plugin
```
✅ Oturum içinde: `/plugin`, `/reload-plugins` (plugin dosyaları değişince gerekir).
⚠️ `/reload-plugins`, MCP tool'larını değiştirecek bir yeniden yükleme ise **prompt cache'i
geçersiz kılar** ve uygulanmaz; `--force` gerekir. GP'nin MCP server'ı olmadığı sürece sorun değil.

### Ortam değişkenleri

✅ `${CLAUDE_PLUGIN_ROOT}` — kurulu sürümün mutlak yolu. **Plugin güncellenince değişir, state yazma.**
✅ `${CLAUDE_PLUGIN_DATA}` — `~/.claude/plugins/data/<id>/`, **güncellemeler arasında korunur**.
`node_modules`, cache için.
✅ `${CLAUDE_PROJECT_DIR}` — proje kökü.
❗ **Bu değişkenler Bash tool'un çalıştırdığı komutların ortamında YOKTUR** (ne ana oturumda ne
subagent'ta). Skill/agent/command *metninde* `${...}` yazılır, Claude Code yüklerken yerine koyar.
→ Faz 3.2'yi doğrudan etkiler (aşağıda).

---

## 0.2 Subagent yetenekleri

**Kaynak:** [Subagents](https://code.claude.com/docs/en/sub-agents) ·
[Plugin components → Agents](https://code.claude.com/docs/en/plugins/components)

### 🔴 EN KRİTİK BULGU — `model` çağrı anında override edilebiliyor

✅ `model` alanı geçerli değerler: `sonnet`, `opus`, `haiku`, `fable`, tam model ID
(`claude-opus-5-5` gibi), veya **`inherit`**.

✅ **Model öncelik sırası (yüksekten düşüğe):**
1. **Çağrı başına `model` parametresi (Claude'un Agent tool çağrısında geçtiği)**
2. Agent tanım dosyasının `model` frontmatter'ı
3. `CLAUDE_CODE_SUBAGENT_MODEL` ortam değişkeni
4. Ana sohbetin modeli

→ **Faz 3.4'ün yedek planı (`coder-haiku`/`coder-sonnet`/`coder-opus` varyantları) GEREKSİZ.**
Tek bir `coder` agent'ı tanımlanır; `gp route` çıktısındaki model çağrı anında geçilir.
Bu, agent dosyası sayısını 3'e katlamaktan kurtarır ve tool tanımı token'ını düşürür.
→ Detaylı sonuç: [ADR-002](decisions.md#adr-002)

### Araç kısıtlama

✅ `tools` — izin listesi (virgülle ayrılmış veya YAML listesi). Verilmezse subagent'a açık
tüm araçları devralır.
✅ `disallowedTools` — yasak listesi. **`tools`'tan önce uygulanır.**
→ Faz 3.3 ve 7.4 için ikisi birlikte kullanılabilir (docs agent'ında shell yok, checker'da yazma yok).

### Subagent başlangıç bağlamı

✅ Her (fork olmayan) subagent **temiz, izole bir context window** ile başlar. İçeriği:
1. **Kendi sistem prompt'u** (markdown gövdesi) + ortam detayları — Claude Code'un ana sistem
   prompt'u **DEĞİL**
2. **Task mesajı** (ana thread'in yazdığı delegasyon prompt'u)
3. **CLAUDE.md hiyerarşisi** — `~/.claude/CLAUDE.md`, proje kuralları, `CLAUDE.local.md`,
   yönetilen politika dosyaları, `AGENTS.md`
4. **Git durum anlık görüntüsü** (branch, son commit'ler)
5. `skills` alanında adı geçen skill'lerin tam içeriği (en fazla 32)
6. Kardeş agent listesi (sadece `SendMessage` aracı varsa)

✅ **Aktarılmayanlar:** sohbet geçmişi, output style, ana oturumun otomatik hafızası.

### 🔴 İKİNCİ KRİTİK BULGU — `omitClaudeMd: true`

✅ `omitClaudeMd: true` frontmatter alanı, CLAUDE.md hiyerarşisinin tamamını atlar.
→ **Faz 6'nın "giden bağlam = `gp context` çıktısı" kabul kriteri neredeyse sağlanabilir.**
`omitClaudeMd: true` ile agent'ın gördüğü tek değişken girdi, delegasyon prompt'udur.
Geriye sadece agent'ın kendi sistem prompt'u (sabit) + git durum anlık görüntüsü kalır.
→ [ADR-003](decisions.md#adr-003)

### Diğer kullanışlı alanlar

| Alan | Değer | GP'de kullanımı |
|---|---|---|
| `maxTurns` | pozitif tamsayı | Faz 6.2 / 7.7 tur limiti — **frontmatter'da var** |
| `experimental.cacheTtl` | `5m` \| `1h` | **Faz 9.1 ucuz devam için kritik** — 1 saatlik cache |
| `effort` | `low`…`max` | Ucuz düğümlerde düşürülebilir (Faz 7 adayı) |
| `skills` | skill adı listesi | `graph-conventions` ön yüklemesi |
| `autoCompactWindow` | 100k–1M | Büyük düğümlerde compaction kontrolü |
| `isolation` | `worktree` | Paralel yürütmede dosya çakışmasını önler (Faz 6.8 adayı) |
| `color` | renk adı | Görev listesinde ayırt etme |

### ⚠️ Plugin agent'larında YOK SAYILAN alanlar

❗ `permissionMode`, `hooks`, `mcpServers`, `initialPrompt` — **plugin agent dosyasında yok sayılır.**
→ Faz 9.7 (Bash izinlerini kısıtlama) `permissionMode` ile yapılamaz; `tools`/`disallowedTools`
ve plugin `hooks/hooks.json` (PreToolUse) ile yapılmalı.

### Nesting ve paralellik

✅ Subagent'lar kendi subagent'larını başlatabilir, **3 katman derinliğe kadar**
(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`).
✅ **Eşzamanlı limit: 20** (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). 21.'si
"Concurrent subagent limit reached" ile başarısız olur.
→ Faz 6.8'deki varsayılan paralellik 2, bu limitin çok altında. Sorun yok.
✅ Subagent'lar her zaman `Agent`, `AskUserQuestion`, `EndConversation`, `EnterPlanMode`
araçlarını **kaybeder**.
→ **Subagent kullanıcıya soru soramaz.** Faz 4.2 (netleştirme soruları) ana thread'de
çalışmalı, planner subagent'ında değil. → Açık Soru #2
✅ Her çağrı yeni bir instance yaratır; devam etmek için `SendMessage` ile resume gerekir.

---

## 0.3 Hook'lar

**Kaynak:** [Hooks reference](https://code.claude.com/docs/en/hooks)

### Olaylar (GP'yi ilgilendirenler)

✅ `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `PermissionRequest`,
`PermissionDenied`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`,
`SessionStart`, `SessionEnd`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `FileChanged`.
(Tam liste 30+ olay içeriyor.)

### Hook girdisi

✅ **Tüm olaylarda bulunan alanlar:** `session_id`, `prompt_id`, **`transcript_path`**, `cwd`,
`scratchpad_dir`, `permission_mode`, `hook_event_name`, `agent_id`, `agent_type`, `effort`.
✅ Tool olaylarında ek: `tool_name`, `tool_input`, `tool_use_id`, `tool_response`.

### 🔴 ÜÇÜNCÜ KRİTİK BULGU — hook'larda token bilgisi YOK

❗ **Hook girdisinde token kullanımı / maliyet alanı yoktur.** Doküman bunu açıkça söylüyor:
hook'lar token sayısı, model kullanım istatistiği veya maliyet bilgisi almaz.
Alternatif olarak OpenTelemetry ve `prompt_id` korelasyonu öneriliyor.

→ **Faz 0 risk maddesi gerçekleşti.** Ölçüm (Faz 8.1) şu iki kaynaktan yapılmalı:
1. **`transcript_path`** — hook her olayda bu yolu veriyor; transcript JSONL'i okunabilir
2. **`claude -p --output-format json`** — `total_cost_usd` + model bazında maliyet kırılımı içeriyor
→ [ADR-004](decisions.md#adr-004)

### 🔴 DÖRDÜNCÜ KRİTİK BULGU — tool çıktısı hook ile kırpılabiliyor

✅ `PostToolUse` JSON çıktısı:
```json
{ "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "updatedToolOutput": { "type": "text", "text": "kırpılmış çıktı" },
    "additionalContext": "..." } }
```
→ **Faz 7.3 (log kırpma) hook ile uygulanabilir.** `matcher: "Bash"` ile test/build çıktısı
modele ulaşmadan kırpılır. Bu, doğrulama script'i içinde kırpmaktan daha geniş kapsamlı:
agent'ın kendi çağırdığı her Bash komutunu da kapsar.

✅ `PreToolUse`: `permissionDecision` (`allow`/`deny`/`ask`/`defer`), **`updatedInput`**
(tool argümanlarını çalıştırmadan önce değiştirir), `additionalContext`. Exit kodu 2 = engelle.
→ Faz 9.7 (`touches` dışına yazma tespiti) ve Faz 11.7 (`curl` yasağı) için uygun mekanizma.

✅ Evrensel çıktı alanları: `continue: false` (işlemeyi tamamen durdurur), `stopReason`,
`systemMessage`, `additionalContext`.

### Plugin hook'ları ne zaman ateşlenir

⚠️ Plugin hook'ları, plugin'in bir skill'i veya komutu kullanılmasını **beklemez** — oturum
plugin'i yüklediği anda kaydedilir ve olaylarında ateşlenir.
→ GP'nin log kırpma hook'u, kullanıcı `/gp:run` çalıştırmasa bile her Bash çağrısında devreye girer.
`matcher` daraltılmalı ya da hook script'i `.graph/` yokluğunda hemen çıkmalı. → Açık Soru #3

---

## 0.4 Headless mod ve ölçüm

**Kaynak:** [Headless](https://code.claude.com/docs/en/headless) ·
[CLI reference](https://code.claude.com/docs/en/cli-reference)

### Doğrulanan bayraklar

✅ `-p` / `--print` — etkileşimsiz çalıştırma
✅ `--model` — `sonnet`/`opus`/`haiku`/`fable` veya tam ad
✅ `--output-format` — `text` | `json` | `stream-json`
✅ `--max-turns N` — **sadece print modunda**; limite ulaşınca **hata ile çıkar**
✅ `--allowedTools` / `--allowed-tools` — izin kuralı sözdizimi: `"Bash(git diff *)"`
✅ `--tools` — hangi araçların *mevcut* olduğunu kısıtlar (`--allowedTools`'tan farklı)
✅ `--agents '<json>'` — CLI'dan dinamik subagent tanımı (dosya yolu da kabul, v2.1.281+)
✅ `--append-system-prompt`, `--append-system-prompt-file`
✅ `--permission-mode` — `default`/`acceptEdits`/`plan`/`auto`/`dontAsk`/`bypassPermissions`/`manual`
✅ `--continue` / `--resume <id|yol>` — oturum devamı
✅ `--plugin-dir <yol>` — marketplace'siz plugin yükleme
✅ `--max-budget-usd` — maliyet tavanı (Faz 6 freni için aday)
✅ `--json-schema` — yapılandırılmış çıktı (→ **Faz 6.3 Katman 2 kabul kontrolü için ideal**;
çıktı `structured_output` alanına gelir)

### JSON çıktısı

✅ `--output-format json` yanıtı `result`, `session_id`, `total_cost_usd` ve
**model bazında maliyet kırılımı** içerir; `--json-schema` ile `structured_output` eklenir.
⚠️ `--continue`/`--resume` ile konuşmanın **kümülatif** toplamı raporlanır (önceki koşular dahil).
⚠️ Rakamlar **istemci tarafı tahmin**; gerçek faturadan farklı olabilir.
❌ **DOĞRULANMADI:** `usage` nesnesinin tam alan adları
(`input_tokens`/`cache_read_input_tokens` vb.). Faz 8.1'de gerçek bir koşunun çıktısı
`jq` ile incelenip SPEC'e yazılmalı. → Açık Soru #4

### 🔴 BEŞİNCİ KRİTİK BULGU — `--bare` abonelik ile çalışmıyor

✅ `--bare` bayrağı hook, skill, komut, **subagent, kurulu plugin, MCP, otomatik hafıza ve
CLAUDE.md** otomatik keşfini atlar. Script'ler için deterministik bağlam demek.

❗ **ANCAK:** *"bare mode never reads OAuth credentials or the system keychain… set
`ANTHROPIC_API_KEY`"*.

→ `--bare`, ROADMAP'in **"kullanıcının kendi aboneliğiyle, ayrı login yok"** ilkesiyle çelişir.
Mod B (headless) `--bare` **olmadan** kullanılırsa abonelik çalışır ama CLAUDE.md ve kurulu
plugin'ler yüklenir (bağlam determinizmi azalır).
→ [ADR-001](decisions.md#adr-001)

⚠️ Ek not: `--bare` olmadan `claude -p` çalıştırıldığında proje `.claude/settings.json`
hook'ları ve `.mcp.json` server'ları **güvenilmeyen klasörde bile** çalışır, onay istenmez.
Benchmark koşucusu (Faz 8.4) temiz klasörler kullandığı için bu bizi etkilemiyor, ama
`docs/BENCHMARK.md`'de not düşülmeli.

### Abonelik / headless kuralları

⚠️ Doküman, `-p`'nin abonelik login'iyle çalıştığını (bare dışında) belirtiyor.
❌ **DOĞRULANMADI:** Abonelik planlarında headless/SDK kullanımının güncel kota kuralları.
Ürün sayfaları değişken; yayın öncesi (Faz 10) tekrar kontrol edilmeli. → Açık Soru #5

---

## 0.5 Yürütme modu karşılaştırması

Ayrıntılı karşılaştırma ve karar: [ADR-001](decisions.md#adr-001).
Özet tablo:

| Ölçüt | Mod A (oturum içi subagent) | Mod B (headless süreç) |
|---|---|---|
| Bağlam kontrolü | Çok iyi — `omitClaudeMd: true` + izole context window | `--bare` ile mükemmel, **ama API key gerekir** |
| Model seçimi | ✅ Çağrı anında override | ✅ `--model` bayrağı |
| Token ölçümü | Transcript JSONL (dolaylı) | ✅ `--output-format json` (doğrudan) |
| Kesinti sonrası devam | Oturum ölürse graph'tan devam | Süreç başına izole, daha dayanıklı |
| Kullanıcı deneyimi | ✅ Doğal — `/gp:run` yaz, ilerlemeyi gör | Terminal kapansa da sürer |
| Abonelik uyumu | ✅ Tam | ⚠️ `--bare` kullanılırsa API key |
| Kullanıcıya soru sorma | ✅ Ana thread sorabilir | ❌ Etkileşimsiz |

---

## 0.7 Rakip notları

> Yöntem: web araması + proje README'leri. Rakip iddiaları **kendi iddiaları**; bağımsız
> doğrulanmadı. Bizim benchmark'ımız (Faz 8) kendi sayılarımızı üretir.

### Task Master (`eyaltoledano/claude-task-master`)

Bir PRD (ürün gereksinim dokümanı) alıp, bağımlılıkları açıkça tanımlı numaralı görev ve alt
görev listesine ayıran AI destekli görev yönetim sistemi. Durumu `tasks.json` dosyasında tutar;
`expand` komutuyla karmaşık görevleri alt görevlere böler, karmaşıklık analizi yapar. MCP server
olarak çalıştığı için Cursor, Windsurf, Claude Code ve VS Code'da aynı şekilde kullanılabilir.
**Odak: görev yönetimi ve izlenebilirlik.** Token optimizasyonu bir hedef olarak belirtilmiyor;
model/agent yönlendirmesi yok, yürütme kullanıcının elinde.
[Kaynak](https://github.com/eyaltoledano/claude-task-master)

### CCPM — Claude Code PM

Spec-driven (spesifikasyon güdümlü) bir iş akışı: PRD'leri epic'lere, epic'leri **GitHub
issue**'larına, issue'ları koda dönüştürür ve her adımda tam izlenebilirlik sağlar. Paralel agent
yürütmesi için **git worktree** kullanır. **Odak: izlenebilirlik ve paralellik.** Durum GitHub'da
yaşar, bu da takım çalışması için güçlü ama GitHub'a bağımlılık yaratır.
[Kaynak](https://github.com/Ninegd/ccpm)

### Task Master plugin varyantları (`qazuor/task-master`, `taskmaster` plugin)

Claude Code plugin paketleri olarak dağıtılan uygulamalar: spesifikasyon üretimi, bağımlılıklı
atomik görevler, karmaşıklık puanı, fazlar ve otomatik kalite kapıları. Oturum başlangıcında
aktif epic'leri ve ilerlemeyi gösteriyor. Biri ~1.8k token ile **3 agent ve 46 komut** sunuyor.
→ Bu bizim için bir **uyarı sinyali**: 46 komut, keşif yükü ve token maliyeti demek. GP'nin
komut sayısı kasıtlı olarak az (6 skill) tutulmalı.
[Kaynak](https://agentskill.sh/plugins/qazuor/task-master) ·
[Kaynak](https://www.claudepluginhub.com/plugins/eyaltoledano-taskmaster-packages-claude-code-plugin)

### claudetm — autonomous task orchestration

Claude Agent SDK üzerine kurulu otonom orkestrasyon: yüksek seviye bir hedefi alıp plan
üretiyor, kod değişikliği yapıyor, PR açıyor, CI'ı izliyor, geri bildirimi işliyor ve başarı
ölçütleri sağlanınca merge ediyor. **Odak: otonomi ve PR yaşam döngüsü.** Bizim Faz 10.8'deki
"bağımsız orkestratör (Agent SDK)" maddesinin yaptığı şey — ama Agent SDK kullandığı için
kullanıcının kendi API key'ini gerektirir.

### Graphify

Kod tabanını **tree-sitter ile AST'ye** ayrıştırıp sorgulanabilir bir bilgi graph'ı kuruyor:
fonksiyonlar, sınıflar, import'lar, çağrı kenarları, veritabanı şemaları, API endpoint'leri.
Agent ham dosyaları tekrar tekrar okumak yerine graph kenarlarını izleyip sadece ilgili
alt-graph'ı yüklüyor. Yapısal analiz **sıfır LLM token**'ı harcıyor ve veri dışarı çıkmıyor.
İddia edilen kazanç: 50+ dosyalık karışık korpuslarda sorgu başına **~71× daha az token**,
agent turu başına input token'da **%70–90** azalma.
[Kaynak](https://dev.to/terminalchai/graphify-turn-codebases-into-knowledge-graphs-to-slash-ai-token-costs-3lfb) ·
[Kaynak](https://stevescargall.com/blog/2026/05/graphify--memmachine-79-token-reduction-zero-vector-database/)

→ **Graphify rakip değil, tamamlayıcı.** O *var olan kodu* graph'lıyor (kod graph'ı);
GP *yapılacak işi* graph'lıyor (görev graph'ı). İkisi dik eksenler. Faz 2.9'daki regex tabanlı
`gp repomap`, Graphify'ın AST yaklaşımının basit halidir; Faz 10.8 zaten tree-sitter'a geçişi
öngörüyor. **Değerlendirilmeli:** `gp repomap` yerine Graphify'ı opsiyonel bir bilgi kaynağı
olarak takmak mantıklı olabilir — kendi AST'imizi yazmaktan kurtarır.

### Akademik arka plan

- *Reliable Graph-RAG for Codebases: AST-Derived Graphs vs LLM-Extracted Knowledge Graphs*
  ([arXiv](https://arxiv.org/pdf/2601.08773)) — AST'den türetilen graph'lar, LLM ile çıkarılanlardan
  daha güvenilir. → Faz 2.9'un "deterministik, LLM'siz" tasarımını destekliyor.
- *Cache-Aware Prompt Compression: A Two-Tier Cost Model for LLM API Caching*
  ([arXiv](https://arxiv.org/pdf/2607.15516)) — cache farkındalığı ile sıkıştırmanın birlikte
  modellenmesi. → Faz 7.1'in (cache dostu sabit sıra) teorik dayanağı.

### Bizim farkımız

| Boyut | Rakiplerde | GraphPilot'ta |
|---|---|---|
| **Görev graph'ı** | ✅ Task Master, CCPM (liste/issue olarak) | ✅ Linkli md, tek kaynak |
| **Bilgi graph'ı** | ✅ Graphify (koddan türetilmiş) | ✅ **Handoff'lardan türetilmiş** — kodun değil, *sözleşmenin* özeti |
| **İkisi birlikte** | ❌ Hiçbiri | ✅ Görev düğümü `reads` ile bilgi düğümüne bağlanır |
| **Flag → model yönlendirmesi** | ❌ Yok | ✅ `complexity`/`risk`/`type` → haiku/sonnet/opus |
| **Bilmesi gereken kadar bağlam** | ⚠️ Kısmen (Graphify: alt-graph) | ✅ Düğüm + doğrudan bağımlılıkların handoff'u + brief; geçişli bağımlılık **yok** |
| **Ölçülmüş tasarruf** | ⚠️ Graphify sayı veriyor, çoğu vermiyor | ✅ Ablasyonlu benchmark, ham Claude Code'a karşı (Faz 8) |
| **Kesinti sonrası ucuz devam** | ❌ Hiçbirinde açık hedef değil | ✅ Yarım iş notu + WIP commit + `gp resume` (Faz 9.1) |
| **Abonelik uyumu** | ⚠️ claudetm API key ister | ✅ Kullanıcının kendi aboneliği, ayrı login yok |

**En ayırt edici iki iddia:** (1) görev graph'ı ve bilgi graph'ının birlikte, handoff
mekanizmasıyla beslenmesi; (2) kesinti sonrası devamın maliyetinin ölçülmüş olması.
Bunların ikisi de Faz 8'de kanıtlanmak zorunda — kanıtlanmazsa ürünün farkı kalmaz.

### Dürüst risk

Graphify'ın %70–90 iddiası, *büyük mevcut kod tabanında sorgu* senaryosundan geliyor.
GP'nin senaryosu *sıfırdan proje üretimi* — orada okunacak mevcut kod az, dolayısıyla
tasarruf oranı daha mütevazı çıkabilir. Faz 8.6'nın "dürüst sınırlar" bölümü bunu
açıkça yazmalı; büyük/mevcut kod tabanı senaryosu bizim güçlü olmadığımız yer olabilir.

---

## Açık Sorular

| # | Soru | Etkilediği faz |
|---|---|---|
| ~~1~~ | ~~Node 20+ zorunlu mu?~~ → **Çözüldü:** Node 20.20.2 kuruldu, `cli/.nvmrc` eklendi | 2.1, 10.1 |
| 2 | Netleştirme soruları (4.2) ana thread'de mi sorulacak, planner'dan nasıl ayrılacak? Ayrıntı altta | 4.2 |
| 3 | Log kırpma hook'u her oturumda aktif olacak; `.graph/` yoksa nasıl sessizce çıkacak? | 7.3 |
| 4 | `--output-format json` çıktısındaki `usage` alan adları tam olarak ne? Gerçek koşu gerekli | 8.1 |
| 5 | Abonelik planlarında headless kota kuralları — yayın öncesi tekrar doğrula | 0.4, 10.6 |
| 6 | `isolation: worktree` paralel yürütmede (6.8) `touches` çakışma kontrolünün yerini alır mı? | 6.8 |

### Açık Soru #2 — detay: netleştirme soruları akışı

**Sorun.** Subagent'lar `AskUserQuestion` aracını **her zaman kaybeder** (bkz. 0.2, "Nesting ve
paralellik"). `planner` bir subagent olduğu için kullanıcıya doğrudan soru **soramaz**. Ama
Faz 4.2 "en fazla 5 soru, seçenekli, önerili" davranışını istiyor — bu seçenekli/önerili biçim
tam olarak `AskUserQuestion`'ın sunduğu şey, düz metinle taklit edilebilir ama deneyim kaybı olur.

**Önerilen akış (iki çağrılı planlama):**

```
/gp:plan "kitap satışı yapan bir web sitesi yap"
  │
  ├─ 1. Ana thread (skill: plan): gp repomap çalıştırır (boş mu, mevcut proje mi tespiti)
  │
  ├─ 2. Ana thread → planner subagent'ı çağırır (1. çağrı, "soru modu")
  │     Girdi: kullanıcı isteği + repomap özeti
  │     Çıktı: yapılandırılmış soru listesi (JSON) — her biri
  │            { soru, seçenekler[], önerilen, varsayım_eğer_atlanırsa }
  │            En fazla 5 madde; istek zaten netse BOŞ liste döner
  │
  ├─ 3. Ana thread: planner boş liste döndürdüyse 4'e atla.
  │     Değilse, soru listesini **ana thread kendisi** `AskUserQuestion` ile kullanıcıya sorar
  │     (planner'ın ürettiği metni olduğu gibi kullanır — kendi soru üretmez)
  │
  ├─ 4. Ana thread → planner subagent'ı çağırır (2. çağrı, "üretim modu")
  │     Girdi: kullanıcı isteği + repomap özeti + cevaplar (ya da "kullanıcı atladı, varsayımları
  │            kullan" notu)
  │     Çıktı: brief.md taslağı + epic listesi
  │
  └─ 5. Ana thread kullanıcıya özet gösterir, onay ister (Faz 4.5)
```

**Sonuçlar:**
- `planner` agent dosyası **iki modu** desteklemeli (`mode: questions | generate` gibi bir
  girdi alanı, ya da iki ayrı prompt şablonu — Faz 4 detayında karar verilecek).
- Soru üretimi **ayrı, ucuz bir çağrı**: sadece istek + repomap özeti okur, kod yazmaz.
  Haiku/Sonnet yeterli olabilir (Faz 4.6 planlama maliyeti ölçümünde ayrı satır).
- "İstek zaten netse 0 soru" kuralı (Faz 4.2, kabul kriteri) planner'ın **boş liste** döndürme
  yeteneğiyle doğal olarak sağlanıyor — ek mantık gerekmiyor.
- Kullanıcı "sen karar ver" derse: ana thread soru listesini sormaz, direkt `önerilen` değerlerle
  2. çağrıyı yapar; bu varsayımlar brief'in "Varsayımlar" bölümüne otomatik düşer.
- Faz 4'teki "örnek prompt" ve agent talimatı bu iki-çağrılı akışa göre yazılmalı; tek bir
  planner çağrısı yetmez.
