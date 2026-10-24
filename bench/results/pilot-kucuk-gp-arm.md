<!-- Faz 8.4 pilot koşusu — gp ablation'ın aksine bu EL İLE kurulan, tek seferlik bir
     koşunun raporudur (henüz bench/run.ts yok). Her sayı gerçek: gerçek Agent tool
     çağrıları, gerçek `claude -p --json-schema` (Katman 2), gerçek `npm test`. -->

# Faz 8.4 — Pilot Benchmark: "kucuk" senaryo, GP kolu, 1 tekrar

**Tarih:** 2026-10-24 · **Senaryo:** `bench/scenarios/kucuk.md` (TODO REST API) · **Kol:** sadece GP
(ham/plugin'siz kol henüz koşulmadı — karşılaştırma eksik, bkz. "Eksikler")

## Kurulum

Ayrı, temiz bir git deposu: `gp-bench-pilot-kucuk/` (bu repo'nun dışında). `/gp:run`'ın
SKILL.md algoritması **adım adım, elle ama birebir gerçek** uygulandı: `gp route` →
`gp context` → Agent tool (coder/tester rolünde — plugin bu oturuma kurulu olmadığı için
`general-purpose` subagent_type, gerçek `coder.md`/`tester.md` DEĞİL) → `gp checks`
(Katman 1) → `gp check` (Katman 2, gerçek `claude -p --json-schema`) → commit → `gp set
status=done` → `gp index` → `gp repomap`. Graph elle kuruldu (gerçek `/gp:plan`/`/gp:expand`
KULLANILMADI — planner agent'ı hâlâ canlı test edilmedi).

## Sonuç

| | T01 — implement-api (coder) | T02 — api-tests (tester) |
|---|---|---|
| Model | sonnet | sonnet |
| Gerçek model turu | 18 | 15 |
| Çıktı token (gerçek) | ≈8,096 | ≈5,064 |
| Cache creation token | ≈100,799 | ≈42,046 |
| Cache read token | ≈741,473 | ≈648,238 |
| **Cache okuma oranı** | **%88.0** | **%93.9** |
| Agent'ın kendi raporu | 53,412 "subagent_tokens", 10 tool_use, 90.3s | 51,763 "subagent_tokens", 9 tool_use, 50.2s |
| Katman 1 (script) | atlandı (bkz. not ❗1) | ✓ `npm test`: 11/11 geçti |
| Katman 2 (haiku, `claude -p --json-schema`) | ✓ 5/5 kriter "ok" | ⚠ 2/3 "ok", 1 "eksik" (bkz. not ❗2) |
| Sonuç | ✓ done | ✓ done |

Kaynak: iki gerçek subagent transcript dosyası (`~/.claude/projects/.../subagents/
agent-<id>.jsonl`), `gp metrics ingest` ile okundu (ADR-013). Ham sayılar (girdi+cache
oluşturma+cache okuma+çıktı) ile agent'ın kendi "subagent_tokens" raporu **birebir
uyuşmuyor** — muhtemelen farklı şeyler ölçülüyor (maliyet-ağırlıklı vs ham token). Bu fark
DOĞRULANMADI; Faz 8.2 (maliyet hesabı) bu iki kaynağı uzlaştırmalı.

Epic sonunda `gp repomap` gerçekten çalıştı (2 dosya, `createServer`/5 CRUD fonksiyonu
bulundu), `gp validate` temiz (5 düğüm), tüm değişiklikler gerçek git commit'leri olarak
kaydedildi (`gp(E01-F01-T01): ...`, `gp(E01-F01-T02): ...`).

## Bulunan 2 gerçek bug (bu pilot sayesinde — hiçbir test fixture'ı yakalamamıştı)

1. **`graph/parser.ts`:** `gp context`'in ürettiği `.graph/_runtime/<id>.context.md`
   dosyaları graph düğümü gibi parse edilmeye çalışılıyor, geçerli bir `kind` frontmatter'ı
   olmadığı için `parseError` üretiyordu. Gerçek bir `/gp:run` döngüsünde `gp context` HER
   ZAMAN `gp validate`'ten önce çalışır (SKILL.md adım 2 → adım 4.1) — yani bu kombinasyon
   KAÇINILMAZDI ve her gerçek koşuyu kırardı. **Düzeltildi** (`_runtime/` artık taranmıyor)
   + regresyon testi (`parser.test.ts`).
2. **`epicStatus.ts` (Faz 7.2):** `computeEpicDone` feature düğümlerini de sayıyordu, ama
   hiçbir mekanizma bir feature'ı otomatik `status: done`'a çevirmiyor (sadece task'lar elle/
   orkestratör tarafından işaretlenir) — bu yüzden epic'in TÜM task'ları bitse de `done`
   hep `false` dönüyordu, repo-map hiç tazelenmiyordu. **Düzeltildi** (sadece task'lar
   sayılır — `indexGen.ts`'in `formatProgress`'uyla tutarlı hale getirildi) + regresyon testi.

## Bulunan 2 metodoloji boşluğu (kod bug'ı değil — Faz 9/11'e not edildi)

❗1. **Katman 1'in proje-geneli `checks.test` komutu, testler ayrı bir task'ta (T02)
   yazılacaksa ÖNCEKİ task'ta (T01) yanlışlıkla başarısız olur** ("No test files found") —
   bu coder'ın düzeltebileceği bir şey değil. Bu pilotta fix-loop'u bunun üzerinde bilerek
   döndürmedim (gerekçeli orkestratör kararı); gerçek çözüm (per-task check override, ya da
   Katman 1'i feature'ın SON task'ında çalıştırmak) henüz yazılmadı.

❗2. **Katman 2, Katman 1'in SONUCUNU görmüyor** — bir kabul kriteri Katman 1'in zaten
   kontrol ettiği şeyi tekrar ediyorsa (ör. "npm test yeşil"), Katman 2 SADECE diff'e bakıp
   bunu her zaman "eksik" işaretleyebilir (test çalıştırma kanıtı diff'te görünmez). Bu
   pilotta T02 için tam bu oldu — orkestratör (ben) bunu bilerek yanlış-negatif sayıp
   fix-loop'u döndürmedim (Katman 1 ZATEN `npm test`'i gerçekten çalıştırıp geçtiğini
   doğrulamıştı). Gerçek çözüm (Katman 1 sonucunu Katman 2'nin bağlamına da vermek) henüz
   yazılmadı.

## Eksikler (bu bir pilot, tam Faz 8.4 değil)

- **Ham (plugin'siz) kol hiç koşulmadı** — token/maliyet karşılaştırması henüz yok, sadece
  GP kolunun ham sayıları var.
- Tek tekrar (1×) — varyans/istatistik güveni yok.
- Gerçek `/gp:plan`/`/gp:expand` (planner agent) kullanılmadı, graph elle kuruldu.
- `bench/run.ts` (otomatik koşturucu) henüz yok — bu koşu tamamen elle yapıldı.
- Maliyet (USD) hesabı yok (Faz 8.2 henüz başlamadı).

Ayrıntı ve ADR'ler: [`docs/decisions.md`](../../docs/decisions.md) ADR-012/ADR-013,
[`docs/SPEC.md`](../../docs/SPEC.md) §13.
