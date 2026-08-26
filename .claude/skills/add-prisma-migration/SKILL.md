---
name: add-prisma-migration
description: Step-by-step procedure for adding or changing a Prisma schema migration — naming convention, numeric type discipline (BigInt/Decimal, never float), rollback rule for already-merged migrations. Use when the user asks to add a table/column, change a schema, or write a migration. Do NOT use for seed data changes only (edit apps/api/prisma/seed.ts directly) or for a migration that has already been merged to main (see rollback rule in step 3 instead — never edit a merged migration file).
---

# Prisma Migration Ekleme Prosedürü

5 adım.

## 1. Şema değişikliği

`apps/api/prisma/schema.prisma` içinde `snake_case` tablo/kolon, çoğul tablo adı, UUID PK konvansiyonunu koru. Zincir bakiyesi/tutar alanı ekliyorsan `Decimal`/`BigInt` kullan — asla `Float`/`Int` ile parasal/bakiye değeri tutma.

## 2. Migration oluştur

```
pnpm --filter api exec prisma migrate dev --name <açıklama>
```

İsimlendirme: `<eylem>_<varlık>` (ör. `add_transfer_state_events`, `fix_wallet_index`).

## 3. Rollback kuralı

Henüz merge edilmemiş, kendi branch'indeki migration `prisma migrate reset` ile geri alınabilir. **Merge edilmiş bir migration asla düzenlenmez/silinmez** — sorunu düzelten yeni bir `fix_<açıklama>` migration'ı eklenir.

## 4. Mevcut veriyi etkileyen değişiklik

Kolon tipi değişikliği veya zorunlu alan ekleme gibi mevcut veriyi etkileyen bir migration ise, PR açıklamasında geri alma etkisi açıkça belirtilir — bu bir human gate maddesidir, kullanıcı onayı ayrıca beklenir.

## 5. Dokümantasyon

- [ ] `docs/02_DATABASE_SCHEMA.md` ilgili tablo tanımı güncellendi

---
Detay: `docs/02_DATABASE_SCHEMA.md` §8; `docs/09_DEV_WORKFLOW.md` §8; `docs/mimari-kararlar.md` P-015
