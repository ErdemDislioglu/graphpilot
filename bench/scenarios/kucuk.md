# Senaryo: Küçük — TODO REST API

Bir TODO uygulaması için REST API yaz.

## Gereksinimler
- `POST /todos` — yeni todo oluştur (`title`, opsiyonel `done: false` varsayılan)
- `GET /todos` — tüm todo'ları listele
- `GET /todos/:id` — tek todo getir, yoksa 404
- `PATCH /todos/:id` — `done` durumunu güncelle
- `DELETE /todos/:id` — sil
- Veri kalıcılığı: basit bir dosya/bellek içi depo yeterli (gerçek veritabanı şart değil)
- Her endpoint için test yaz (başarılı + hata senaryosu)

## Kapsam dışı
Kullanıcı hesabı, auth, çoklu liste desteği.

## Kabul kriterleri (gizli — agent'lara gösterilmez, benchmark değerlendirmesi için)
- 5 endpoint de doğru status kodlarıyla çalışıyor
- Var olmayan ID için 404 dönüyor
- Test paketi `npm test` ile geçiyor
