---
id: E01-F01-T01
kind: task
name: F01-T01-define-search-types
level: 3
summary: "Book tipi ve arama arayüzünü tanımla"
type: feature
complexity: low
risk: low
context_size: small
model: auto
agent: coder
depends_on: []
reads: []
touches: ["src/catalog/types.ts"]
context_budget: 6000
status: done
attempts: 1
---

## Görev
`Book` tipini ve `GET /search` endpoint'inin girdi/çıktı sözleşmesini tanımla. Bu feature'ın
interface-first görevi — sonraki görevler buna bağlanır.

## Kabul kriterleri
- `Book` tipi `id`, `title`, `author` alanlarını içerir
- Arama girdi/çıktı tipleri dışa aktarılmış (export edilmiş)

## Handoff

**Oluşturulan/değişen dosyalar:** `src/catalog/types.ts` (yeni)

**Public arayüz:**
```ts
export interface Book { id: string; title: string; author: string }
export interface SearchQuery { q: string }
export interface SearchResult { books: Book[] }
```

**Kararlar:** Arama şimdilik sadece başlık üzerinden; yazar araması kapsam dışı (ileride eklenebilir).

**Bilgi düğümü güncellemeleri:** `[[catalog-api]]` oluşturuldu — `Book` tipi ve arama sözleşmesi.
