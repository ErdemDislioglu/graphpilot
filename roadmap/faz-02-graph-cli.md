# Faz 2 — Graph CLI (TypeScript)

**Amaç:** Graph üzerindeki tüm deterministik işleri yapan `gp` CLI'ını yazmak.
LLM'in yapmaması gereken her şey burada: okuma, doğrulama, indeks, sıralama, durum, bağlam paketi.

**Ön koşul:** Faz 1 (SPEC + Zod şemaları).
**Çıktı:** `cli/` altında çalışan, test edilmiş `gp` CLI'ı.

## Görevler

### 2.1 Proje kurulumu
- [x] `cli/` altında Node + TypeScript (strict), Vitest, ESLint, Prettier
- [x] Bağımlılıklar (onayla): `gray-matter` (frontmatter), `zod`, `commander`, `fast-glob`, `yaml`
- [x] `npm run gp -- <komut>` ile çalışma
- [x] Çıktı formatı: varsayılan insan-okur metin, `--json` ile makine-okur (agent'lar JSON kullanır)

### 2.2 Parser
- [x] `.graph/` altındaki tüm md'leri oku, frontmatter + body ayır
- [x] `[[link]]`'leri çıkar
- [x] Bellekte `Graph` nesnesi: düğümler, kenarlar (`depends_on`, `reads`, parent/child)
- [x] Test: örnek graph'ı doğru parse ediyor

### 2.3 Validator — `gp validate`
- [x] Zod şema kontrolü
- [x] Kırık link, döngü, tekrar eden ID/name kontrolü
- [x] `depends_on` → sadece görev, `reads` → sadece bilgi kontrolü
- [x] Handoff ve brief token sınırı kontrolü (yaklaşık token sayacı: karakter/4 yeterli başlangıç için)
- [x] Çıkış kodu: hata varsa 1
- [x] Test: her hata türü için bozuk örnek

### 2.4 İndeks üretici — `gp index`
- [x] Kök `INDEX.md` ve her epic için `_index.md` üret
- [x] Deterministik sıralama (ID'ye göre) — aynı graph her zaman aynı çıktıyı üretir (cache dostu)
- [x] İlerleme yüzdesi (done / toplam)
- [x] Test: snapshot testi

### 2.5 Sıralama ve hazır düğümler — `gp next`
- [x] Topolojik sıralama
- [x] `ready` = tüm `depends_on`'ları `done` olan `pending` düğümler
- [x] Paralel çalıştırılabilir grupları döndür (aynı dosyalara dokunmayanlar — `touches` çakışma kontrolü)
- [x] `--limit N` parametresi
- [x] Test: çeşitli bağımlılık şekilleri

### 2.6 Durum yönetimi — `gp status`, `gp set`
- [x] `gp status`: özet (toplam, done, running, failed, blocked)
- [x] `gp set <id> status=done attempts=1` gibi frontmatter güncellemesi (gövdeye dokunmadan)
- [x] Atomik yazma (geçici dosya + rename) — kesintide bozuk dosya kalmasın
- [x] Her değişiklikten sonra ilgili indeksi otomatik güncelle

### 2.7 Routing çözücü — `gp route <id>`

> **Faz 2'de dolduruldu:** `agent: auto` çözümü roadmap'te tanımsızdı — `type: test` →
> `tester`, `type: docs` → `docs`, diğerleri → `coder` (SPEC §10'a işlendi).
> Hiçbir routing kuralı eşleşmezse `gp route` **hata fırlatır** (sessiz varsayılan yok).
- [x] `config.yml` kurallarını sırayla uygula, ilk eşleşen kazanır
- [x] Düğümde `model: <değer>` elle verilmişse onu kullan
- [x] Çıktı: `{ model, agent, review, budget, max_turns }`
- [x] Test: routing tablosu kombinasyonları

### 2.8 Bağlam paketi — `gp context <id>` (en kritik komut)
- [x] Bir düğüm için agent'a verilecek paketi üret, **sabit sırayla** (prompt caching için):
  1. `brief.md` (sabit)
  2. İlgili epic `_index.md` (yarı sabit)
  3. `reads` listesindeki bilgi düğümleri
  4. Doğrudan `depends_on` düğümlerinin **sadece Handoff bölümleri**
  5. Düğümün kendisi (değişken kısım en sonda)
- [x] Geçişli (transitive) bağımlılıkları **dahil etme**
- [x] Bütçe kontrolü: paket `context_budget`'ı aşarsa uyarı + hangi parçanın büyük olduğunu raporla
- [x] Çıktı: tek md dosyası `.graph/_runtime/<id>.context.md` + JSON özet (token tahmini)
- [x] Test: paket içeriği ve sırası

### 2.9 Repo haritası — `gp repomap`
- [x] Proje kodunu tara, dosya listesi + export edilen sembol isimleri (basit regex ile başla;
      TS/JS/Python/Go — *hedef projenin dili*, GP'nin kendi dili değil. ROADMAP'teki "Java yok"
      GP'nin kendi stack'i içindir; hedef proje Java ise taranabilir)

> **Faz 0 notu (rakip analizi):** [Graphify](../docs/research.md#07-rakip-notlari) aynı işi
> tree-sitter/AST ile yapıyor. **Faz 2'de karar:** şimdilik kendi basit regex extractor'ımız
> yazıldı (`SymbolExtractor` arayüzü + TS/JS/Python/Go/Java), ama arayüz kasıtlı soyut —
> `DEFAULT_EXTRACTORS` dizisini değiştirerek ileride tree-sitter'a ya da Graphify'a geçmek
> `buildRepoMap`'in kendisine dokunmadan mümkün (Faz 10.8).
- [x] Çıktı: `.graph/_shared/knowledge/repo-map.md` (sıkıştırılmış, tek satır/dosya)
- [x] `.gitignore` ve `node_modules` vb. hariç
- [x] İleride tree-sitter'a geçiş için arayüzü soyut tut

### 2.10 Yeni düğüm iskeleti — `gp new`

> **Faz 2'de çözülen tasarım boşluğu:** "ID'ler asla yeniden kullanılmaz" kuralı sadece
> mevcut dosyaları taramakla garanti edilemez (silinen düğümün numarası sahte olarak boşta
> görünür). `.graph/_meta/counters.json` kalıcı bir yüksek-su-işareti tutuyor — `_runtime/`'ın
> aksine git'te izlenir. Test: T01 silinip tekrar `gp new task` çağrıldığında T02 verildiği
> (T01 DEĞİL) doğrulandı.
- [x] `gp new task --parent E02-F01 --slug search-api` → sıradaki ID'yi verir, şablonla dosya oluşturur
- [x] Agent'lar yeni düğümü elle yazmak yerine bunu çağırır (format hatası olmaz)

### 2.10b Devam özeti — `gp resume`
- [x] Kesinti sonrası devam için ~500 token'lık özet: durum sayıları, `running` kalmış düğümler ve `Yarım iş` notları, sıradaki `ready` düğümler, son başarısızlıklar
- [x] Ayrıntılar Faz 9.1'de; bu görevde sadece komutun kendisi ve testi

### 2.11 Paketleme
- [x] `npm` paketi olarak build (`gp` binary)
- [x] `README` komut listesi

## Claude'a örnek prompt

```
faz-02 dosyasındaki 2.8 görevini yap. docs/SPEC.md'deki şemalara uy.
Önce planını göster, onayımdan sonra uygula. Paket sırası değiştirilmemeli,
çünkü prompt caching buna bağlı. Vitest testlerini yaz ve çalıştır.
```

## Kabul kriterleri
- [x] Örnek bookstore graph'ında tüm komutlar çalışıyor — **gerçek `gp` CLI'ı** (`npm run gp --`)
      bookstore örneğinin bir kopyasına karşı 10 komutun hepsiyle elle çalıştırıldı
      (validate, status, next, route, context, index, set, new, repomap, resume); hepsi
      beklenen çıktıyı üretti
- [x] Test kapsamı parser, validator, next, route, context için > %80 — **ölçüldü**
      (`vitest --coverage`): parser 92%, validate 97%, next 100%, route 93%, context 96%
      (satır bazında). Genel paket: 123/123 test geçti
- [x] `gp context` çıktısı aynı girdide byte-byte aynı (deterministik) — **test edildi**:
      graph iki kez bağımsız parse edilip bağlam iki kez kurulup `===` karşılaştırıldı
- [x] Hiçbir komut LLM çağırmıyor — **grep ile doğrulandı**: `src/` içinde
      `anthropic|claude -p|fetch\(|axios|http.request|https.request` hiç geçmiyor

## Faz Günlüğü
| Tarih | Görev | Not |
|---|---|---|
| 2026-10-23 | 2.1–2.11 | Tüm Faz 2 tek oturumda yapıldı, roadmap sırasıyla (2.2→2.10b), her modül yazılır yazılmaz test edildi. 14 test dosyası, 123 test, hepsi geçti. `npx tsc --noEmit`, `eslint`, `prettier --write`, `npm run build` temiz. |
| 2026-10-23 | — | SPEC'te 3 boşluk dolduruldu: "taslak" mekanizması (`draft: boolean` alanı eklendi), `agent: auto` çözümü (type→agent eşlemesi), ID yeniden kullanılmama garantisi (`.graph/_meta/counters.json`). Hepsi `docs/SPEC.md`'ye işlendi. |
| 2026-10-23 | — | Gerçek `gp` CLI'ı bookstore örneğine karşı uçtan uca çalıştırıldı (10 komut, elle doğrulandı) — unit testlerin üstüne gerçek kanıt. |
| 2026-10-24 | — | **Geriye dönük not (Faz 3'te bulundu):** `zod@3.23.0`'da yüksek-önem DoS açığı (GHSA-mrhx-c7xc-m3w5) vardı. `zod@4.6.7`'ye yükseltildi, sıfır kod değişikliği gerekti, 129/129 test geçti. Bu dosyadaki Faz 2 çıktısı artık zod 4 kullanıyor. |
