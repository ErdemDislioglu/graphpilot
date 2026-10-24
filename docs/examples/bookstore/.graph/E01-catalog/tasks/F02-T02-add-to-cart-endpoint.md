---
id: E01-F02-T02
kind: task
name: F02-T02-add-to-cart-endpoint
level: 3
summary: "POST /cart/items endpoint'ini uygula"
type: feature
complexity: med
risk: med
context_size: small
model: auto
agent: coder
depends_on: [E01-F02-T01]
reads: ["[[cart]]", "[[db-schema]]"]
touches: ["src/cart/cart.ts"]
context_budget: 10000
status: pending
attempts: 0
---

## Görev
`[[cart]]`'da tanımlı tipleri kullanarak `POST /cart/items` endpoint'ini `db-schema`'daki
`carts` tablosuna karşı uygula. `risk: med` — kullanıcı oturumu/sepet kalıcılığına dokunuyor.

## Kabul kriterleri
- Geçerli `bookId` ile 201 döner, sepete eklenir
- Var olmayan `bookId` 404 döner

## Handoff

*(Henüz çalıştırılmadı.)*
