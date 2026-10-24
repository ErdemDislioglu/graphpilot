---
id: E01-F01
kind: feature
name: F01-search
summary: "Ürün arama API'si"
status: running
expanded: true
depends_on: []
---

## Amaç
Kullanıcının başlığa göre kitap arayabilmesi.

## Kabul kriterleri
- `GET /search?q=` ilgili kitapları döndürür
- Boş sorgu 400 döner
