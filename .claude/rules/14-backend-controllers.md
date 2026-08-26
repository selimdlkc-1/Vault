---
paths:
  - "apps/api/**/*.controller.ts"
---

# Backend Controllers

Controller yalnızca HTTP sınırını yönetir: DTO doğrulama sonucu servise iletilir, servisin döndürdüğü sonuç response envelope'una sarılır.

## DTO ve validation

Her endpoint zod/class-validator tabanlı bir DTO ile `ValidationPipe(whitelist: true, forbidNonWhitelisted: true)` kullanır — tanımsız alan içeren istek reddedilir. DTO şemaları mümkün olduğunca `packages/types`'tan paylaşılır (frontend ile aynı zod şeması).

✓ Doğru: `CreateTransferDto`, `packages/types`'taki zod şemasından türetilir.
✗ Yanlış: controller içinde manuel `if (!body.amount) throw ...` doğrulaması.

## Response envelope ve hata

Tüm başarılı yanıtlar ortak envelope formatını kullanır; hatalar `error.code` (`UPPER_SNAKE_CASE`) + `error.message` taşır (bkz. `02-language-naming.md`). Controller, servisten fırlatılan domain hatasını yakalayıp HTTP status'a çevirmekten sorumludur — hatanın kendisini üretmez.

## Anti-pattern'ler

- Controller içinde iş kuralı veya doğrudan repository/Prisma çağrısı
- Aynı endpoint için hem DTO hem manuel validation yazmak
- Servis katmanını atlayıp `IChainProvider`'a doğrudan erişmek

---
Detay: `docs/03_API_CONTRACTS.md` §1–2; `docs/04_BACKEND_SPEC.md` §5–6
