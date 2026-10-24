---
id: cart
kind: knowledge
name: cart
summary: "Sepet arayüzü: Cart tipi, POST /cart/items"
scope: epic
updated_by: [E01-F02-T01, E01-F02-T02]
source_files: ["src/cart/types.ts", "src/cart/cart.ts"]
---

## Özet
Sepete ekleme arayüzü: `Cart` tipi ve `POST /cart/items` endpoint'inin sözleşmesi.

## Arayüz
```ts
export interface CartItem { bookId: string; qty: number }
export interface Cart { items: CartItem[] }
```
`POST /cart/items { bookId: string }` → `201 Cart` | `404` (bookId yoksa).

## Kararlar
Sepet oturum bazlı tutulur; kalıcılık `[[db-schema]]`'daki `carts` tablosuna yazılır.

## Dikkat
`bookId`, `[[catalog-api]]`'deki `Book.id` ile aynı ad alanını paylaşır — doğrulama şart.
