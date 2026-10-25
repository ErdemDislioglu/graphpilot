---
description: >-
  Graph'ı arka planda, adım adım, doğru model ve izole bağlamla yürütür (MVP — Faz 6:
  reviewer ve API testi yok, Faz 11'de eklenecek). `team.enabled` varsayılan AÇIK
  olduğu için görevler otomatik olarak junior/senior/tester/docs rollerine gider (Faz
  13) — `config.yml`'de `team.enabled: false` ile kapatılabilir. Kullanıcı "/gp:run"
  yazdığında çalışır.
argument-hint: "[--epic <id>] [--max-nodes N] [--dry-run]"
---

# /gp:run

> Bu skill ANA THREAD'de çalışır. **Kendin kod yazmazsın** — sadece `gp` çağırır ve
> `coder`/`senior`/`tester` subagent'larını başlatırsın. Bağlamını küçük tut: her
> iterasyonda sadece `gp next`/`gp status` çıktısını oku, graph dosyalarını kendin açma.

## 0. Parametreler
- `--epic <id>`: sadece o epic'in task'larını işle (gp next'in döndürdüğü listeyi
  `epicId === <id>` ile kendi filtrele — ayrı bir CLI bayrağı yok).
- `--max-nodes N`: en fazla N task bitirince dur.
- `--dry-run`: hiçbir agent çağırma, sadece ne yapacağını (sıradaki task'lar, modeller) göster.

## 0.5 Başlamadan önce — kaldığı yerden devam (Faz 9.1)

**Eski oturumu ASLA sürdürme** — her `/gp:run` çağrısı yeni, temiz bir oturumdur. Önce:
```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" resume --json
```
Bu ~500 token'lık özeti oku, graph'ın geri kalanını AÇMA. `running kalmış düğümler` boş
değilse (önceki oturum kesintiye uğramış):
```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" recover -p <proje-kökü> --json
```
Bu, her `running` düğüm için karar verir: `## Yarım iş` notu varsa dokunmaz (döngüye
`ready` listesinde değil ama context'i okunup devam edilecek — 2. adıma `resume`
çıktısındaki node ID'siyle direkt geç); notu yoksa commit'lenmemiş değişikliği geri alıp
`pending`'e döndürür (normal `gp next` akışına girer). `orphanWip` dolu dönerse kullanıcıya
bildir (squash edilmemiş eski WIP commit'ler — elle temizlik gerekebilir, otomatik
silinmez).

## 1. Döngü — her iterasyon

```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" next --json
```
- `cycles` boş değilse: kullanıcıya döngüyü göster, dur (otomatik çözme — bu bir tasarım hatası).
- `ready` boşsa:
  - `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" expand-candidates --json` çalıştır.
  - Aday varsa **`/gp:expand <id>`**'i çağır (aynı skill, sen onu invoke edersin), sonra
    döngüye devam et (next'i tekrar çalıştır).
  - Aday da yoksa: bitti. `gp status --json` ile kısa özet ver, dur.
- `ready` varsa: `groups`'taki her grubu **aynı mesajda birden fazla Agent tool çağrısı**
  olarak gönder (Claude Code paralel çalıştırır) — ama `config.yml`'deki `parallelism`'i
  aşma (varsayılan 2; birden fazla grup varsa bile aynı anda en fazla bu kadar task işle).
- **Faz 7.5 — küçük düğüm birleştirme:** `next --json`'ın `batches` alanı (sadece
  `optimizations.batch_low_nodes` açıksa dolu gelir) aynı feature + `complexity: low` +
  aynı model/agent'a düşen, en fazla 4 task'lık öneri grupları verir. Bir `batch` için:
  TEK Agent tool çağrısı yap — `prompt`'u her task'ın kendi `gp context <id>` çıktısının
  art arda birleşimi yap (aralarına `\n\n===\n\n` koy, hangi bölümün hangi task'a ait
  olduğunu başlıkla belirt), model/agent `batch.model`/`batch.agent`. Agent'a KESİNLİKLE
  "her task için AYRI bir `## Handoff` yaz ve her birini kendi task ID'siyle etiketle" de.
  Sonrasında 3-4. adımları (doğrulama, status, commit) HER task için AYRI AYRI uygula —
  batch sadece agent ÇAĞRISINI birleştirir, graph durumunu değil ("Her düğüm yine ayrı
  handoff ve ayrı status alır" — roadmap 7.5).

## 2. Her task için — adım adım

```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" route <id> --json       # { model, agent, review, budget, max_turns }
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" context <id> --json     # .graph/_runtime/<id>.context.md yazar
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" set <id> status=running
```
**Ekip modu (Faz 13, varsayılan açık):** `config.yml`'de `team.enabled: false` yazılı
DEĞİLSE (varsayılan `true`), `gp route` KENDİSİ `config.team.*`'a göre yönlendirir —
`agent` bazen `senior` döner (karmaşık/riskli görevler), model `config.team.junior/
senior.*`'tan gelir, `config.routing` tablosuna HİÇ BAKILMAZ. Bu ayrım TAMAMEN `gp
route`'un içinde — bu skill'in talimatı DEĞİŞMEZ, `route.agent`/`route.model`'i olduğu
gibi kullan. Aynı otomatik ayrım `escalate <id>`'de de var (5. adım) — zincir
"junior(haiku)→junior(sonnet)→senior" olur, bitmesi daha uzun sürer. Daha zengin ekip
deneyimi (bulgu bildirme + yönetici karar politikası, Telegram/AskUserQuestion
eskalasyonu) için kullanıcı doğrudan **`/gp:team`**'i çağırabilir.
**Faz 7.6 — deterministik iskelet:** task'ın `type: scaffold` olup olmadığına bak (context
paketindeki `## node` bölümünde görünür). Öyleyse ÖNCE:
```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" scaffold <id> -p <proje-kökü> --json
```
`ran:true, ok:true` → iskelet gerçek araçla kuruldu; agent'a verilecek talimata
"İskelet zaten `<command>` ile kuruldu, SADECE özelleştir/bitir" ekle. `ran:false`
(scaffold_stack/komut tanımlı değil ya da `deterministic_scaffold` kapalı) → normal akış,
agent iskeleti de kendisi yazar.

`.graph/_runtime/<id>.context.md`'yi oku (Read). Agent tool'u çağır:
- `subagent_type`: `route.agent` (`coder` | `tester` | `docs`)
- `model`: `route.model` (ADR-002 — çağrı anında override)
- `prompt`: context dosyasının içeriği + şu satırlar:
  - `"En fazla ${route.max_turns} turda bitir (ADR-010 — yumuşak sınır); bitiremezsen ## Yarım iş yaz."`
  - **Faz 7.2** — `config.yml`'deki `optimizations.repo_map` açıksa: `"Dosya aramadan önce
    bağlam paketindeki [[repo-map]] bilgi düğümüne bak."` (kapalıysa bu satırı EKLEME —
    ablasyon karşılaştırması böyle çalışır).

## 3. Doğrulama döngüsü (yaz → kontrol et → düzelt)

Round sayacı `N = 1`'den başlar.

```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" checks -p <proje-kökü> --json
```
- Herhangi biri `ok:false` ise: bu Katman 1'in eksik listesi. Katman 2'ye GEÇME.
- Hepsi `ok` (ya da `checks` boşsa): Katman 2'ye geç:
  ```
  node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" check <id> -p <proje-kökü> --json
  ```
  `success:false` ise bunu da "eksik" say (ADR-008 — asla sessizce ok sayma). `results`
  içinde `durum: eksik` olanları topla.

Eksik sayısını kaydet:
```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" fix-loop record <id> --round N --issues <sayı> --json
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" fix-loop status <id> --json
```
- `shouldBreak: false` → coder'ı **SADECE eksik listesiyle** (tüm bağlamı tekrar vermeden)
  tekrar çağır, WIP commit yap (`git add -A && git commit -m "gp-wip(<id>): tur N"`),
  `N += 1`, 3. adıma dön.
- `shouldBreak: true, converged: true` → 4. adıma geç.
- `shouldBreak: true, converged: false` → 5. adıma geç (hata politikası).

## 4. Başarı — Handoff, bilgi güncelleme, commit

1. `gp validate --json` — bu düğümün Handoff'u boş/sınır aşıyorsa hata verir, düzelt:
   - **Faz 9.5:** "Handoff boş" hatası özel — agent işi bitirdi ama Handoff'u yazmadan
     durmuş olabilir (tüm bağlamı tekrar vermeye gerek yok). **Bir kez**, haiku ile, SADECE
     "## Handoff bölümünü doldur (oluşturulan/değişen dosyalar, public arayüz, kararlar,
     en fazla ~300 token)" talebiyle aynı agent'ı (`route.agent`) çağır — kod yazmasını
     isteme. Hâlâ boşsa (ikinci denemede de) normal hata politikasına (adım 5) geç, tekrar deneme.
2. Handoff'un "Bilgi düğümü güncellemeleri" bölümünü oku; ilgili knowledge dosyaları
   varsa **`docs`** agent'ını çağır (haiku) — Handoff'u ve hedef knowledge dosyalarını ver,
   `## Arayüz`/`## Kararlar`'ı güncellesin, `updated_by`'a bu task ID'sini eklesin.
3. WIP commit'leri tek commit'te birleştir: `git reset --soft <node başlamadan önceki commit>`
   sonra `git commit -m "gp(<id>): <summary>"`. `## Yarım iş` notu varsa sil.
4. `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" set <id> status=done --json`
5. `gp index --json`.
6. **Faz 7.2 — repo-map tazeleme:** `optimizations.repo_map` açıksa:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" epic-done <bu task'ın epicId'si> --json
   ```
   `done:true` ise (bu, epic'in SON task'ıydı) `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" repomap --json`
   çalıştır — kod gerçekten değişti, harita bayatlamasın. `done:false` ise atla (her task'ta
   yeniden üretmek gereksiz token/zaman — sadece epic bittiğinde).

## 5. Hata politikası (doğrulama döngüsü yakınsamadıysa)

```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" escalate <id> --json
```
- `escalated: true` → fix-loop round sayacını SIFIRLAMA (roadmap: "aynı modelle bir kez
  tekrar" zaten yukarıdaki round'larda oldu; escalate = model değişti, görev tazeden
  başlar) — `gp context <id>` çıktısını yeniden oku, 2. adıma dön, yeni modelle tekrar dene.
- `escalated: false` (listenin sonu) →
  ```
  node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" fail <id> --reason "<kısa sebep>" --json
  ```
  Çalışma dizinini temizle: `git restore .` (başarısız denemenin değişiklikleri atılır —
  SPEC/roadmap 6.6 kararı: park yerine geri alma, basitlik için).
  Kullanıcıya kısa rapor ver: hangi düğüm, kaç deneme, hangi hatalar. Döngüye dön
  (başka ready task varsa onlarla devam et — bu düğüm artık `failed`).

## 6. Git ve temiz ağaç
- Çalışma **başında** `git status --porcelain` ile ağacın temiz olduğunu doğrula;
  temiz değilse kullanıcıya sor (devam etmeden önce commit/stash önerisi).
- Her `done` = bir commit (format: `gp(<id>): <summary>`, summary task'ın frontmatter'ından).

## 7. Token optimizasyon hook'ları (Faz 7.2/7.3/7.7/7.9 — arka planda, sen bir şey yapmazsın)
Plugin hook'ları (`plugin/hooks/hooks.json`) her Bash/Read/Glob/Grep/Write çağrısında
otomatik çalışır: uzun Bash çıktısını kırpar (`log_trimming`), aynı dosya/komut 3+ kez
tekrar edilirse bir uyarı ekler (`turn_limits` — bunu görürsen yaklaşımını gözden
geçir), ve ölçüm için `.graph/_metrics/tool-use.jsonl`'e kayıt düşer. `.graph/` yoksa ya
da ilgili `optimizations.*` kapalıysa sessizce hiçbir şey yapmazlar.

## 8. Kullanım limiti / rate limit (Faz 9.2)
Mode A'da (bu skill'in çalıştığı ana thread) bir Agent tool çağrısı ya da kendi aracın
kullanım limiti/rate limit benzeri bir hatayla başarısız olursa: düğümü `failed` SAYMA
(geçici bir kesinti, task'ın hatası değil — ❗ bu senaryonun kesin hata metni/şekli bu
projede hiç gözlenmedi, DOĞRULANMADI). Düğüm zaten `status: running` (2. adımda
işaretlendi) — hiçbir şey değiştirme, kullanıcıya kısa bir not bırak ("<id>'den kullanım
limiti nedeniyle durduruldu, yeni bir oturumda `gp resume` ile devam edilebilir") ve dur.
Bu senaryo **Faz 9.1'in kaldığı-yerden-devam mekanizmasıyla zaten çözülüyor** — yeni bir
oturum `gp resume` + gerekirse `gp recover` ile düğümü ya kaldığı yerden devam ettirir
(agent `## Yarım iş` yazdıysa) ya da güvenle `pending`'e döndürür. Mod B'de (`gp run`)
aynı senaryo zaten mekanik: `config.yml`'deki `mode_b.rate_limit_retry` ile otomatik
bekle-ve-tekrar-dene uygulanır, tükenirse düğüm aynı şekilde `running` kalıp süreç durur.

## Bitirme
Tüm `ready` tükendi ve genişletilecek bir şey kalmadı → kullanıcıya özet: kaç task done,
kaç failed, toplam süre izlenimi. "MVP kapsamı: reviewer ve API testi yok (Faz 11)."
