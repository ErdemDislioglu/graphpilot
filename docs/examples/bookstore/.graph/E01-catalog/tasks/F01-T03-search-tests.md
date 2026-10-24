---
id: E01-F01-T03
kind: task
name: F01-T03-search-tests
level: 3
summary: "Arama endpoint'i için testler"
type: test
complexity: low
risk: low
context_size: small
model: auto
agent: tester
depends_on: [E01-F01-T02]
reads: ["[[catalog-api]]"]
touches: ["src/catalog/search.test.ts"]
context_budget: 6000
status: pending
attempts: 0
---

## Görev
`[[catalog-api]]` sözleşmesine karşı arama endpoint'inin kabul kriterlerini test et.

## Kabul kriterleri
- Eşleşen ve eşleşmeyen sorgu senaryoları kapsanır
- Boş sorgu 400 senaryosu kapsanır

## Handoff

*(Henüz çalıştırılmadı.)*
