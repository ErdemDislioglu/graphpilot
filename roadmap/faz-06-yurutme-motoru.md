# Faz 6 — Yürütme Motoru

**Amaç:** Graph'ı arka planda, adım adım, doğru model ve izole bağlamla yürütmek.
Bu faz bitince ürünün ilk uçtan uca demosu (MVP) hazırdır.

**Ön koşul:** Faz 5.
**Çıktı:** Çalışan `/gp:run` (Mod A) ve gerekirse `gp run` (Mod B).

## Döngü

```
loop:
  ready = gp next --json
  if ready boş:
     açılmamış feature/epic varsa → expand
     yoksa → bitir
  for node in ready (paralel limit dahilinde):
     r = gp route node
     gp context node            # bağlam paketi
     gp set node status=running
     agent(r.agent, r.model) ← bağlam paketi
     doğrulama döngüsü (yaz → kontrol → eksik varsa düzelt → tekrar kontrol)
     başarılı → handoff kontrol → bilgi düğümü güncelle → commit → status=done
     döngü yakınsamadı → retry/escalate politikası
  gp index
```

> **MVP kapsamı:** Bu fazda reviewer agent'ı ve API testleri **yoktur**. Önce uygulama bunlarsız
> uçtan uca çalıştırılır ve Faz 8'de benchmark alınır. Optimize review ve API testi Faz 11'dedir.

## Görevler

### 6.1 Orkestratör (ana thread)
- [x] `/gp:run` komutu: yukarıdaki döngüyü yönetir; **kendisi kod yazmaz**, sadece `gp` çağırır ve agent başlatır
- [x] Orkestratör bağlamını küçük tut: her iterasyonda sadece `gp next` ve `gp status` çıktısını okur
- [x] Parametreler: `--epic E02`, `--max-nodes N`, `--dry-run` (ne yapacağını göster)

### 6.2 Agent çağırma
- [x] Agent'a giden prompt = `gp context` çıktısı + kısa standart talimat
- [x] Model seçimi ADR-002'ye göre: çağrı anında Agent tool'un `model` parametresiyle (agent varyantı yok)
- [x] `max_turns` — **ADR-010 ile çözüldü:** Agent tool'un kendi şemasında bu parametre YOK
      (bu oturumun Agent tool tanımına bakılarak doğrulandı — dokümana değil). Bu yüzden
      iki katmanlı: (1) delegasyon metnine yumuşak talimat ("en fazla N turda bitir"),
      (2) fix-loop'un kendi round sayacı (sert fren). Mod B'de (`claude -p --max-turns`)
      gerçekten mekanik çalışır.

### 6.3 Doğrulama döngüsü (yaz → kontrol et → düzelt)

```
yaz → Katman 1 (script) → Katman 2 (kabul kriteri) → eksik var mı?
        ├─ hayır → bitti
        └─ evet → sadece eksik listesiyle düzelt → tekrar kontrol
```

- [x] **Katman 1 — Script (sıfır token):** build, lint, tip kontrolü, ilgili birim testleri
      — **gerçek kod** (`checks.ts`, `gp checks`), gerçek bir git deposunda `exit 1`→`exit 0`
      geçişiyle elle doğrulandı.
  - Komutlar brief'teki "Test stratejisi"nden ya da `config.yml`'den gelir
  - Sadece hata satırları + kısa stack trace geri döner (Faz 7.3 ile bağlantılı)
