---
description: >-
  Graph'ı arka planda, adım adım, doğru model ve izole bağlamla yürütür. `team.enabled`
  varsayılan AÇIK olduğu için görevler otomatik olarak junior/senior/tester/docs
  rollerine gider (Faz 13) — `config.yml`'de `team.enabled: false` ile kapatılabilir.
  Kullanıcı "/gp:run" yazdığında çalışır.
argument-hint: "[--epic <id>] [--max-nodes N] [--dry-run] [--force]"
---

# /gp:run

> ANA THREAD'de çalışır. **Kendin kod yazmazsın, graph dosyalarını açmazsın** — yalnız
> `gp` çağırır ve subagent başlatırsın. Bu skill **bir kez** çağrılır ve iş bitene ya da
> bir karar/engel çıkana kadar döngüde kalır; kendini ya da `/gp:expand`'i yeniden çağırma
> (her çağrı bu metni bağlama tekrar ekler — Faz 14 O15). Nadir yollar (iskelet, batch,
> kesinti sonrası devam, kullanım limiti) için `${CLAUDE_PLUGIN_ROOT}/skills/run/reference.md`'yi
> **yalnız gerektiğinde** oku.

`gp` = `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js"` · `<kök>` = proje kökü. Her komuta `--json` ekle.
Her `gp` komutu `-p <kök>` alır; proje kökünde çalışıyorsan vermen gerekmez.

