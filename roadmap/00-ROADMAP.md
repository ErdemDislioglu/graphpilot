# GraphPilot — Yol Haritası (Ana Dosya)

> Çalışma adı: **GraphPilot**. Claude Code için token-optimize bir orkestrasyon plugin'i.
> Görevi linkli markdown düğümlerinden oluşan bir graph'a böler, düğümleri flag'ler,
> flag'lere göre doğru modele/agent'a yönlendirir ve arka planda adım adım yürütür.

## Ürün özeti

- **Hedef kullanıcı:** Teknik kullanıcılar (geliştiriciler). Her türlü projeyi isteyebilir.
- **Değer önerisi:** Ham Claude Code'a göre **ölçülebilir şekilde daha az token**, daha düzenli ilerleme.
- **Çalışma şekli:** Kullanıcının kendi Claude Code kurulumu içinde, kendi aboneliğiyle çalışan plugin.
  Ayrı login yok, gri alan yok.
- **Varsayılanlar akıllı, ayarlar açık:** Kullanıcı hiçbir şey ayarlamasa da sistem optimize çalışır;
  isteyen routing tablosunu, bütçeleri vb. değiştirebilir.

## Temel kavramlar

| Kavram | Açıklama |
|---|---|
| **Graph** | `.graph/` klasöründe linkli md dosyaları. Tek kaynak (single source of truth). |
| **L0 Brief** | Proje anayasası: stack, konvansiyonlar, klasör yapısı. Her agent okur, cache'lenir. |
| **L1 Epic** | Baştan oluşturulan büyük parçalar. |
| **L2 Feature / L3 Task** | İhtiyaç anında (just-in-time) açılan düğümler. |
| **Görev düğümü** | Ne yapılacak: flag'ler, `depends_on`, durum, handoff. |
| **Bilgi düğümü** | Ne var: arayüzler, modül özetleri, kararlar. |
| **Handoff** | Görev bitince yazılan kısa özet (~300 token). Alt düğümler kodu değil bunu okur. |
| **INDEX** | Script ile üretilen "hangi md'de ne var" tablosu. Kök + epic başına parçalı. |
| **Flag** | `complexity`, `type`, `risk`, `context_size` → model ve agent seçimini belirler. |

## Teknoloji

