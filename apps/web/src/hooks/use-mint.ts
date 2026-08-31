"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MintInput } from "@vault/types";
import { apiClient } from "@/lib/api-client";
import { portfolioKeys, walletKeys } from "@/lib/query-keys";

/**
 * `POST /admin/mint` yanıtı — oluşturulan `MintOperation` (docs/03 §5.8,
 * MintService.MintOperationView). `amount` en küçük birimde (asset decimals) bir
 * `BigInt` string'idir.
 */
export interface MintOperationResult {
  id: string;
  adminId: string;
  walletId: string;
  assetId: string;
  amount: string;
  txHash: string;
  createdAt: string;
}

/**
 * S-ADMIN-MINT "Mint Et" aksiyonu (Faz 4 §4.4c). Mint mock kontrat üzerinden
 * senkron sürer (`tx.wait()` backend'de) — çağıran form `isPending` boyunca
 * "Mint ediliyor..." gösterir (docs/06 S-ADMIN-MINT UX state'i).
 *
 * Başarıda cüzdan/portföy sorguları invalidate edilir; bakiye ancak bir sonraki
 * `balance-sync` worker turunda (Faz 3) güncellenir, bu yüzden anlık artış
 * beklenmez — invalidation yalnızca sonraki ziyarette taze veri içindir.
 *
 * Hata eşlemesi çağıran formda: `CHAIN_PROVIDER_UNAVAILABLE`, `RESOURCE_NOT_FOUND`
 * (docs/06 S-ADMIN-MINT).
 */
export function useMint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MintInput) =>
      apiClient.post<MintOperationResult>("/admin/mint", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.all });
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    },
  });
}
