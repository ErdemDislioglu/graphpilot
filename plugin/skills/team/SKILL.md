---
description: >-
  Ekip modu — görevleri tag'e göre doğru role (junior/senior/tester/docs) dağıtır,
  rutin kararları kendisi verir, kalanı için AskUserQuestion ile sorar (Faz 13).
  Kullanıcı "/gp:team" yazdığında çalışır. `config.yml`'de `team.enabled: true` gerekir.
argument-hint: "[--epic <id>] [--max-nodes N]"
---

# /gp:team

> Bu skill ANA THREAD'de çalışır — sen **yöneticisin** (roadmap 13.1: yönetici bir
> subagent DEĞİLDİR, subagent'lar başka subagent başlatamaz). Kendin kod yazmazsın;
> sadece `gp` çağırır, `coder` (Junior)/`senior`/`tester`/`docs` subagent'larını
> başlatırsın. **Yönetici iş yapmaz, yönetir** (13 "Temel ilkeler" #1).
>
> **Rutin akışta sen (LLM) hiç devreye girmezsin** (13.12) — atama, model seçimi,
> sıradaki görev `gp` ile deterministik belirlenir. Sadece bir bulgu/hata/çelişki
> geldiğinde (aşağıdaki 4-6. adımlar) kendi yargını kullanırsın.

Bu skill `/gp:run`'ın (Faz 6) ÜZERİNE kuruludur — 0.5/1/3/6/7/8. adımlar `/gp:run` ile
AYNI (oraya bak, burada tekrar edilmiyor): kaldığı yerden devam, döngü/expand mantığı,
doğrulama döngüsü (yaz→kontrol et→düzelt), git/temiz ağaç, token-optimizasyon hook'ları,
kullanım limiti. Farklı olan SADECE 2. adım (atama) ve 4-6. adımlar (hata/bulgu/karar).

## 0. Parametreler
`--epic <id>`, `--max-nodes N` — `/gp:run`'daki gibi.

## 2. Her task için — atama (13.3, `/gp:run`'ın "route" adımının yerine)

```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" team assign <id> --json     # { role, model, agent }
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" context <id> --json
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" set <id> status=running
```
`role: junior` → `agent: coder`; `senior` → `agent: senior`; `tester`/`docs` aynı isimli
agent. Agent tool çağrısı `/gp:run`'ın 2. adımıyla AYNI (`subagent_type: agent`,
`model: model`, context dosyasının içeriği + tur bütçesi notu).

## 3. Doğrulama döngüsü
`/gp:run`'ın 3. adımıyla AYNI — doğrulama döngüsü ROLDEN bağımsız çalışır.

## 4. Başarı
`/gp:run`'ın 4. adımıyla AYNI (Handoff, bilgi güncelleme, commit, repo-map tazeleme).

## 5. Başarısızlık — ekip zinciri (13.5, `/gp:run`'ın "Hata politikası"nın yerine)

