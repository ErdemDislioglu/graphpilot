# Brief — Bookstore (örnek graph)

> Bu dosya SPEC §7'nin örnek doldurulmasıdır; gerçek bir proje değildir.

## Amaç
Küçük bir kitap satış sitesi: katalog arama ve sepete ekleme.

## Stack
Node.js + TypeScript, Express, PostgreSQL.

## Klasör yapısı
`src/catalog/`, `src/cart/`, `src/shared/`.

## Konvansiyonlar
- Dosyayı baştan yazma, düzenle.
- Her endpoint için Vitest testi.

## Test stratejisi
`npm test` — Vitest. Entegrasyon testleri `src/**/*.int.test.ts`.

## Kapsam dışı
Ödeme akışı, kullanıcı hesapları, admin paneli — bu örnekte yok.
