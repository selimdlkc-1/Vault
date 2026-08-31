import { z } from "zod";

/**
 * `POST /wallets/watch-only` istek gövdesi — tek doğruluk kaynağı
 * (`docs/03_API_CONTRACTS.md` §5.2). Aynı şema hem backend `ZodValidationPipe`'ında
 * hem watch-only ekleme formunun doğrulamasında (Faz 3 §3.5b) kullanılır.
 *
 * Adresin ağa özel format doğrulaması (EIP-55 / base58check) burada **yapılmaz** —
 * o kontrol ağ tipine bağlıdır ve `packages/chain-providers`'ın `isValidAddress`
 * yardımcısıyla servis katmanında yapılır (`docs/mimari-kararlar.md` §6 [W-001]).
 * Bu şema yalnızca yapısal doğrulama yapar.
 *
 * `.strict()` — şemada tanımlanmayan bir alan gelirse istek reddedilir
 * (mass-assignment koruması, `docs/07_SECURITY_IMPLEMENTATION.md` §6).
 */
export const createWatchOnlyWalletSchema = z
  .object({
    networkId: z.string().uuid(),
    address: z.string().min(1),
  })
  .strict();

export type CreateWatchOnlyWalletInput = z.infer<typeof createWatchOnlyWalletSchema>;

/**
 * `POST /wallets/managed` istek gövdesi — tek doğruluk kaynağı
 * (`docs/03_API_CONTRACTS.md` §5.2). Kullanıcı yalnızca ağı seçer; adres ve
 * private key backend'de HD wallet'tan türetilir (`docs/01_DOMAIN_MODEL.md`
 * §5.1). Aynı şema hem backend `ZodValidationPipe`'ında hem managed cüzdan
 * ekleme formunun doğrulamasında (Faz 4 §4.3) kullanılır.
 *
 * `.strict()` — şemada tanımlanmayan bir alan (ör. `address`, `privateKey`)
 * gelirse istek reddedilir (mass-assignment koruması,
 * `docs/07_SECURITY_IMPLEMENTATION.md` §6).
 */
export const createManagedWalletSchema = z
  .object({
    networkId: z.string().uuid(),
  })
  .strict();

export type CreateManagedWalletInput = z.infer<typeof createManagedWalletSchema>;

/** Cüzdan tipi — Prisma `wallet_type` enum'ıyla birebir (`docs/02_DATABASE_SCHEMA.md` §2.5). */
export const walletTypeSchema = z.enum(["watch_only", "managed"]);
export type WalletTypeValue = z.infer<typeof walletTypeSchema>;

/**
 * `GET /wallets` query parametreleri — tek doğruluk kaynağı
 * (`docs/03_API_CONTRACTS.md` §5.2, §1 offset sayfalama sözleşmesi). Aynı şema
 * backend `ZodValidationPipe`'ında ve cüzdan listesi ekranının (Faz 3 §3.5a)
 * sorgu anahtarında kullanılır.
 *
 * `page`/`pageSize` query string'den geldiği için `z.coerce.number()`; varsayılan
 * `page=1`, `pageSize=20`, üst sınır `100`. `userId` yalnızca Admin için
 * anlamlıdır — rol dallanması servis katmanında (`WalletsService.listWallets`).
 * `.strict()` — tanımsız query alanı reddedilir.
 */
export const listWalletsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    networkId: z.string().uuid().optional(),
    type: walletTypeSchema.optional(),
    userId: z.string().uuid().optional(),
  })
  .strict();

export type ListWalletsQuery = z.infer<typeof listWalletsQuerySchema>;
