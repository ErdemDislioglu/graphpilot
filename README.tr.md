# GraphPilot

[🇬🇧 English](README.md) · 🇹🇷 **Türkçe**

**[Claude Code](https://code.claude.com) için token-optimize bir orkestrasyon plugin'i.**
GraphPilot bir görevi linkli Markdown düğümlerinden oluşan bir graph'a böler, her düğümü
routing flag'leriyle etiketler, doğru modele/agent'a yönlendirir ve tüm graph'ı arka
planda adım adım yürütür — aynı işi elle yaptırmaya göre **ölçülebilir şekilde daha az
token** harcayarak.

```
/gp:plan     → brief + epic'ler
/gp:expand   → bir epic'i ihtiyaç anında feature/task'lara böl, flag'le
/gp:run      → graph'ı yürüt (yönetici + junior/senior/tester/docs rolleri, varsayılan açık)
gp autopilot → insansız çalıştır, Telegram bildirim/onayıyla (opsiyonel)
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

GraphPilot'un çekirdeği (graph şeması, tamamen test edilmiş bir `gp` CLI'ı, plugin
iskeleti, intake/planlama, tembel genişletme, yürütme motoru, ayrı ayrı açılıp
kapatılabilir token-optimizasyon teknikleri ve kesinti sonrası devam dayanıklılığı)
bitti — buna ek olarak, yol haritasında paketleme/yayından ÖNCEYE alınan iki yeni
özellik de tamamlandı:

- **Ekip modu** — *varsayılan açık*, kurulum gerektirmez. Görevleri karmaşıklık/risk
  tag'lerine göre junior/senior/tester/docs rollerine dağıtan, başarısızlıkları
  zincirde yukarı taşıyan (junior → daha güçlü modelle junior → senior) ve
  güvenlik/mimari/kapsam kararlarında — Telegram üzerinden ya da oturum içinde — onay
  isteyen bir yönetici; her karar kayıtlı ve geri çevrilebilir. Her görevin tek bir
  modele gitmesini istersen `config.yml`'de `team.enabled: false` ile kapatabilirsin.
- **Otopilot** — *opsiyonel*, gerçek bir Telegram botu gerektirdiği için. Telegram
  bildirimleri, butonlu onaylar, kullanım limiti dolduğunda otomatik devam ve süreç
  yönetimiyle (`gp autopilot start|stop|status|logs`) insansız/arka planda yürütme.
  `/gp:init`, `.graph/`'ı kurduktan hemen sonra bunu bağlamak isteyip istemediğini bir
  kez sorar — hayır dersen hiçbir iz kalmadan atlanır.

580 test geçiyor; CLI tip kontrolünden ve lint'ten temiz çıkıyor, ve bu testlerin
HİÇBİRİ gerçek bir LLM API çağrısı harcamadı — tamamen deterministik kod üzerinde
çalışıyor. Otopilot/ekip modunun gerçek bir Telegram botuyla uçtan uca canlı denemesi
henüz yapılmadı, bu açıkça not düşüldü.

Bu proje, **gerçekten doğrulanmış olanla varsayılanı** ayırmak konusunda alışılmadık
bir titizlikle inşa edildi: her mimari karar [`docs/decisions.md`](docs/decisions.md)'de
tarihli bir ADR olarak kanıtıyla birlikte kayıtlı; Claude Code'un kendi davranışına dair
bu oturumda doğrulanamayan her iddia, ileri sürülmek yerine `DOĞRULANMADI` diye
işaretlendi. Ham Claude Code'a karşı benchmark bilinçli olarak rafta — gerçek bir
karşılaştırma üretmek ücretli API kullanımı gerektiriyor, şimdilik buna değmeyeceğine
karar verildi. Paketleme/yayın ve ucuz bir reviewer + API-test katmanı henüz
başlanmadı.

## Kurulum

GraphPilot bir Claude Code plugin'i olarak dağıtılır. Claude Code içinden:

```
/plugin marketplace add <bu-repo-url'si>
/plugin install gp
```

Sonra, projenizin içinde:

```
/gp:init    # .graph/ iskeletini kurar (brief.md + config.yml) — Telegram bildirimi isteyip istemediğini bir kez sorar
/gp:plan    # bir ürün brief'ini brief.md + epic'lere dönüştürür
/gp:expand  # bir epic'i ihtiyaç anında flag'lenmiş feature/task'lara açar
/gp:run     # graph'ı uçtan uca yürütür — ekip modu (junior/senior/tester/docs) varsayılan açık
/gp:team    # aynısı, açıkça — config.yml'den bağımsız her zaman tam yönetici deneyimi istersen
```

`/gp:init`, `.graph/`'ı kurduktan hemen sonra otopilot için Telegram bildirimi isteyip
istemediğini sorar. Evet dersen `@BotFather` ile bir bot oluşturma adımlarında sana
yol gösterir ve chat'ini bağlar; hayır dersen (ya da atlarsan) istediğin zaman sonra
kurabilirsin:

```
gp autopilot setup --token <bot-token'ınız>   # botu doğrular, chat'inizi bağlar
gp autopilot start --agents-dir plugin/agents # arka planda çalışır; Telegram'dan /pause /resume /stop
```

## Depo yapısı

```
cli/      `gp` CLI'ının TypeScript kaynağı (parse, validate, route, context, checks, hooks, ...)
plugin/   Kurulabilir Claude Code plugin'i (agent'lar, skill'ler, hook'lar)
docs/     Spesifikasyon (SPEC.md) ve mimari kararlar (decisions.md)
bench/    Benchmark senaryoları ve sonuçları (token-optimizasyon ablasyon tablosu dahil)
```

## Geliştirme

```bash
cd cli
nvm use          # Node >=22 gerekli
npm install
npm test          # Vitest — 580 test
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
