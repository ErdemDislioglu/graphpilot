# GraphPilot — Hata Senaryoları (Faz 9.8)

Her senaryo: **Belirti** (ne görüyorsun) → **Sebep** → **Çözüm komutu**. Hepsi gerçek
`gp` komutları veya gerçek dosya yolları — tahmini/kurgusal değil.

---

## 1. `/gp:run` ortadan kesildi (kullanım limiti, çökme, terminal kapandı)

**Belirti:** Yeni bir oturum açtın, `.graph/` içinde bir task hâlâ `status: running`.

**Sebep:** Önceki oturum bir düğümün ortasında kesintiye uğradı; eski oturumu
sürdürmek pahalı/yanlış (SPEC/9.1 ilkesi), her devam yeni temiz oturumla başlar.

**Çözüm:**
```bash
gp resume --json      # "running kalmış düğümler" listesini gösterir
gp recover -p .        # ## Yarım iş notu varsa dokunmaz; yoksa commit'lenmemiş
                        # değişikliği geri alır, düğümü pending'e döndürür
```

---

## 2. Mod B'de (`gp run`) işlem beklenmedik şekilde durdu, düğüm `failed` değil

**Belirti:** `gp run` çıktısında `⏸ Kullanım limiti nedeniyle durduruldu` mesajı.

