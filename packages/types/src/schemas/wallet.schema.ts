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
