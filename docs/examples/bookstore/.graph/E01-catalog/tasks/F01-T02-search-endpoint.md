---
id: E01-F01-T02
kind: task
name: F01-T02-search-endpoint
level: 3
summary: "GET /search endpoint'ini uygula"
type: feature
complexity: med
risk: low
context_size: small
model: auto
agent: coder
depends_on: [E01-F01-T01]
reads: ["[[catalog-api]]", "[[db-schema]]"]
touches: ["src/catalog/search.ts"]
context_budget: 10000
status: pending
attempts: 0
---

## Görev
`[[catalog-api]]`'de tanımlı tipleri kullanarak `GET /search` endpoint'ini `db-schema`'daki
`books` tablosuna karşı uygula.

## Kabul kriterleri
- Başlığa göre case-insensitive kısmi eşleşme
- Boş `q` parametresi 400 döner

## Handoff

*(Henüz çalıştırılmadı.)*