## 0. Başlangıç (bir kez)
- Parametreler: `--epic <id>` (yalnız o epic'in task'ları), `--max-nodes N`, `--dry-run`
  (agent çağırma, yalnız sıradaki task'ları ve modelleri göster).
- `gp resume` → `running kalmış düğümler` doluysa `reference.md` §Devam'ı uygula.
- `gp config --key efficiency` ve `gp config --key parallelism` — bu oturum boyunca kullan.
- **Git (B11):** `git rev-parse --is-inside-work-tree`. Repo değilse AskUserQuestion ile
  **bir kez** sor: "`git init` + ilk commit (önerilen — geri alma ve Katman 2 çalışır)" /
  "Git'siz devam (geri alma yok; doğrulama `verify:` komutlarıyla)". Repo ise ağaç temiz
  değilse commit/stash öner. Git'siz modda aşağıdaki tüm `git` adımlarını atla.

## 1W. Worker modu (`efficiency.worker_mode: true`, varsayılan — Faz 15)
Görevleri sen dağıtmazsın; worker'lar kendileri çeker. Döngü:
1. `gp workers` → `finished: true` ise §Bitirme. `expand` doluysa ve `launch` boşsa
   §Genişletme. `launch`'taki her `{agent, model}` için bir worker'ı **aynı mesajda**
   Agent çağrısı olarak başlat (`subagent_type: <agent>`, `model: <model>`, prompt aşağıda).
   `expand` doluysa planner'ı da aynı mesajda başlat. Sonra bekle — yoklama yapma.
2. Bir worker döndüğünde: `failed:`/`bulgu:` satırlarını bitirme özeti için not al,
   `gp workers` ile 1'e dön (çalışan worker varsa ve `launch` boşsa yalnız bekle).

Worker prompt'u:
```
WORKER modu. Rolün: <agent>/<model>. gp = node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" (her komuta --json)
En fazla <efficiency.worker_max_tasks> görev yap, sonra dur:
1. gp claim --agent <agent> --model <model> -p <kök>. "claimed": null ise dur.
2. Dönen tasks[].contextPath dosyalarını Read ile oku; görev(ler)i sırayla uygula,
   her biri için kendi düğüm dosyasındaki ## Handoff'u doldur (≤250 token).
3. gp complete <tüm claim edilen id'ler> -p <kök>.
   "fix" doluysa YALNIZ o eksikleri düzelt ve 3'ü tekrarla. "errors" doluysa (ör. Handoff yok)
   düzelt ve 3'ü tekrarla. "requeued"/"failed" görevleri bırak.
4. 1'e dön.
Dönüşün YALNIZ: "done: <id,…>" ve varsa "failed: <id> <neden>", "bulgu: <tek satır>".
```

## 1. Döngü (`efficiency.worker_mode: false` — eski davranış)
`gp next` →
- `cycles` doluysa: döngüyü göster, dur.
- `ready` boşsa: `gp expand-candidates`. Aday varsa §Genişletme; yoksa §Bitirme.
- `ready` varsa: `groups`'tan en fazla `parallelism` kadar task seç. Her biri için
  `efficiency.feature_agent` açıksa `gp start <id> --chain -p <kök>`, değilse
  `gp start <id> -p <kök>`. Seçilenlerin **hepsini aynı mesajda** Agent çağrısı olarak
  başlat (paralel). `expand-candidates`'ta aday varsa planner'ı da **aynı mesajda**
  başlat (önden genişletme, O12). Sonra bekle: bitince bildirim gelir — yoklama/ara tur yapma.
  `batches` doluysa o görevler için `reference.md` §Küçük düğüm birleştirme.

## 2. Agent çağrısı
`gp start` çıktısı: `tasks[]` (her biri `contextPath`, `agent`, `model`, `max_turns`,
`type`) ve `group` (zincirde ortak `agent`/`model`/`max_turns`), `git.base`.
`type: scaffold` olan task varsa önce `reference.md` §İskelet.
- `subagent_type`: tek task → `tasks[0].agent`; zincir → `group.agent`. `model`: aynı kaynaktan.
- `prompt` (**dosya içeriğini yapıştırma, yolunu ver** — O6):
  ```
  Görev(ler): <id> [, <id> … — sırayla, her biri bir öncekinin üzerine]
  Bağlam paketi: <contextPath> [, …] — önce Read ile oku.
  En fazla <max_turns> turda bitir; bitiremezsen ## Yarım iş yaz.
  [repo_map açıksa] Dosya aramadan önce paketteki [[repo-map]]'e bak.
  Her görev için kendi düğüm dosyasındaki ## Handoff'u doldur (≤250 token).
  Dönüşün YALNIZ şu olsun: "done" ya da "blocked: <neden>", varsa "bulgu: <tek satır>".
  Handoff'u ya da yaptığın işi rapora tekrar yazma.
  ```

## 3. Doğrulama ve bitiş (tek komut — Faz 15)
`gp complete <id…> -p <kök>` (tur no otomatik; geçen görev done + roll-up + indeks + commit):
- `fix` doluysa → aynı agent'ı **yalnız bu `issues` listesiyle** tekrar çağır, sonra tekrar `gp complete`.
- `errors` (ör. Handoff yok) → aynı agent'a **bir kez** yalnız o hatayı ver, tekrar `gp complete`.
- `requeued` → görev üst model/role yükseltildi ve kuyrukta; döngü onu yeniden başlatır.
- `failed` → git varsa `git restore -- <görevin touches>` (git'siz modda değişiklik kalır —
  kullanıcıya söyle); bitirme özetinde listele.
- `done[].unverified: true` olanları bitirme özetinde "doğrulanmadı" diye listele.
- Agent "bulgu" bildirdiyse bitirme özetinde göster (ekip modunda `/gp:team` §6).
- Bilgi düğümünü agent kendisi günceller (O10). Handoff birden çok bilgi düğümünün
  değişmesi gerektiğini söylüyor ama agent güncellemediyse `docs` agent'ını (haiku) çağır.

## Genişletme (planner'ı doğrudan çağır — `/gp:expand`'i invoke etme)
Aday `epic` → `MOD: GENİŞLETME-FEATURE`, `feature` → `MOD: GENİŞLETME-TASK`.
`subagent_type: planner`, `model: efficiency.expansion_model` (O14). Prompt: mod satırı +
hedef ID + `efficiency` değerleri + "girdileri (brief, hedef düğüm, ilgili bilgi düğümleri)
`.graph/`'tan kendin oku". Planner `gp apply` ile yazar ve kısa JSON döner; `gp validate`
`error` verirse planner'ı hatalarla bir kez daha çağır. Sonra döngüye dön.

## Bitirme
`gp status` → kısa özet: done/failed sayısı, `unverified` görevler, bildirilen bulgular.
