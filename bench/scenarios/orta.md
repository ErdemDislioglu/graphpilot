# Senaryo: Orta — Kitap satış sitesi

Küçük bir kitap satış sitesi: katalog, arama, sepete ekleme, basit kullanıcı girişi.

## Gereksinimler
- Kitap kataloğu: başlık, yazar, fiyat; `GET /books`, `GET /books/:id`
- Arama: `GET /search?q=` (başlık/yazar üzerinden kısmi eşleşme)
- Sepet: `POST /cart/items` (ekle), `GET /cart` (göster), `DELETE /cart/items/:id` (çıkar)
- Basit auth: email+şifre ile kayıt/giriş (JWT veya session, seç ve belgele)
- Sepet kullanıcıya bağlı olmalı (giriş yapmadan sepet kullanılamaz)
- Veritabanı: SQLite veya PostgreSQL (seç ve belgele)
- Her endpoint için test

## Kapsam dışı
Ödeme akışı (gerçek ödeme entegrasyonu), stok yönetimi, admin paneli, kargo.

## Kabul kriterleri (gizli)
- Auth olmadan sepete erişim 401 dönüyor
- Arama case-insensitive çalışıyor
- Sepete eklenen kitap `GET /cart`'ta görünüyor
- Test paketi geçiyor, build/lint temiz
