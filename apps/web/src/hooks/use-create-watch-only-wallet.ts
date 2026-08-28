"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateWatchOnlyWalletInput } from "@vault/types";
import { apiClient } from "@/lib/api-client";
import { portfolioKeys, walletKeys } from "@/lib/query-keys";

/** `POST /wallets/watch-only` yanıtı — oluşturulan cüzdan (docs/03_API_CONTRACTS.md §5.2). */
export interface CreatedWallet {
  id: string;
  userId: string;
  networkId: string;
  type: "watch_only" | "managed";
  address: string;
  createdAt: string;
}

/**
 * `POST /wallets/watch-only` mutation — S-WALLET-ADD-WATCHONLY. Başarıda cüzdan
 * ve portföy sorguları invalidate edilir (yeni cüzdan liste/dashboard'da görünür);
 * yönlendirmeyi çağıran bileşen yapar (`/wallets/[id]`).
 *
 * Hata eşlemesi çağıran formda: `WALLET_ADDRESS_INVALID_FORMAT` /
 * `NETWORK_ASSET_INACTIVE` / `WALLET_ADDRESS_ALREADY_EXISTS` (docs/06 §4.2).
 */
export function useCreateWatchOnlyWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWatchOnlyWalletInput) =>
      apiClient.post<CreatedWallet>("/wallets/watch-only", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.all });
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    },
  });
}
