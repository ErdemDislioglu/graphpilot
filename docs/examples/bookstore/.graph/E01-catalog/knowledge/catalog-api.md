---
id: catalog-api
kind: knowledge
name: catalog-api
summary: "Katalog arama arayüzü: Book tipi, GET /search"
scope: epic
updated_by: [E01-F01-T01, E01-F01-T02]
source_files: ["src/catalog/types.ts", "src/catalog/search.ts"]
---

## Özet
Kitap arama arayüzü: `Book` tipi ve `GET /search` endpoint'inin sözleşmesi.

## Arayüz
```ts
export interface Book { id: string; title: string; author: string }
export interface SearchQuery { q: string }
export interface SearchResult { books: Book[] }
```
`GET /search?q=<string>` → `SearchResult`. Boş `q` → 400.

## Kararlar
Arama sadece başlık üzerinden; yazar araması kapsam dışı.

## Dikkat
`q` parametresi case-insensitive kısmi eşleşir — tam eşleşme beklemeyin.
