import { z } from "zod";

/**
 * `PATCH /admin/network-assets/:networkId/:assetId` istek gövdesi — tek doğruluk
 * kaynağı (`docs/03_API_CONTRACTS.md` §5.3). Aynı şema hem backend
 * `ZodValidationPipe`'ında hem admin ekranının mutation'ında (Faz 2 §2.4) kullanılır.
 *
 * `(networkId, assetId)` çifti path parametresidir; gövdede yalnızca yeni
 * aktivasyon durumu taşınır.
 *
 * `.strict()` — şemada tanımlanmayan bir alan gelirse istek reddedilir
 * (mass-assignment koruması, `docs/07_SECURITY_IMPLEMENTATION.md` §6).
 */
export const patchNetworkAssetSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export type PatchNetworkAssetInput = z.infer<typeof patchNetworkAssetSchema>;
