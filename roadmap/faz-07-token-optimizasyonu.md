# Faz 7 — Token Optimizasyon Katmanı

**Amaç:** Bağlam izolasyonunun üstüne ek tasarruf tekniklerini eklemek.
**Her teknik açılıp kapatılabilir olmalı** ki Faz 8'de etkisi tek tek ölçülebilsin.

**Ön koşul:** Faz 6 (çalışan yürütme döngüsü). Faz 8 ile iç içe ilerler.
**Çıktı:** `config.yml` altında `optimizations:` bölümü, her tekniğin ölçülmüş etkisi.

```yaml
optimizations:
  cache_friendly_order: true
  log_trimming: true
  tool_restriction: true
  batch_low_nodes: true
  deterministic_scaffold: true
  turn_limits: true
  repo_map: true
  # selective_review → Faz 11
```

## Görevler

### 7.1 Cache dostu sıralama
- [x] `gp context` paket sırası sabit: brief → index → bilgi → handoff → düğüm
      — **zaten Faz 2/6'da böyle kurulmuş** (`cli/src/context.ts:24-32` yorumu + uygulaması).
      `context.test.ts`'teki "sabit sıra" testi bunu birebir doğruluyor.
- [x] Brief ve index içeriği deterministik (tarih, rastgele sıra, zaman damgası yok)
      — `indexGen.ts` her listede açık `.sort()` kullanıyor (Map iterasyon sırasına güvenmiyor),
      brief/index/handoff içeriği literal dosya body'si (üretim anı bilgisi yok).
      `context.test.ts` → "determinizm (kabul kriteri: byte-byte aynı)" testi aynı graph'ın
      iki ayrı parse'ının byte-byte aynı çıktı verdiğini kanıtlıyor. `metrics.ts`/`atomicWrite.ts`
      içindeki `Date.now()` kullanımları context paketine GİRMİYOR (sırasıyla fix-loop log kaydı
      ve geçici dosya adı) — grep ile doğrulandı, context'i etkilemiyor.
