---
id: db-schema
kind: knowledge
name: db-schema
summary: "Veritabanı şeması: books, carts tabloları"
scope: shared
updated_by: [E01-F01-T02, E01-F02-T02]
source_files: ["migrations/001_books.sql", "migrations/002_carts.sql"]
---

## Özet
İki epic'in de kullandığı paylaşılan şema: `books` ve `carts` tabloları.

## Arayüz
```sql
books(id uuid pk, title text, author text)
carts(id uuid pk, user_session text, book_id uuid fk->books.id, qty int)
```

## Kararlar
Sepet kalıcılığı için kullanıcı hesabı yok; `user_session` ile oturum bazlı tutuluyor.

## Dikkat
`carts.book_id` için foreign key var — `books` tablosunda olmayan `bookId` eklenmeye
çalışılırsa veritabanı seviyesinde de reddedilir (uygulama 404'ü buna ek bir koruma).