**Sebep:** `isRateLimitSignal` çıktıda rate-limit benzeri bir desen gördü,
`mode_b.rate_limit_retry.max_retries` denemesi tükendi. Bu BİLEREK `failed`
sayılmaz (geçici bir kesinti, task'ın hatası değil).

**Çözüm:** Bir süre bekle, sonra aynı komutu tekrar çalıştır — `gp resume`/
`gp recover` gerekirse devreye girer. Daha uzun bekleme istiyorsan
`config.yml`'deki `mode_b.rate_limit_retry.wait_seconds`'ı artır.

---

## 3. `gp validate` "depends_on döngüsü" hatası veriyor

**Belirti:** `gp validate` çıkışında `depends_on döngüsü (task): E01-F01-T01 → E01-F01-T02 → E01-F01-T01`.

**Sebep:** Elle düzenleme ya da bir genişletme (`/gp:expand`) yanlışlıkla
dairesel bir bağımlılık oluşturdu.

**Çözüm:** Döngüdeki düğümlerden birinin `depends_on` listesini elle düzelt
(ilgili `.md` dosyasını aç, gereksiz bağımlılığı çıkar), sonra:
```bash
gp validate && gp index
```

---

## 4. `gp status` "DEADLOCK" uyarısı veriyor

**Belirti:** `gp status` çıkışında `⚠ DEADLOCK: ... → ... (failed) bekliyor`.

**Sebep:** Hiç `ready` düğüm yok, hiçbir şey `running` değil, ama bitmemiş
düğümler var — tipik olarak bir düğüm `failed` oldu ve ona bağımlı başka
düğümler sonsuza kadar bekliyor (`gp fail`'in otomatik `blocked` işaretlemesi
zaten bunu görünür kılar, `gp status` kök sebebi gösterir).

**Çözüm:** Raporun gösterdiği `blockedBy` düğümünü incele (`cat .graph/.../X.md`),
sorunu elle düzelt ya da görevi değiştir, sonra o düğümü yeniden `pending`'e al:
```bash
gp set <blockedBy-id> status=pending
```

---

## 5. `gp context`/`gp run` "bağlam paketinde sır gibi görünen içerik bulundu" hatası

**Belirti:** `hata: E01-F01-T01: bağlam paketinde sır gibi görünen içerik bulundu, YAZILMADI`.

**Sebep:** Faz 9.7 — bir bilgi düğümü veya brief'in içine (muhtemelen yanlışlıkla)
gerçek bir API anahtarı/şifre/PEM anahtarı yapıştırılmış. `gp context` bunu
**asla** agent'a göndermez, dosyayı hiç yazmadan durur.

**Çözüm:** Hata mesajındaki (kırpılmış) ipucuna göre ilgili `.md` dosyasını aç,
gerçek sırrı çıkar (gerekiyorsa `.env`'e taşı, bilgi düğümüne SADECE referans
bırak), tekrar dene.

---

## 6. `gp sync` bir bilgi düğümünü "şüpheli" (`changed`) işaretliyor

**Belirti:** `gp sync` çıkışında `⚠ şüpheli: src/catalog.ts değişmiş`.

**Sebep:** Kod, ilgili bilgi düğümü güncellenmeden elle (veya başka bir araçla)
değiştirildi — Faz 9.3'ün hash karşılaştırması bunu yakaladı.

**Çözüm:** Önce bilgi düğümünün `## Arayüz`/`## Kararlar` bölümünün hâlâ doğru
olup olmadığını kontrol et; doğruysa (kod değişti ama sözleşme aynıysa) ya da
elle güncelledikten sonra:
```bash
gp sync --update-hashes -p .
```

---

## 7. Yeni bir task'ın `npm test`'i "No test files found" ile başarısız oluyor

**Belirti:** Katman 1 (`gp checks`) bir implementasyon task'ından sonra
`exit 1` + "No test files found" veriyor, ama task'ın kendisi testle ilgili değil.

**Sebep:** Faz 8 pilot koşusunda bulunan gerçek bir metodoloji boşluğu: testler
AYRI bir task'ta (genelde bir sonraki, `type: test`) yazılacaksa, proje-geneli
`checks.test` komutu test dosyası henüz yokken çalışır ve yanlışlıkla patlar.

**Çözüm:** Bu geçici bir durum — testleri yazan task bitince `gp checks`
otomatik olarak geçer. Orkestratör bu round'da fix-loop'u döndürmemeli (coder
bunu düzeltemez); bir sonraki (test) task'ı bekle.

---

## 8. Katman 2 (`gp check`) gerçekten doğru olan bir şeyi "eksik" işaretliyor

**Belirti:** `gp check <id>` bir kriteri "eksik" diyor ("npm test yeşil" gibi),
ama Katman 1 (`gp checks`) az önce GERÇEKTEN geçti.

**Sebep:** Katman 2 SADECE `git diff`'e bakar — Katman 1'in sonucunu GÖRMEZ.
"Testler geçti" gibi bir kriter diff'te kanıt bırakmaz, checker da "belirsizsen
eksik de" kuralına göre (haklı olarak) temkinli davranır.

**Çözüm:** Eğer Katman 1 (`gp checks`) GERÇEKTEN geçtiyse, bu "eksik"i orkestratör
olarak görmezden gelebilirsin (tekrar coder çağırmak boşuna token harcar) —
ama bunu NEDENİYLE (Katman 1'in bağımsız geçişi) not ederek yap, sessizce değil.

---

## 9. `claude plugin validate` "author bilgisi yok" ya da başka bir uyarı veriyor

**Belirti:** `claude plugin validate .` uyarıyla geçiyor (hata değil).

**Sebep:** `plugin/.claude-plugin/plugin.json`'da opsiyonel bir alan (ör. `author`,
`homepage`) eksik.

**Çözüm:** İlgili alanı ekle, `scripts/sync-cli-to-plugin.sh` ile yeniden
senkronla, tekrar doğrula:
```bash
bash scripts/sync-cli-to-plugin.sh && claude plugin validate .
```

---

## 10. `npm test` "styleText is not exported" hatasıyla çöküyor

**Belirti:** `vitest`/`rolldown` `node:util`'den `styleText` import etmeye
çalışıp `SyntaxError` veriyor.

**Sebep:** Aktif Node sürümü çok eski (Node 18) — vitest 5/rolldown Node >=20.12
gerektiriyor.

**Çözüm:**
```bash
nvm use 22   # ya da cli/.nvmrc'deki sürüm
npm test
```

---

## 11. `gp recover` sonrası dosya beklenenden farklı — "geri aldın ama benim işimdi"

**Belirti:** `gp recover` bir `running` düğümü `pending`'e döndürdü ve
commit'lenmemiş değişiklikleri geri aldı, ama o değişiklikler gerçekten değerliydi.

**Sebep:** Agent, işi bitirmeden `## Yarım iş` notu YAZMADAN durmuş (ya da
hiç yazmamış) — `decideRunningNodeRecovery` bu durumda GÜVENLİ varsayılanı
(geri alma) seçer, çünkü not yoksa neyin korunacağını bilemez.

**Çözüm:** Önleyici: `coder`/`tester` agent'larına verilen talimat zaten
"bitiremezsen `## Yarım iş` bölümüne yaz" diyor — bunu atlayan bir agent
davranışıysa, görevi (prompt'u) netleştir. Kurtarma SONRASI: `git reflog` ile
geri alınan commit'i bulup elle `git cherry-pick`/`git stash` ile kurtarabilirsin
(GraphPilot bunu otomatik yapmaz — SPEC/9.1 kararı: basitlik için geri alma,
forensic kurtarma elle).

---

## 12. Bir bilgi düğümü ya da `brief.md` "özetlenmesi önerilir" uyarısı veriyor

**Belirti:** `gp validate` çıkışında `~N token, sınır M ... özetlenmesi önerilir`.

**Sebep:** Faz 9.5 — brief (sınır 1500 token) ya da bir bilgi düğümü (sınır
1200 token) her task'ın/`reads` eden her görevin bağlamına giriyor; büyüdükçe
HER görevin maliyeti artıyor.

**Çözüm:** Bu bir UYARI, hata değil — otomatik düzeltilmez (SPEC §5.5: bu
muhakeme gerektiren bir karar). Dosyayı elle kısalt ya da birden fazla,
daha odaklı bilgi düğümüne böl.