```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" team escalate <id> --json
```
- `escalated: true` → `toRole`/`toModel` ile `gp context <id>`'yi YENİDEN oku, 2. adıma
  dön (atama tekrar `gp team assign` ile — artık yeni rolü/modeli dönecek). `toRole`
  junior→senior'a geçtiyse: Handoff'a (ya da agent'a verilecek talimata) junior'ın
  denemesinin KISA ÖZETİNİ ekle (ne denendi, hangi hata — `## Hata geçmişi`'nin son
  satırı yeterli, TÜM denemeyi tekrar verme — 13.5).
- `escalated: false` (zincirin sonu, senior da başarısız oldu) →
  `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" fail <id> --reason "<kısa sebep>" --json`,
  `git restore .`, döngüye dön. Bu, roadmap 13.8'in "Senior da çözemedi → kullanıcıya
  sorar" satırının BAŞLANGICI — bir sonraki iterasyonda bu düğüm artık `ready` değil,
  `failed`; döngü onu `needs_decision`/onay akışına (Faz 12.6, `gp status`'ta görünür)
  bırakır. Kullanıcıya AskUserQuestion ile sor: "`<id>` senior'da da başarısız oldu
  (<kısa sebep>). Tekrar dene / Atla / Durdur?" — cevaba göre `gp set <id> status=pending`
  (tekrar dene), `status=skipped` (atla) ya da döngüyü durdur.

## 6. Bulgu bildirme ve yönetici kararı (13.7/13.8/13.9)

Agent'ın Handoff'unda (ya da son mesajında) bir **bulgu** fark edersen — agent'lar
kendi talimatlarında (`coder.md`/`senior.md`/`tester.md`) "kapsam dışı bir ihtiyaç
görürsen Handoff'ta not et" diyor; sen (yönetici) bu notu okuyup gerekiyorsa resmi bir
bulguya çevirirsin:

```json
{
  "kind": "security | ambiguity | plan_conflict | out_of_scope | tech_debt",
  "severity": "blocking | non_blocking",
  "summary": "...",
  "options": ["...", "...", "..."],
  "recommended": 0
}
```
**Eşik (13.7):** bloklayan SADECE güvenlik, veri kaybı, brief/kapsam çelişkisi, mimari
değişiklik; gerisi bloklamayan.

```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" team finding <id> --finding '<json>' --json
```
Dönen `outcome`'a göre:
- `proceeded_with_recommended` / `self_resolved` → BİTTİ, hiçbir şey sorma, döngüye dön
  (13.12: rutin/kendi-karar-verilebilir durumlarda kullanıcı rahatsız edilmez).
- `needs_senior_consultation` → `senior`'ı Agent tool ile çağır, SADECE kısa bir mimari
  ÖNERİ iste (kod yazdırma — 13.8: "senior'a kod yazdırılmaz, sadece kısa öneri
  istenir"). Senior'ın cevabı NET bir öneriyse:
  ```
  node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" team finding-answer <id> --finding '<json>' --answer <senior'ın önerdiği seçeneğin indeksi> --decided-by "manager+senior" --json
  ```
  Senior emin değilse, aşağıdaki `needs_user_decision` akışına geç.
- `needs_user_decision` → `message` alanını AYNEN AskUserQuestion'a geçir (`options`
  butonlardır, "Durdur" seçeneğini SEN ekle — CLI'nın döndürdüğü `options` dizisinde
  yoktur). Kullanıcının seçtiği indeksle (ya da "Durdur" seçildiyse `stop`):
  ```
  node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" team finding-answer <id> --finding '<json>' --answer <indeks|stop> --decided-by "user (ekran)" --json
  ```

Her iki komut da kararı otomatik olarak `_metrics/decisions.jsonl`'e VE epic'in karar
günlüğüne (`knowledge/<epic>-decisions.md`) yazar — sen elle bir şey kaydetmezsin.

**Geri çevirme (13.11):** kullanıcı "bu kararı geri çevir" derse:
```
node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" team decisions override <karar-id> --json
```
Bu kararı işaretler VE aynı feature'a bir düzeltme görevi açar — `gp next`'in bir
sonraki turunda bu görev normal akışa (2. adım) girer.

## Bitirme
`/gp:run`'ın "Bitirme"siyle AYNI. Ek olarak: `gp team stats --json` ile ekip
ölçümlerini (yanlış tag oranı, karar/geri çevirme sayısı) kullanıcıya özetle.

## Otopilot (Mod B, Faz 12) ile ilişki

Bu skill SADECE Mod A (oturum içi) içindir. Headless/otopilot modda (`gp autopilot start`)
ekip ataması/escalation `autopilotLoop.ts`'e `config.team.enabled` üzerinden ZATEN
entegre (Faz 13, bu fazın kendi işi) — ama bulgu bildirme/yönetici karar politikasının
(bu skill'in 6. adımı) otopilot tarafı **henüz yok**: Mod B şu an bir bulgu/needs_decision
durumuna geldiğinde Faz 12.6'nın genel onay akışıyla (sabit [Tekrar dene][Üst modelle
dene][Atla][Durdur] butonları) devam ediyor, bu skill'in finding-bazlı esnek
seçenekleriyle DEĞİL. Bu, 13.9'un "`/questions`" komutu ve 4 saatlik hatırlatma gibi
otopilot-tarafı ayrıntılarla birlikte bilinen, belgelenmiş bir kapsam sınırı.
