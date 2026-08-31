"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateManagedWalletInput } from "@vault/types";
import { apiClient } from "@/lib/api-client";
import { portfolioKeys, walletKeys } from "@/lib/query-keys";
import type { CreatedWallet } from "./use-create-watch-only-wallet";

/**
 * `POST /wallets/managed` mutation — S-WALLET-ADD-MANAGED (Faz 4 §4.3,
 * docs/03_API_CONTRACTS.md §5.2). Kullanıcı yalnızca ağı seçer; adres ve private
 * key backend'de HD wallet'tan türetilip envelope encryption ile şifrelenir. Bu
 * adım worker'a devredilmez, `POST` içinde senkron sürer — çağıran form bu yüzden
 * `isPending` boyunca "Oluşturuluyor..." gösterir (docs/06 UX state notu).
 *
 * Başarıda cüzdan + portföy sorguları invalidate edilir (yeni cüzdan liste ve
 * dashboard'da görünür); yönlendirmeyi çağıran bileşen yapar (`/wallets/[id]`).
 *
 * Hata eşlemesi çağıran formda: `NETWORK_ASSET_INACTIVE` (docs/06 S-WALLET-ADD-MANAGED).
 */
export function useCreateManagedWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateManagedWalletInput) =>
      apiClient.post<CreatedWallet>("/wallets/managed", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.all });
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
    },
  });
}
