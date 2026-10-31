---
id: E01-F02-T03
kind: task
name: F02-T03-cart-tests
level: 3
summary: "Sepete ekleme endpoint'i için testler"
type: test
complexity: low
risk: low
context_size: small
model: auto
agent: tester
depends_on: [E01-F02-T02]
reads: ["[[cart]]"]
touches: ["src/cart/cart.test.ts"]
context_budget: 6000
status: pending
attempts: 0
---

## Görev
`[[cart]]` sözleşmesine karşı sepete ekleme endpoint'inin kabul kriterlerini test et
(`risk: med` → testler ayrı görevde, Faz 14 O2).

## Kabul kriterleri
- Geçerli `bookId` ile 201 senaryosu kapsanır
- Var olmayan `bookId` ile 404 senaryosu kapsanır

## Handoff

*(Henüz çalıştırılmadı.)*
