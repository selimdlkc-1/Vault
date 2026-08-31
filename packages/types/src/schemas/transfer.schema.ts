import { z } from "zod";

/**
 * Transfer durum makinesinin 8 durumu — Prisma `transfer_state` enum'ıyla birebir
 * (`docs/02_DATABASE_SCHEMA.md` §2.7, `docs/01_DOMAIN_MODEL.md` §5.2). Üçü
 * terminaldir: `confirmed`, `failed`, `dropped`.
 */
export const transferStateSchema = z.enum([
  "draft",
  "pending_signature",
  "signed",
  "broadcast",
  "confirming",
  "confirmed",
  "failed",
  "dropped",
]);
export type TransferStateValue = z.infer<typeof transferStateSchema>;

/**
 * `POST /transfers` istek gövdesi — tek doğruluk kaynağı
 * (`docs/03_API_CONTRACTS.md` §5.4). Aynı şema hem backend `ZodValidationPipe`'ında
 * hem transfer başlatma formunun doğrulamasında (Faz 5 §5.6a) kullanılır.
 *
 * `amount` en küçük birimde (wei/sun) bir tam sayı string'idir — **asla**
 * `z.number()` (sayısal tip disiplini, `.claude/rules/15-backend-data.md`,
 * `docs/mimari-kararlar.md` P-015). `^\d+$` yalnızca yapısal kontroldür; bakiye
 * yeterliliği İterasyon 2'de (`POST /transfers/:id/confirm`) kontrol edilir.
 *
 * `toAddress` yalnızca boş olmadığı doğrulanır; ağa özel format doğrulaması
 * (EIP-55 / base58check) ağ tipine bağlıdır ve `packages/chain-providers`'ın
 * `isValidAddress` yardımcısıyla servis katmanında yapılır — cross-network guard
 * ile birlikte İterasyon 2'nin kapsamındadır.
 *
 * `Idempotency-Key` header'ı bu gövdenin parçası değildir; controller onu ayrıca
 * `@Headers()` ile okur (`docs/03` §7).
 *
 * `.strict()` — şemada tanımlanmayan bir alan gelirse istek reddedilir
 * (mass-assignment koruması, `docs/07_SECURITY_IMPLEMENTATION.md` §6).
 */
export const createTransferSchema = z
  .object({
    walletId: z.string().uuid(),
    toAddress: z.string().min(1),
    assetId: z.string().uuid(),
    amount: z.string().regex(/^\d+$/, "Tutar en küçük birimde bir tam sayı olmalı"),
  })
  .strict();

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