- **Plugin:** Claude Code plugin — **agent'lar + skill'ler** + hook'lar.
  Komutlar `commands/` değil `skills/` olarak yazılır ([ADR-007](../docs/decisions.md#adr-007)).
  Doğrulanan sürüm: Claude Code 2.1.309.
- **Yardımcı araçlar:** TypeScript (Node), tek bir CLI: `gp`
- **Format:** Düz markdown + YAML frontmatter + `[[wikilink]]` (Obsidian uyumlu, bağımlı değil)
- **Test:** Vitest
- **Java yok.**

## Durum

| Faz | Durum | Not |
|---|---|---|
| 0 | 🟢 **Bitti** (0.6 hariç) | `docs/research.md`, `docs/decisions.md` (8 ADR). 0.6 baseline → Faz 8.4 |
| 1 | 🟢 **Bitti** (Obsidian kontrolü hariç, opsiyonel) | `docs/SPEC.md`, `cli/src/schema/*.ts`, örnek bookstore graph'ı — 17 test ile gerçekten doğrulandı |
| 2 | 🟢 **Bitti** | Çalışan `gp` CLI'ı — parser, validate, index, next, status, set, route, context, repomap, new, resume, init, doctor. 129 test, >%80 kapsam (parser/validate/next/route/context), gerçek örnekte uçtan uca çalıştırıldı |
| 3 | 🟢 **Bitti** (canlı model-override testi hariç, kullanıcı kendi oturumunda doğrulamalı) | `plugin/` kuruldu ve **gerçekten kurulup** `claude plugin list`'te `enabled` görüldü. 5 agent, 3 gerçek + 4 placeholder skill |
| 4 | 🟢 **Bitti** (canlı `/gp:plan` testi hariç, kullanıcı kendi oturumunda doğrulamalı) | İki-modlu `planner` + tam `/gp:plan` akışı yazıldı, mekanizma gerçek `gp` komutlarıyla elle simüle edildi. `gp brief`, `gp new --depends-on` eklendi (135 test) |
| 5 | 🟢 **Bitti** (canlı kalibrasyon hariç, kullanıcı kendi oturumunda doğrulamalı) | Dört-modlu `planner` + `/gp:expand`. `gp validate --fix-flags`, `--reads`/`--touches`, `confirm_expand` eklendi. Tüm genişletme zinciri gerçek `gp` ile simüle edildi (149 test) |
| 6 | 🟢 **Bitti** (canlı demo hariç, kullanıcı kendi oturumunda doğrulamalı) — **MVP noktası** | `/gp:run` orkestratörü, doğrulama döngüsü (Katman1/2), hata politikası (escalate/fail), Mod B temel sürümü. ADR-010 bulundu (max_turns çağrı anında yok). Tüm deterministik iskelet gerçek git deposunda `gp` ile kanıtlandı (212 test) |
| 7 | 🟢 **Bitti** (cache-isabet oranı Faz 8.1'e kaldı) | 7 token-optimizasyon tekniği (`optimizations.*`), hepsi gerçek kodla ve gerçek Vitest testleriyle kurulu: cache dostu sıra (zaten vardı), repo-map tazeleme (`gp epic-done`), log kırpma hook'u (ADR-005, `gp hook trim-bash`), araç kısıtlama (zaten vardı), küçük düğüm birleştirme (`batching.ts`), deterministik iskelet (`gp scaffold`), tur/döngü tespiti hook'u (`gp hook track-tool-use`, ADR-011). `bench/results/ablation.md` gerçek bookstore örneğiyle üretildi. 266 test |
| 8–11 | ⬜ Başlanmadı | — |

**Faz 0'ın mimariyi değiştiren bulguları:** model çağrı anında override edilebiliyor
(agent varyantı gerekmiyor) · `omitClaudeMd: true` ile bağlam izolasyonu tam · hook'larda token
bilgisi yok (ölçüm transcript JSONL'den) · tool çıktısı hook ile kırpılabiliyor · `--bare`
abonelikle çalışmıyor · komutlar skill olarak yazılıyor · `gp` CLI plugin `bin/`'den sunuluyor.
Ayrıntı: [docs/decisions.md](../docs/decisions.md).

## Fazlar

| # | Dosya | Faz | Çıktı |
|---|---|---|---|
| 0 | `faz-00-arastirma-ve-dogrulama.md` | Araştırma & doğrulama | Kısıtlar netleşmiş, baseline ölçülmüş |
| 1 | `faz-01-graph-semasi.md` | Graph şeması & spesifikasyon | `SPEC.md` + şema dosyaları |
| 2 | `faz-02-graph-cli.md` | Graph CLI (TypeScript) | `gp` CLI: parse, validate, index, sort |
| 3 | `faz-03-plugin-iskeleti.md` | Plugin iskeleti | Kurulabilir boş plugin |
| 4 | `faz-04-intake-ve-planlama.md` | Intake & planlama | `/gp:plan` → brief + epic'ler |
| 5 | `faz-05-genisletme-ve-flagleme.md` | Tembel genişletme & flag'leme | `/gp:expand`, routing tablosu |
| 6 | `faz-06-yurutme-motoru.md` | Yürütme motoru | `/gp:run` uçtan uca çalışır |
| 7 | `faz-07-token-optimizasyonu.md` | Token optimizasyon katmanı | Ölçülmüş tasarruf teknikleri |
| 8 | `faz-08-olcum-ve-benchmark.md` | Ölçüm & benchmark | Ham Claude Code'a karşı rapor |
| 9 | `faz-09-dayaniklilik-ve-kalite.md` | Dayanıklılık & kalite | Kesinti sonrası devam, testler |
| 10 | `faz-10-paketleme-ve-yayin.md` | Paketleme & yayın | Marketplace, dokümantasyon, demo |
| 11 | `faz-11-optimize-review-ve-api-testi.md` | Optimize review & API testi | Ucuz review, LLM'siz API test akışı, yeniden benchmark |

**Kritik yol:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 8. Faz 7 ve 9, 6'dan sonra paralel ilerleyebilir.
**İlk demo (MVP) noktası:** Faz 6 bitince. **Kanıt noktası:** Faz 8 bitince.

### MVP kapsamı
- **Dahil:** graph, flag routing, bağlam izolasyonu, **yaz → kontrol et → düzelt döngüsü** (script + Haiku kabul kontrolü),
  **kesinti sonrası ucuz devam** (yarım iş notu + WIP commit + `gp resume`).
- **Hariç (Faz 11):** reviewer agent ve API testleri. Önce uygulama bunlarsız test edilir ve benchmark alınır;
  sonra bu ikisi eklenip benchmark yeniden koşturulur.

## Bu plan Claude ile nasıl yürütülür?

1. Repo kökünde `CLAUDE.md` oluştur (aşağıdaki şablon).
2. Her oturumda **tek bir faz dosyası** ve içinden **tek bir görev** (`- [ ] X.Y`) ver.
3. Görev bitince Claude checkbox'ı `- [x]` yapsın ve faz dosyasının sonundaki **Faz Günlüğü**'ne bir satır eklesin.
4. Faz bitince **Kabul kriterleri**'ni Claude'a tek tek kontrol ettir, sonra sonraki faza geç.
5. Büyük görevlerde önce plan modunda plan iste, onayla, sonra uygulat.

Örnek oturum açılışı:

```
faz-02-graph-cli.md dosyasını oku. Sadece 2.3 görevini yap.
Bitince testleri çalıştır, checkbox'ı işaretle ve Faz Günlüğü'ne bir satır ekle.
Başka göreve geçme.
```

### `CLAUDE.md` şablonu (repo kökü)

> Bu şablon `CLAUDE.md` olarak repo köküne yazıldı (2026-10-23). Klasörler kuruldu:
> `roadmap/` (bu dosyalar), `cli/`, `plugin/`, `docs/`, `bench/`.

```markdown
# GraphPilot — Geliştirme Kuralları

## Proje
Claude Code plugin'i + TypeScript CLI (`gp`). Spesifikasyon: docs/SPEC.md. Yol haritası: roadmap/.

## Kurallar
- Tek oturumda tek görev. Kapsam dışına çıkma; fark ettiğin ek işleri "Açık Sorular"a yaz.
- TypeScript strict mode. Her yeni fonksiyon için Vitest testi.
- Dosyayı baştan yazma, düzenle (edit).
- Bağımlılık eklemeden önce sor.
- Commit mesajı: `faz-XX(Y.Z): kısa açıklama`.

## Komutlar
- Test: `npm test`
- Lint: `npm run lint`
- CLI'ı yerelde çalıştır: `npm run gp -- <komut>`

## Klasörler
- `cli/` TypeScript CLI kaynak kodu
- `plugin/` Claude Code plugin dosyaları (agents, commands, skills, hooks)
- `docs/` SPEC ve kararlar
- `bench/` benchmark senaryoları ve sonuçları
- `roadmap/` bu yol haritası
```

## Genel ilkeler

- **Deterministik olan LLM'e gitmez.** Sıralama, indeks, doğrulama, durum güncelleme script ile yapılır.
- **Bilmesi gereken kadar bağlam.** Agent sadece kendi düğümünü, doğrudan bağımlılıklarının handoff'larını ve brief'i görür.
- **Her iddia ölçülür.** Her optimizasyon tekniği benchmark'ta açılıp kapatılarak test edilir.
- **Graph tek kaynaktır.** Durum, karar ve ilerleme graph'ta yaşar; sohbet geçmişinde değil.
- **Eski oturum sürdürülmez.** Devam her zaman yeni temiz oturum + graph ile yapılır; böylece yarım kalan iş ertesi gün ucuza devam eder.
- **Model düşünür, script çalışır.** Test çalıştırma, kontrol, kırpma script'te; model sadece sonucu yorumlar.
