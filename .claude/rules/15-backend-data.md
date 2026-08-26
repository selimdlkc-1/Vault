---
paths:
  - "apps/api/prisma/**"
  - "apps/api/**/*.repository.ts"
---

# Prisma ve Repository Katmanı

Tablo/kolon isimlendirmesi `snake_case`, çoğul tablo adı, UUID primary key — bu konvansiyon ilk migration'dan itibaren tüm sonraki migration'larda korunur.

## Sayısal tip disiplini (kritik)

Zincir bakiyeleri en küçük birimde (`wei`, `sun`) `BigInt`/string olarak saklanır, **asla** JS `number`'a çevrilmez. Değerleme alanları `DECIMAL(38,18)` gibi sabit hassasiyetle tutulur.

✓ Doğru: `amount: string` (en küçük birim), Prisma şemasında `Decimal`/`BigInt` tipi.
✗ Yanlış: bakiyeyi `parseFloat()` ile JS `number`'a çevirip öyle saklamak.

## Repository sınırı

Repository yalnızca Prisma client çağrılarını sarar — hiçbir iş kuralı, hiçbir cross-module erişim içermez. Bir worker kendi repository'sini yazmaz, ilgili domain modülünün repository'sini kullanır.

## Migration disiplini

Bir kez `main`'e merge edilmiş migration **immutable**'dır — dosya düzeyinde geriye dönük düzenlenmez veya silinmez. Sorunu düzelten yeni bir migration eklenir (`fix_<açıklama>` adıyla). Yalnızca henüz merge edilmemiş, kendi branch'indeki migration `prisma migrate reset` ile geri alınabilir.

## Anti-pattern'ler

- Merge edilmiş bir migration dosyasını elle düzenlemek
- Audit yazımını transaction dışında, ayrı bir işlemde yapmak (atomiklik bozulur)

---
Detay: `docs/02_DATABASE_SCHEMA.md` §1, §7–8; `docs/04_BACKEND_SPEC.md` §7; `docs/mimari-kararlar.md` P-015
