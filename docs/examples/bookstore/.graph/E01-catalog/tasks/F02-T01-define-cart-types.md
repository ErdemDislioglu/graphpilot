---
id: E01-F02-T01
kind: task
name: F02-T01-define-cart-types
level: 3
summary: "Cart tipi ve sepete ekleme arayüzünü tanımla"
type: feature
complexity: low
risk: low
context_size: small
model: auto
agent: coder
depends_on: []
reads: ["[[catalog-api]]"]
touches: ["src/cart/types.ts"]
context_budget: 6000
status: pending
attempts: 0
---

## Görev
`Cart` tipini tanımla; `[[catalog-api]]`'deki `Book.id` alanını `bookId` referansı olarak kullan.
Bu feature'ın interface-first görevi.

## Kabul kriterleri
- `Cart` tipi `items: { bookId: string, qty: number }[]` içerir
- `POST /cart/items` girdi/çıktı tipleri export edilmiş

## Handoff

*(Henüz çalıştırılmadı.)*
