"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { networkKeys } from "@/lib/query-keys";

/** `GET /networks` satırı (docs/03_API_CONTRACTS.md §5.3). */
export interface Network {
  id: string;
  name: string;
  chainType: "evm" | "tron";
  chainId: string;
  confirmationThreshold: number;
}

/**
 * Tüm ağları listeler (S-ADMIN-NETWORK-ASSETS). Ağın kendisi aktif/pasif olmaz;
 * aktivasyon `(network, asset)` çifti düzeyindedir (docs/03 §5.3).
 */
export function useNetworks() {
  return useQuery({
    queryKey: networkKeys.list(),
    queryFn: () => apiClient.get<Network[]>("/networks"),
  });
}
