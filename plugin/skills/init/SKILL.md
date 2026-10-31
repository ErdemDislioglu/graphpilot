---
description: >-
  `.graph/` iskeletini oluşturur (brief.md + config.yml varsayılanları), isteğe bağlı
  olarak Telegram otopilot bildirimlerini kurar. Kullanıcı "/gp:init" yazdığında veya
  yeni bir projede graph kurmak istediğinde çalışır.
---

# /gp:init

1. Çalıştır: `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" init --json`
   - Idempotent: `.graph/` zaten varsa var olan dosyaların üzerine yazmaz, sadece
     eksik parçaları tamamlar.
2. Çalıştır: `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" doctor --json` — kurulumu doğrula.
3. Kullanıcıya kısaca özetle: hangi dosyalar oluşturuldu (`created`), hangileri zaten
   vardı (`skipped`).
4. **Ekip modu (Faz 13) zaten varsayılan AÇIK** — `config.yml`'in `team.enabled`
   alanı `true` (ek bir işlem gerekmiyor). Görevler otomatik olarak junior/senior/
   tester/docs rollerine gider. Kullanıcı bunu istemiyorsa `.graph/config.yml`'e
   `team: { enabled: false }` ekleyebileceğini belirt — ama kendiliğinden KAPATMA.

## 5. Telegram otopilot bildirimleri (opsiyonel, Faz 12)

Bu, `/gp:init`'in tek etkileşimli adımı — kullanıcıya DOĞRUDAN sor (subagent değilsin,
sorabilirsin):

> "GraphPilot'u Telegram üzerinden bildirim/onay alacak şekilde (otopilot modu — oturumu
> açık tutmadan arka planda çalışabilir) bağlamak ister misin? Gerçek bir Telegram
> botu gerekiyor (@BotFather'dan ücretsiz, ~1 dakika)."

**"Hayır" / cevapsız / belirsiz** → hiçbir şey yapma, `autopilot.enabled` varsayılan
`false` kalır, doğrudan 6. adıma geç.

**"Evet"** ise:
1. Kullanıcının **bu proje için** bir bot token'ı var mı diye sor (her projenin kendi
   botu/sohbeti olur — bildirimler karışmaz; aynı bot iki otopilota bağlanırsa buton
   cevapları çakışır). Yoksa kısaca yönlendir: "Telegram'da `@BotFather`'a yaz,
   `/newbot` komutunu çalıştır (ör. adı `<proje>-gp-bot`), sana verdiği token'ı buraya yapıştır."
2. Token'ı aldıktan sonra kullanıcıya NET söyle: *"Bu token sadece yerelde
   `~/.graphpilot/secrets.json`'a bu projenin yoluyla kaydedilecek — projeye, graph'a ya
   da commit'e GİRMEYECEK."* (roadmap 12.9'un güvenlik ilkesi — kullanıcıya şeffaf ol.)
3. Çalıştır (token'ı **asla** `console.log`/dosyaya yazdırma, sadece bu komuta argüman
   olarak geçir):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js" autopilot setup --token <TOKEN> -g <proje>/.graph --json
   ```
   Bu, token'ı doğrular, kullanıcının botuna Telegram'dan `/start` göndermesini bekler
   (en fazla 30s — kullanıcıya "şimdi Telegram'ı aç, botuna /start yaz" de), chat ID'yi
   otomatik kaydeder, test mesajı yollar.
   - **Başarılı** → `.graph/config.yml`'i Edit ile aç, `autopilot:` bölümü yoksa ekle,
     varsa `enabled: true` yap (örnek: `autopilot: { enabled: true }` — diğer alanlar
     varsayılanda kalabilir). Kullanıcıya söyle: "✓ Telegram bağlandı, test mesajını
     kontrol et. Otopilotu başlatmak için: `gp autopilot start --agents-dir
     plugin/agents`."
   - **Başarısız** (geçersiz token, `/start` gelmedi) → hatayı kullanıcıya göster,
     `config.yml`'e DOKUNMA (autopilot.enabled false kalır), istersen tekrar dene
     ("token'ı kontrol et ya da `/gp:init`'i tekrar çalıştır") de.

## 6. Sıradaki adım
`brief.md` şu an sadece `(TODO)` placeholder'ları içeriyor — kullanıcıya
**`/gp:plan`** komutunu çalıştırmasını öner (proje isteğini brief + epic'lere
dönüştürür). Bu skill brief'i doldurmaz, sadece iskeleti kurar.
