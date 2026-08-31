import { z } from "zod";

/**
 * `admin/` modülünün paylaşılan zod şemaları (`docs/03_API_CONTRACTS.md` §5.8) —
 * `POST /admin/mint` gövdesi + `GET /admin/users` query'si. Aynı şemalar hem
 * backend `ZodValidationPipe`'ında hem S-ADMIN-MINT ekranının (Faz 4 §4.4c)
 * doğrulamasında kullanılır.
 */

/**
 * `POST /admin/mint` istek gövdesi. `amount` en küçük birimde (asset decimals'a
 * göre) bir tam sayı string'idir — asla `z.number()` (sayısal tip disiplini,
 * `docs/04_BACKEND_SPEC.md` §5, `.claude/rules/15-backend-data.md`, P-015).
 *
 * `.strict()` — şemada tanımlanmayan bir alan gelirse istek reddedilir
 * (mass-assignment koruması, `docs/07_SECURITY_IMPLEMENTATION.md` §6).
 */
export const mintSchema = z
  .object({
    walletId: z.string().uuid(),
    assetId: z.string().uuid(),
    amount: z.string().regex(/^\d+$/, "amount yalnızca rakamlardan oluşmalı"),
  })
  .strict();

export type MintInput = z.infer<typeof mintSchema>;

/**
 * `GET /admin/users` query parametreleri (`docs/03_API_CONTRACTS.md` §5.8, §1
 * offset sayfalama sözleşmesi). `email` opsiyonel, kısmi + case-insensitive
 * eşleşme için servis katmanına geçer. `page`/`pageSize` query string'den
 * geldiği için `z.coerce.number()`; varsayılan `page=1`, `pageSize=20`, üst
 * sınır `100`. `.strict()` — tanımsız query alanı reddedilir.
 */
export const listAdminUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    email: z.string().trim().min(1).optional(),
  })
  .strict();

export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;
