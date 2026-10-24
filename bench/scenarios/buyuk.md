# Senaryo: Büyük — Çok modüllü SaaS iskeleti

Çok kiracılı (multi-tenant) bir proje yönetimi SaaS'ının iskeletini kur.

## Gereksinimler
- Modüller: `auth` (kayıt/giriş/organizasyon davet), `projects` (proje CRUD),
  `tasks` (görev CRUD, projeye bağlı), `billing` (plan seçimi — gerçek ödeme değil,
  sadece plan kaydı)
- Multi-tenant: her organizasyonun verisi izole (organizasyon ID'siyle filtrelenir)
- Rol bazlı yetki: `owner`/`member` — sadece `owner` organizasyon ayarlarını değiştirebilir
- REST API + OpenAPI şeması (en azından `auth` ve `projects` modülleri için)
- Veritabanı migration'ları (en az 1 migration aracı ile)
- Her modül için entegrasyon testi

## Kapsam dışı
Gerçek ödeme entegrasyonu (Stripe vb.), frontend, e-posta gönderimi (mock yeterli),
gerçek zamanlı bildirimler.

## Kabul kriterleri (gizli)
- Organizasyon A'nın kullanıcısı organizasyon B'nin projelerini göremiyor
- `member` rolü organizasyon ayarını değiştirmeye çalışınca 403 dönüyor
- Migration'lar sıfırdan çalıştırılabiliyor (temiz veritabanında)
- Her modülün testi bağımsız geçiyor