- [ ] ❗ **Bloklu — Faz 8.1'i bekliyor:** Ölç: cache okuma token oranı (cache read / toplam input).
      `claude -p --output-format json` çıktısının `usage` nesnesinin alan adları
      (`cache_read_input_tokens` vb.) **DOĞRULANMADI** ([research.md Açık Soru #4](../docs/research.md)).
      CLAUDE.md kuralı gereği doğrulanmamış alan adıyla kod yazılmayacak; bu ölçüm Faz 8.1'de
      gerçek bir `claude -p` çıktısı `jq` ile incelenip alan adları SPEC'e yazıldıktan sonra yapılacak.

### 7.2 Repo haritası kullanımı
- [x] Agent talimatı: "Dosya aramadan önce repo-map'e bak" — `coder.md`'de zaten vardı
      (Faz 6); `/gp:run` SKILL.md'ye de `optimizations.repo_map` açıkken delegasyon
      promptuna bu talimatı EKLEYEN bir adım yazıldı (kapalıyken eklenmez — gerçek, çalışan
      bir açık/kapalı anahtarı; ADR-002 gereği agent `.md` dosyası kendisi çağrı anında
      değiştirilemiyor, bu yüzden talimat promptun DEĞİŞKEN kısmına ekleniyor).
- [x] Repo-map her epic sonunda yeniden üretilir — `gp epic-done <id>` (`epicStatus.ts`,
      3 test) epic'in TÜM feature/task'ları done mu diye bakar; `/gp:run` SKILL.md adım 4.6'da
      `done:true` ise `gp repomap` çalıştırır (`optimizations.repo_map` kapalıysa atlanır).
- [x] Ölç: düğüm başına Glob/Grep/Read çağrı sayısı — `gp hook track-tool-use`
      (`PreToolUse`, `trackToolUse.ts`, 9 test + `hookCli.test.ts` gerçek süreçle) her
      çağrıyı `.graph/_metrics/tool-use.jsonl`'e yazar. **ADR-011:** "düğüm başına" anahtar
      `agent_id` — her Agent tool çağrısına özel olduğu VARSAYILDI, bu oturumda gerçek bir
      paralel koşuyla DOĞRULANMADI (yanlışsa sonuç zararsız: sayaçlar karışır, veri kaybı
      ya da çökme olmaz).

### 7.3 Log ve çıktı kırpma
- [x] Test/build çıktısında sadece hata satırları + ilk N satır stack trace —
      `checks.ts`'in `truncate()`'i (Faz 6'dan) son 50 satırı alıyordu; artık
      `config.optimizations.log_trimming` ile açılıp kapatılabilir (`opts.trimOutput`,
      `checks.test.ts`'e yeni test eklendi).
- [x] ~~Uygulama yolu belirsiz~~ → **[ADR-005](../docs/decisions.md#adr-005): ikisi birlikte.**
      `PostToolUse` hook'u `hookSpecificOutput.updatedToolOutput` ile tool çıktısını
      **değiştirebiliyor** (Faz 0'da doğrulandı). Doğrulama script'i kendi çıktısını kırpar
      (garantili taban) + hook `matcher: "Bash"` ile agent'ın kendi komutlarını da kırpar.
- [x] ❗ **Plugin hook'ları plugin yüklendiği anda kaydedilir**, `/gp:run` beklemez — her oturumda
      her Bash çağrısında ateşlenir. Kırpma script'i `.graph/` yoksa veya config'te kapalıysa
      **çıktıyı değiştirmeden hemen çıkmalı**; aksi halde GP, kendisini kullanmayan oturumları
      da etkiler. Script hızlı olmalı (her Bash çağrısına gecikme eklemez). —
      **uygulandı:** `gp hook trim-bash` (`trimBash.ts`, `hooks/fastConfig.ts` — TAM
      `parseGraph` değil, SADECE `config.yml` okur, hızlı kalır). `.graph` yoksa/`log_trimming`
      kapalıysa/tool Bash değilse `{}` (no-op) döner; her dal 7 testle (`trimBash.test.ts`)
      + gerçek alt süreçle (`hookCli.test.ts`) doğrulandı. `plugin/hooks/hooks.json`'a
      `PostToolUse` + `matcher: "Bash"` olarak kaydedildi. **ADR-011:** Bash `tool_response`'un
      TAM iç şekli DOĞRULANMADI — okuyucu savunmacı (birkaç tanıdık alanı dener, uymazsa no-op).
- [x] Ölç: düğüm başına tool çıktısı token'ı — aynı hook `tool-use.jsonl`'e kayıt düşer
      (7.2 ile paylaşılan altyapı).

### 7.4 Araç kısıtlama
- [x] Her agent sadece gereken araçlara sahip (Faz 3.3). `tools` (izin listesi) ve
      `disallowedTools` (yasak liste, **önce uygulanır**) birlikte kullanılabilir —
      **zaten Faz 3'te böyle kurulmuş**, bu fazda sadece doğrulandı (agent `.md`
      dosyaları okunup kontrol edildi).
- [x] docs agent'ında shell yok, checker'da yazma yok — `plugin/agents/docs.md`:
      `tools: Read, Edit, Write` + `disallowedTools: Bash`; `plugin/agents/checker.md`:
      `tools: Read` (başka hiçbir araç yok). Doğrulandı.
- [x] Ölç: tool tanım token'ı ve gereksiz araç kullanımı — `gp agent-stats`
      (`agentStats.ts`, 2 test) her agent `.md`'sinin `tools`/`disallowedTools` ve toplam
      dosya token tahminini verir; "gereksiz araç kullanımı" aynı `tool-use.jsonl`'den
      (7.2/7.9) okunabilir. **Yapısal sınır:** "kısıtlama olmasaydı ne olurdu" karşılaştırması
      YOK — ADR-002 agent tanımının çağrı anında override edilemediğini zaten kurmuştu,
      gerçek bir "kısıtlamasız" varyant bakımı bu fazın kapsamı dışında bırakıldı
      (bkz. `bench/results/ablation.md`).

### 7.5 Küçük düğümleri birleştirme
- [x] Aynı feature içindeki, birbirine bağımlı olmayan, `complexity: low` ve aynı modele düşen düğümler tek agent çağrısında yapılır
      — `computeLowComplexityBatches` (`batching.ts`, 5 test). Feature anahtarı task
      ID'sinin ilk iki parçası (`E01-F01-T03` → `E01-F01`, ayrı bir graph taraması
      gerektirmiyor); bağımsızlık zaten `gp next`'in `ready` listesinden geliyor (ready
      olan iki task birbirine `depends_on` olamaz). `gp next --json`'a `batches` alanı
      eklendi (`optimizations.batch_low_nodes` açıkken dolu), `/gp:run` SKILL.md'ye
      birleşik çağrı talimatı yazıldı.
- [x] Üst sınır: toplam `context_budget` aşılmaz, en fazla 4 düğüm — **yorum kararı**
      (roadmap "toplam context_budget aşılmaz" diyor ama tavan değeri belirtmiyor):
      tavan = `config.budgets.default_context` seçildi (bir batch, tek bir normal düğüm
      çağrısı kadar bağlam tüketir). `batching.ts`'te yorumla belgelendi.
- [x] Her düğüm yine ayrı handoff ve ayrı status alır — kod SEVİYESİNDE zaten garanti:
      `batching.ts` sadece agent ÇAĞRISINI gruplar, graph'a dokunmaz; `/gp:run` SKILL.md
      doğrulama/commit/status adımlarını batch içindeki her task için AYRI AYRI uygulamayı
      açıkça yazıyor.

### 7.6 Deterministik iskelet
- [x] `type: scaffold` görevlerinde önce resmi iskelet aracı (ör. `npm create vite`, `npx create-next-app`) script ile çalıştırılır
      — `gp scaffold <id>` (`scaffold.ts`, `checks.ts`'in `defaultRunner`'ını paylaşır, 6 test
      — biri gerçek `execSync`). `optimizations.deterministic_scaffold` kapalıysa HİÇBİR ŞEY
      çalıştırmaz (`ran:false`), ablasyonda agent iskeletin tamamını kendisi yazar.
- [x] Agent sadece özelleştirme yapar — `/gp:run` SKILL.md'ye adım eklendi: scaffold
      başarıyla çalıştıysa delegasyon promptuna "iskelet zaten kuruldu, SADECE özelleştir" notu.
- [x] Brief'teki stack'e göre iskelet komutu tablosu (`config.yml`) — `config.yml`'e
      `scaffold_commands: { <stack>: <komut> }` eklendi (`schema/config.ts`), task
      frontmatter'ına `scaffold_stack` alanı eklendi (`schema/task.ts`). "Brief'teki
      stack'e göre" otomatik seçim YOK — `scaffold_stack` elle (planner tarafından)
      ayarlanır; brief'ten otomatik çıkarım bu fazın kapsamı dışında bırakıldı (basitlik).

### 7.7 Tur limiti ve döngü tespiti
- [x] `max_turns` aşılırsa düğüm kesilir ve yükseltilir — **yeni kod gerekmedi, zaten
      Faz 6'da var:** ADR-010 + 6.3/6.5 — agent bitiremezse (`## Yarım iş`) Katman 1/2
      başarısız olur → fix-loop round'ları tükenir → `escalate` devreye girer. Bu Faz 7'nin
      DEĞİL, Faz 6'nın mekanizması; burada sadece referans verildi.
- [x] Aynı dosyayı 3+ kez okuyan ya da aynı komutu tekrar eden agent tespiti (hook ile sayaç) → uyarı
      — `gp hook track-tool-use` (`trackToolUse.ts`) `PreToolUse`'da Read/Glob/Grep/Write/Bash
      hedeflerini sayar, TAM eşiğe ulaşınca (3., spam olmasın diye sadece bir kez)
      `hookSpecificOutput.additionalContext` ile uyarı ekler (research.md'de DOĞRULANAN alan).
      `optimizations.turn_limits` kapalıysa uyarı ÜRETİLMEZ ama ölçüm (sayaç/`tool-use.jsonl`)
      yine tutulur — teknik ile ölçüm ayrı tutuldu.

### 7.8 Doğrulama döngüsü verimliliği
- [x] Düzeltme turlarında sadece eksik listesi + ilgili dosya gönderildiğini doğrula (tam bağlam tekrar gönderilmiyor)
      — **zaten Faz 6.3'te kurulmuş**: `coder.md`'nin "Düzeltme turu" kuralı + `/gp:run`
      SKILL.md adım 3 ("coder'ı SADECE eksik listesiyle... tekrar çağır"). Doğrulandı, yeni
      kod gerekmedi.
- [x] Katman 2 girdisini minimize et: kabul kriterleri + diff, başka bir şey yok —
      **zaten ADR-008/`check.ts`'te böyle**: `extractAcceptanceCriteria(node)` + `git diff`,
      başka hiçbir bağlam `claude -p --json-schema`'ya gitmiyor. Doğrulandı.
- [x] Ölç: tur başına token, ilk tur ile sonraki turların oranı — `computeFixLoopTokenRatio`
      (`fixLoop.ts`, 4 test) + `gp fix-loop stats <id>`. `fix_loop.jsonl`'deki mevcut
      `tokens` alanından (Faz 6) hesaplar, yeni bir veri kaynağı gerekmedi.

> Seçici review bu fazdan çıkarıldı, Faz 11'e taşındı.

### 7.9 Diff disiplini
- [x] Agent talimatı: mevcut dosyada Write yerine Edit — **zaten Faz 6'da var**
      (`coder.md`/`docs.md`: "Var olan dosyayı baştan yazma, düzenle"). Doğrulandı.
- [x] Ölç: Write ile yeniden yazılan mevcut dosya sayısı (hook ile) — aynı
      `gp hook track-tool-use`: `Write` çağrısından ÖNCE (`PreToolUse`, dosya henüz
      yazılmadan) hedef dosyanın var olup olmadığına bakar, varsa kaydın
      `overwritesExisting:true` alanını işaretler (`trackToolUse.test.ts`).

### 7.10 Ablasyon tablosu
- [x] Her tekniği tek tek kapatarak orta senaryoyu çalıştır — **dürüst sınır** (Faz 0/6'daki
      aynı kısıt tekrarlandı): gerçek çok-koşu LLM benchmark'ı burada YOK (onaysız gerçek API
      kullanımı harcardı, bu Faz 8'in işi). Bunun yerine `gp ablation` (`ablation.ts`, 7 test)
      her tekniğin GERÇEK kodunu GERÇEK `docs/examples/bookstore` graph'ına ve GERÇEK
      `plugin/agents/` dosyalarına karşı çalıştırıp ölçülebilen HER ŞEYİ ölçer (log kırpma
      gerçek %83 azalma, batching gerçek çağrı sayısı, vb.); sadece doğası gereği tekrarlı
      gerçek API çağrısı gerektiren metrikler (cache isabet oranı, Faz 8.1) "yapısal" olarak
      işaretlendi.
- [x] Sonuç tablosu: teknik, token farkı, maliyet farkı, kalite etkisi — `bench/results/ablation.md`
      üretildi (teknik + durum: ölçüldü/yapısal/n-a + detay). Maliyet farkı/kalite etkisi
      gerçek model çağrısı gerektirdiği için bu tabloda YOK — Faz 8'in kapsamı.
- [x] Etkisiz ya da zararlı teknikleri varsayılan olarak kapat — ablasyon tablosunda
      hiçbir teknik "zararlı" bulunmadı (hepsi ya ölçülebilir bir kazanç gösterdi ya da
      yapısal/n-a); varsayılanlar hepsi AÇIK bırakıldı (`DEFAULT_OPTIMIZATIONS`, `config.ts`).

## Claude'a örnek prompt

```
faz-07 dosyasındaki 7.3 görevini yap. Önce docs/research.md'de hook'larla tool çıktısının
değiştirilebilir olup olmadığına bak. Değiştirilemiyorsa sadece doğrulama script'inde kırpma yap.
Kırpma kuralını config'ten kapatılabilir yap ve bir test yaz.
```

## Kabul kriterleri
- [x] Tüm teknikler `config.yml` ile ayrı ayrı açılıp kapatılabiliyor — `optimizations.*`
      (7 bayrak, `config.test.ts`'te doğrulandı); her birinin GERÇEKTEN bir kod dalını
      değiştirdiği ilgili tekniğin kendi testinde kanıtlandı (`cache_friendly_order` →
      context.test.ts, `log_trimming` → checks.test.ts, `batch_low_nodes` → batching.test.ts,
      `deterministic_scaffold` → scaffold.test.ts, `turn_limits`/`repo_map` → trackToolUse.test.ts).
      `tool_restriction` İSTİSNA: yapısal/statik, config anahtarı var ama ablasyon için gerçek
      bir "kısıtlamasız" varyantı yok (ADR-002 — yukarıda 7.4'te gerekçelendirildi).
- [x] Ablasyon tablosu `bench/results/ablation.md`'de — üretildi, gerçek verilerle.
- [x] Varsayılan açık teknikler ölçümle gerekçelendirildi — hiçbiri zararlı bulunmadı,
      hepsi açık varsayıldı (bkz. 7.10).

**Dürüst özet (bu fazın kendi sınırı):** Faz 7/8 iç içe ilerliyor (dosyanın kendi başlığı
bunu söylüyor) — bu oturumda yazılan her şey gerçek kod + gerçek Vitest testleriyle
(toplam 266 test, hepsi geçiyor) doğrulandı, ama HİÇBİR gerçek `claude -p`/Agent tool
çağrısı yapılmadı (politika + onaysız harcama riski). Bu yüzden: (a) cache isabet oranı,
(b) gerçek paralel bir koşuda `agent_id`'nin node'a 1:1 denk gelip gelmediği, (c) hook'ların
GERÇEK Claude Code tarafından gönderilen `tool_response`/`tool_input` alan adlarıyla uyumu
— hâlâ DOĞRULANMADI, Faz 8'i bekliyor (bkz. ADR-011).

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
| 2026-10-24 | 7.1 | Sıra ve determinizm bulguları: `gp context` sabit sırası ve deterministik üretim
**zaten Faz 2/6'da tamamlanmış ve test edilmiş** (`context.ts`, `indexGen.ts`,
`context.test.ts`'teki "sabit sıra" + "determinizm" testleri) — yeni kod gerekmedi, sadece
doğrulanıp roadmap'e işlendi. Cache okuma oranı ölçümü **bilerek yapılmadı**: `usage` alan adları
henüz DOĞRULANMADI (research.md Açık Soru #4), Faz 8.1'i bekliyor. 212 test hâlâ geçiyor
(Node 18 ile `vitest`/`rolldown` `node:util styleText` hatası veriyor — bu ortamda `nvm use 22`
gerekiyor, kod değişikliği değil).
| 2026-10-24 | 7.2–7.10 | Fazın TAMAMI tek oturumda yazıldı (kullanıcı talebiyle — normalde
"tek görev" kuralı geçerli). Yeni kod: `schema/config.ts` (`optimizations` + `scaffold_commands`),
`schema/task.ts` (`scaffold_stack`), `context.ts` (ablasyon sıra anahtarı), `checks.ts`
(`trimOutput` parametresi), `batching.ts`, `epicStatus.ts`, `scaffold.ts`, `agentStats.ts`,
`ablation.ts`, `hooks/fastConfig.ts`, `hooks/trimBash.ts`, `hooks/trackToolUse.ts`; yeni CLI
komutları: `gp epic-done`, `gp scaffold`, `gp agent-stats`, `gp ablation`, `gp fix-loop stats`,
`gp hook trim-bash`, `gp hook track-tool-use`; `gp next`'e `batches` alanı eklendi.
`plugin/hooks/hooks.json`'a gerçek `PostToolUse`/`PreToolUse` kayıtları eklendi, `/gp:run`
SKILL.md güncellendi (batching, scaffold, repo-map tazeleme, hook'ların varlığı). 212 → **266
test** (54 yeni test, hepsi geçiyor — `npx tsc --noEmit` ve `npm run lint` temiz).
`scripts/sync-cli-to-plugin.sh` ile `plugin/lib/` yeniden derlendi, `claude plugin validate`
temiz (önceden var olan, ilgisiz "author" uyarısı hariç). `docs/decisions.md`'ye **ADR-011**
eklendi (hook'taki iki DOĞRULANMAMIŞ varsayım: `agent_id`=düğüm, Bash `tool_response` şekli —
ikisi de "yanlışsa zararsız" tasarlandı). `bench/results/ablation.md` gerçek bookstore
örneğiyle üretildi. **Bilerek yapılmayan/ertelenen:** 7.1'in cache-isabet oranı (Açık Soru #4),
tool_restriction'ın "kısıtlamasız" karşılaştırması (ADR-002 — platformda yok), hook'ların
GERÇEK bir Claude Code oturumunda (gerçek `tool_response` alan adlarıyla) hiç ateşlenmemiş
olması — hepsi Faz 8'e devrediliyor.
