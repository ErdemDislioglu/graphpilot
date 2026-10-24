---
id: E01-F02
kind: feature
name: F02-cart
summary: "Sepete ekleme API'si"
status: pending
expanded: true
depends_on: [E01-F01]
---

## Amaç
Kullanıcının arama sonucundan bir kitabı sepete ekleyebilmesi.

## Kabul kriterleri
- `POST /cart/items` geçerli bir `bookId` ile 201 döner
- Var olmayan `bookId` 404 döner