- [x] **Katman 2 — Kabul kriteri kontrolü (ucuz model):** Haiku, düğümün kabul kriterlerini diff'e karşı tek tek işaretler
      — **gerçek kod** (`check.ts`, `gp check`, ADR-008). `claude -p` çağrısının kendisi
      MOCK spawner ile test edildi (6 test) — **gerçek bir model çağrısı yapılmadı**
      (onaysız gerçek kullanım harcamamak için, bkz. Faz Günlüğü).
  - Girdi: sadece kabul kriterleri + diff (tüm bağlam değil)
  - Çıktı: yapılandırılmış liste `{ kriter, durum: ok | eksik, not }`
  - **Uygulama — [ADR-008](../docs/decisions.md#adr-008):** `gp check <id>`,
    `claude -p --output-format json --json-schema '<şema>'` çağırır; sonuç `structured_output`
    alanından okunur. Parse hatası riski kalkar ve çağrının maliyeti `total_cost_usd` ile
    **doğrudan** ölçülür (Faz 8.5b için birebir).
  - ❗ `structured_output` alanı **yok olabilir** (model reddi vb.). Alan yoksa "kontrol
    başarısız" döndür; sessizce `ok` sayma.
- [x] **Düzeltme turu:** Coder'a tüm bağlam yeniden gönderilmez; sadece eksik/hata listesi + ilgili dosyalar
- [x] **Frenler:**
  - Tur sınırı: `config.yml` → `fix_loop.max_rounds` (varsayılan 3)
  - Yakınsama kontrolü: bir turda eksik sayısı azalmıyorsa ya da aynı hata tekrar ediyorsa döngü kırılır → 6.5 politikası
  - Tur başına token sayacı; düğüm bütçesinin 2 katı aşılırsa döngü kırılır
- [x] Her tur `_metrics`'e ayrı kayıt (tur no, bulunan eksik sayısı, token)
- [x] `config.yml`:

```yaml
fix_loop:
  enabled: true
  max_rounds: 3
  acceptance_check_model: haiku
  break_if_no_progress: true
```

### 6.4 Handoff ve bilgi güncelleme
- [x] Agent'ın doldurduğu Handoff'u `gp validate` kontrol eder (boş mu, sınırı aşıyor mu)
- [x] Handoff'taki "Bilgi düğümü güncellemeleri" ilgili bilgi düğümüne işlenir
  - Seçenek 1: aynı agent kendi yazar (ucuz)
  - Seçenek 2: bitince docs agent'ı (haiku) birleştirir
  - Kararı ölçüme göre ver
- [x] `updated_by` alanına görev ID'si eklenir

### 6.5 Hata politikası (anlaşılan akış — doğrulama döngüsü yakınsamazsa devreye girer)
- [x] 1. Aynı modelle bir kez tekrar (hata özeti eklenmiş bağlamla)
- [x] 2. `escalation` listesindeki bir üst modele yükselt
- [x] 3. Hâlâ başarısızsa `status: failed`, bağımlı düğümler `blocked`, kullanıcıya kısa rapor ve soru
- [x] Her deneme `## Hata geçmişi` bölümüne tek satır olarak eklenir
- [x] `attempts` sayacı

### 6.6 Git entegrasyonu
- [x] Her `done` düğüm = bir commit: `gp(E02-F01-T03): <summary>`
- [x] Çalışma başında temiz working tree kontrolü
- [ ] Opsiyonel: epic başına branch — **MVP'de uygulanmadı**, basitlik için atlandı
- [x] **Karar verildi:** başarısızlıkta `git restore .` (park yerine geri alma) — basitlik,
      forensic debugging ihtiyacı çıkarsa Faz 9'da park-to-branch eklenebilir

### 6.7 Ara kayıt (checkpoint) — ucuz devam için hazırlık
- [x] Agent, düğüm ortasında anlamlı adımlarda düğüme kısa bir `## Yarım iş` notu yazar —
      `coder.md`'ye talimat eklendi (resume.ts zaten bu bölümü okuyordu, Faz 2'den).
- [x] Doğrulama döngüsünün her turu sonunda WIP commit — `/gp:run` skill talimatına yazıldı
      (orkestratör yapar, yeni CLI komutu gerekmedi — `git commit` yeterli).
- [ ] **Kapsam dışı bırakıldı (kasıtlı):** WIP commit'lerin squash'lanması — `/gp:run`
      talimatına `git reset --soft` adımı yazıldı ama gerçek bir multi-commit senaryosuyla
      test edilmedi; roadmap'in kendi notu bu zaten Faz 9.1'in gerçek kapsamı.
- [ ] Devam akışının kendisi Faz 9.1'de (değişmedi)

