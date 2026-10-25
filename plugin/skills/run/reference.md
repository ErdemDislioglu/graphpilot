# /gp:run — nadir yollar

`/gp:run` bu dosyayı yalnız ilgili durum çıktığında okur (Faz 14 O15: ana skill kısa kalır).
`gp` = `node "${CLAUDE_PLUGIN_ROOT}/lib/bin.js"`.

## Devam (Faz 9.1) — `gp resume`'da `running kalmış düğümler` doluysa
Eski oturumu sürdürme; her `/gp:run` yeni bir oturumdur. `gp recover -p <kök> --json`:
her `running` düğüm için karar verir. `## Yarım iş` notu olan düğüme dokunmaz — onu
`gp start <id>` ile yeniden başlat (context yeniden üretilir, agent notu görür).
Notu olmayanın commit'lenmemiş değişikliğini geri alıp `pending`'e döndürür (normal
akışa girer). `orphanWip` doluysa kullanıcıya bildir (eski WIP commit'ler, elle temizlik).

## İskelet (Faz 7.6) — task `type: scaffold` ise, agent'tan ÖNCE
`gp scaffold <id> -p <kök> --json`. `ran:true, ok:true` → agent prompt'una "İskelet zaten
`<command>` ile kuruldu, SADECE özelleştir/bitir" ekle. `ran:false` → normal akış.

## Küçük düğüm birleştirme (Faz 7.5) — `gp next`'in `batches` alanı doluysa
`optimizations.batch_low_nodes` açıkken aynı feature + `complexity: low` + aynı
model/agent'a düşen en fazla 4 task. Tüm ID'leri `gp start <id1> <id2> …` ile başlat,
TEK Agent çağrısı yap (`group.agent`/`group.model`, bağlam paketlerinin yolları). Agent'a
"her task için AYRI `## Handoff` yaz" de. `gp gate` ve `gp finish` HER task için ayrı
(batch yalnız agent çağrısını birleştirir, graph durumunu değil). Zincirden farkı:
batch'teki görevler bağımsızdır, zincirdekiler sıralı.

## Kullanım limiti / rate limit (Faz 9.2)
Agent çağrısı limit benzeri bir hatayla düşerse düğümü `failed` SAYMA (geçici kesinti;
❗ kesin hata metni bu projede gözlenmedi, DOĞRULANMADI). Düğüm `running` kalır, hiçbir
şey değiştirme; "<id>'den kullanım limiti nedeniyle durduruldu, yeni oturumda `gp resume`
ile devam edilebilir" de ve dur. Mod B'de (`gp run`) `mode_b.rate_limit_retry` aynısını
otomatik yapar.

## Ekip modu (Faz 13, varsayılan açık)
`gp start`'ın `agent`/`model`'i `config.team.*`'tan gelir (`senior` dönebilir); `gp escalate`
zinciri "junior(haiku)→junior(sonnet)→senior" olur. Bulgu bildirme ve yönetici kararı için
kullanıcı doğrudan `/gp:team`'i çağırabilir.

## Hook'lar (arka planda — senin işin yok)
Uzun Bash çıktısı kırpılır (`log_trimming`), aynı dosya/komut 3+ kez tekrarlanırsa uyarı
eklenir (`turn_limits` — görürsen yaklaşımını gözden geçir), `touches` dışına yazımda
uyarı gelir (yalnız `running` düğümler; kendi düğüm dosyası ve `reads` bilgi düğümleri
serbest). Ölçüm `.graph/_metrics/`'e yazılır.
