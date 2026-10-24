# GraphPilot

[🇬🇧 English](README.md) · 🇹🇷 **Türkçe**

**[Claude Code](https://code.claude.com) için token-optimize bir orkestrasyon plugin'i.**
GraphPilot bir görevi linkli Markdown düğümlerinden oluşan bir graph'a böler, her düğümü
routing flag'leriyle etiketler, doğru modele/agent'a yönlendirir ve tüm graph'ı arka
planda adım adım yürütür — aynı işi elle yaptırmaya göre **ölçülebilir şekilde daha az
token** harcayarak.

```
/gp:plan   → brief + epic'ler
/gp:expand → bir epic'i ihtiyaç anında feature/task'lara böl, flag'le
/gp:run    → graph'ı yürüt: yönlendir → bağlamı izole et → yaz → kontrol et → düzelt → commit'le
```

## Neden

Uzun süren kodlama ajanları aynı dosyaları tekrar tekrar okur, her turda aynı bağlamı
yeniden anlatır ve kimsenin tam ihtiyaç duymadığı çıktılara token harcar. GraphPilot'un
cevabı prompt mühendisliği değil, **yapısal**: durumun tek kaynağı **graph**'tır, ve
yargı gerektirmeyen her şeyi (parse, doğrulama, indeksleme, yönlendirme, bağlam
toplama, kontrol) bir LLM değil, deterministik bir CLI (`gp`) yapar.

- **Graph, sohbet geçmişi değil.** İlerleme, kararlar ve arayüzler `.graph/` altındaki
  linkli Markdown dosyalarında yaşar — sonradan kimsenin denetleyemeyeceği bir
  konuşmada değil.
- **Sadece bilmesi gereken kadar bağlam.** Bir görev düğümü projenin brief'ini,
  doğrudan bağımlılıklarının handoff'unu ve açıkça okuduğu bilgiyi görür — asla tüm
  repo'yu, asla geçişli bağımlılıkları değil.
- **Varsayılanlar akıllı, ayarlar açık.** Kutudan çıktığı gibi çalışır; her
  optimizasyon `config.yml`'de ayarlanabilir/kapatılabilir bir bayraktır.
- **Her iddia ölçülür.** Her token-tasarruf tekniği ayrı ayrı açılıp kapatılabilir ki
  gerçek etkisi varsayılmak yerine ölçülebilsin (bkz. `bench/`).

## Nasıl çalışır

| Kavram | Açıklama |
|---|---|
| **Graph** | `.graph/` altındaki linkli Markdown dosyaları — tek kaynak |
| **L0 Brief** | Proje anayasası: stack, konvansiyonlar, klasör yapısı — her agent okur (ve cache'lenir) |
| **L1 Epic** | Baştan oluşturulan büyük iş parçaları |
| **L2 Feature / L3 Task** | İhtiyaç anında (just-in-time) açılan düğümler |
| **Görev düğümü** | Ne yapılacak: flag'ler, `depends_on`, durum, handoff |
| **Bilgi düğümü** | Ne var: arayüzler, modül özetleri, kararlar |
| **Handoff** | Görev bitince yazılan kısa (~300 token) özet — alt düğümler kodu değil BUNU okur |
| **INDEX** | Üretilen "hangi md'de ne var" tablosu, kök + epic başına |
| **Flag'ler** | `complexity`, `type`, `risk`, `context_size` → model ve agent seçimini belirler |

Yürütme döngüsü (`/gp:run`) sıkı bir çevrim izler: hazır task'ları bul → model/agent'a
yönlendir → izole bir bağlam paketi kur → delege et → doğrula (önce ucuz script
kontrolleri, sonra kabul kriterleri için ucuz bir model) → başarısızlıkta düzelt →
commit'le → indeksi güncelle — graph bitene kadar tekrarla.

## Durum

GraphPilot, **11 fazlık yol haritasının 7. fazına kadar** uygulandı: graph şeması,
tamamen test edilmiş bir `gp` CLI'ı, plugin iskeleti, intake/planlama, tembel
genişletme, yürütme motoru (yaz → kontrol et → düzelt → commit, başarısızlıkta
yükseltme ile) ve ayrı ayrı açılıp kapatılabilir bir token-optimizasyon katmanı.
266 test geçiyor; CLI tip kontrolünden ve lint'ten temiz çıkıyor.

Bu proje, **gerçekten doğrulanmış olanla varsayılanı** ayırmak konusunda alışılmadık
bir titizlikle inşa edildi: her mimari karar [`docs/decisions.md`](docs/decisions.md)'de
tarihli bir ADR olarak kanıtıyla birlikte kayıtlı; Claude Code'un kendi davranışına dair
bu oturumda doğrulanamayan her iddia, ileri sürülmek yerine `DOĞRULANMADI` diye
işaretlendi. Faz 8–11 (ham Claude Code'a karşı benchmark, kesinti sonrası
dayanıklılık, paketleme/yayın, ucuz bir reviewer + API-test katmanı) henüz
başlanmadı.

## Kurulum

GraphPilot bir Claude Code plugin'i olarak dağıtılır. Claude Code içinden:

```
/plugin marketplace add <bu-repo-url'si>
/plugin install gp
```

Sonra, projenizin içinde:

```
/gp:init    # .graph/ iskeletini kurar (brief.md + config.yml)
/gp:plan    # bir ürün brief'ini brief.md + epic'lere dönüştürür
/gp:expand  # bir epic'i ihtiyaç anında flag'lenmiş feature/task'lara açar
/gp:run     # graph'ı uçtan uca yürütür
```

## Depo yapısı

```
cli/      `gp` CLI'ının TypeScript kaynağı (parse, validate, route, context, checks, hooks, ...)
plugin/   Kurulabilir Claude Code plugin'i (agent'lar, skill'ler, hook'lar)
docs/     Spesifikasyon (SPEC.md) ve mimari kararlar (decisions.md)
bench/    Benchmark senaryoları ve sonuçları (Faz 7'nin ablasyon tablosu dahil)
```

## Geliştirme

```bash
cd cli
nvm use          # Node >=22 gerekli
npm install
npm test          # Vitest — 266 test
npm run lint
npm run build      # dist/ üretir, scripts/sync-cli-to-plugin.sh ile plugin/lib/'e senkronlanır
```

Her export edilen fonksiyonun bir Vitest testi var; CLI'da hiçbir yer bir LLM
çağırmaz — bu, agent'ların ve orkestratör skill'inin çağırdığı deterministik bir
katmandır.

## Katkıda bulunma

Issue ve PR'lar memnuniyetle karşılanır. Yeni bir optimizasyon tekniği öneriyorsanız,
mevcut kodun koyduğu çıta: `config.yml`'in `optimizations:` bölümünden ayrı ayrı
açılıp kapatılabilmeli ve etkisi varsayılmak yerine ölçülebilmeli.

## Lisans

[MIT](LICENSE)