### 6.8 Paralel yürütme
- [x] `gp next`'in döndürdüğü çakışmasız gruplar paralel çalıştırılır
- [x] Varsayılan paralellik düşük (2); `config.yml` ile ayarlanır
- [x] ~~Faz 0'da paralel subagent davranışı sorunluysa sıralı çalış~~ → **Sorun yok.**
      Eşzamanlı subagent limiti **20** (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`); 21.'si hata verir.
      Hedef paralellik 2, limitin çok altında.
- [x] **Karar verildi — Açık Soru #6 kapatıldı:** `isolation: worktree` MVP'de
      KULLANILMAZ. `touches` bazlı çakışma grubu (Faz 2.5, zaten kanıtlı) yeterli; worktree
      yönetimi (branch/merge karmaşıklığı) MVP'nin gerektirmediği bir maliyet. İleride
      (Faz 9/7) paralellik artırılırsa yeniden değerlendirilebilir.

### 6.9 Mod B (opsiyonel — [ADR-001](../docs/decisions.md#adr-001) ile *opsiyonel* onaylandı)

> ❗ **`--bare` KULLANILMAZ.** `--bare` OAuth/keychain okumaz, `ANTHROPIC_API_KEY` ister —
> ürünün "kendi aboneliğiyle çalışır" ilkesini bozar. Bağlam determinizmi `--append-system-prompt`
> ve `--agents` ile telafi edilir.
- [x] `gp run` CLI'ı her düğüm için `claude -p --model X --max-turns N` süreci başlatır —
      **gerçek kod** (`runModeB.ts`, `agentFile.ts`), `--bare` içermediği gerçekten test
      edildi. **Kasıtlı olarak sınırlı ilk sürüm:** doğrulama döngüsü/escalation Mod B'ye
      entegre DEĞİL — düğüm başına tek deneme. Tam dayanıklı sürüm ileride genişletilecek.
- [ ] Uzun otonom çalışmalar — **canlı test edilmedi** (gerçek `claude` süreci spawn
      edilmedi, mock spawner ile test edildi)
- [x] Aynı graph, aynı politika — `gp next`/`gp route`/`gp context` ikisinde de aynı

### 6.10 İlk uçtan uca demo
- [ ] **Canlı demo yapılamadı — Faz 3/4/5'teki aynı kasıtlı sınır.** Agent tool'u
      kullanmam politika dışı, gerçek `claude -p`/`claude -p --json-schema` çağrısı da
      onaysız gerçek kullanım harcardı. **Bunun yerine tüm DETERMİNİSTİK iskelet gerçek
      bir git deposunda gerçek `gp` komutlarıyla uçtan uca kanıtlandı:** Katman 1
      (`exit 1`→`exit 0`) → fix-loop record/status (devam et → yakınsadı) → Handoff →
      commit (`gp(E01-F01-T01): Z`) → `status: done` → `gp validate` temiz; ayrı bir
      senaryoda escalate→escalate→fail→blocked zinciri de aynı şekilde kanıtlandı.
- [x] Review ve API testi kapalı (MVP kapsamı) — Faz 11'e kadar hiç kod yazılmadı
- [x] Sonuç (simülasyonda): commit geçmişi düzenli (`git log` ile doğrulandı), `gp validate`
      temiz. Gerçek agent yazımı/testi olmadığı için "birim testleri geçiyor" canlı
      doğrulanamadı.

## Claude'a örnek prompt

```
faz-06 dosyasındaki 6.5 görevini yap. Hata politikasını plugin/commands/run.md'ye
ve gerekli CLI desteğini (gp set, gp escalate) cli/ altına ekle.
Önce durum makinesi diyagramını metin olarak göster, onayımdan sonra uygula.
```

## Kabul kriterleri
- [ ] Küçük senaryo uçtan uca, insan müdahalesi olmadan tamamlanıyor — **canlı test edilemedi**
      (6.10'daki kasıtlı sınır). Kullanıcının kendi oturumunda `/gp:run` ile denemesi gerekiyor.
- [x] Bilerek eksik bırakılan bir görevde doğrulama döngüsü eksiği bulup düzeltiyor —
      **mekanizma gerçek `gp` komutlarıyla kanıtlandı** (Katman 1 fail→fix→pass→yakınsadı
      zinciri, yukarıdaki simülasyon). Gerçek bir coder/checker LLM çağrısı yapılmadı.
- [x] Düzeltilemeyen bir görevde döngü sınırda kırılıyor ve retry → escalate → failed akışı
      doğru çalışıyor — **mekanizma gerçek `gp` komutlarıyla kanıtlandı** (escalate→escalate→
      fail→blocked zinciri, yukarıdaki simülasyon).
- [x] Agent'a giden **değişken** bağlam yalnızca `gp context` çıktısıdır; sabit kalemler
      (agent sistem prompt'u, git durum anlık görüntüsü) dışında graph'tan başka dosya okunmaz.
      *(Faz 0 düzeltmesi — [ADR-003](../docs/decisions.md#adr-003): "birebir aynı" literal olarak
      sağlanamaz, çünkü subagent her zaman kendi sistem prompt'unu ve git anlık görüntüsünü alır.
      CLAUDE.md hiyerarşisi `omitClaudeMd: true` ile kesilir.)* Statik olarak doğru kuruldu
      (`/gp:run` skill'i sadece `gp context` çıktısını okuyup Agent tool'a geçiriyor);
      canlı gözlem yapılmadı.

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
| 2026-10-24 | — | **Gerçek platform kısıtı bulundu — ADR-010:** Agent tool'umun KENDİ şeması (`description`,`isolation`,`model`,`prompt`,`subagent_type`) `maxTurns` parametresi içermiyor — dokümana değil, bu oturumda gerçekten kullanılabilir tool tanımına bakılarak doğrulandı. `max_turns` artık yumuşak talimat + fix-loop'un sert round sayacı olarak iki katmanlı uygulanıyor. |
| 2026-10-24 | 6.3 | Doğrulama döngüsünün tamamı gerçek kodla kuruldu: `checks.ts` (Katman 1), `check.ts` (Katman 2, ADR-008), `fixLoop.ts`+`metrics.ts` ("Frenler": tur sınırı, yakınsama, token bütçesi). 10 gerçek execSync testi dahil (mock sadece gerekli yerde). |
| 2026-10-24 | 6.5 | Hata politikası: `escalate.ts` (model yükseltme, escalation listesinde olmayan modeli TAHMİN ETMEZ), `fail.ts` (terminal durum + doğrudan bağımlıları blocked'a kademeleme). `markdown.ts`'e `appendToSection` eklendi (Hata geçmişi/Yarım iş için paylaşılan yardımcı), kendi test dosyası (8 test) ilk kez yazıldı. |
| 2026-10-24 | 6.1, 6.8 | `expandCandidates.ts` (açılmamış epic/feature tespiti, deterministik), `config.yml`'e `parallelism`/`checks`/`fix_loop` eklendi. `isolation: worktree` kararı kapatıldı (research.md Açık Soru #6) — MVP'de kullanılmıyor. |
| 2026-10-24 | 6.9 | Mod B temel sürümü: `agentFile.ts` + `runModeB.ts` + `gp run`. `--bare` içermediği test edildi (ADR-001). Kasıtlı sınırlı: doğrulama döngüsü/escalation entegre değil. |
| 2026-10-24 | — | `/gp:run` skill'i (6.1-6.8'i birleştiren orkestratör) ve `coder.md` güncellemesi (yumuşak tur bütçesi + Yarım iş talimatı) yazıldı. 212 test, hepsi geçti. `claude plugin validate` temiz. |
| 2026-10-24 | 6.3/6.5/6.10 | Dürüst sınır: gerçek `claude`/`claude -p` çağrısı hiç yapılmadı (Agent tool politika dışı, gerçek kullanım onaysız harcardı). Tüm deterministik iskelet GERÇEK bir git deposunda gerçek `gp` komutlarıyla uçtan uca kanıtlandı (Katman1 fail→fix→yakınsama, escalate→escalate→fail→blocked, commit formatı) — planner/coder/tester'ın gerçek muhakemesi değil. |
