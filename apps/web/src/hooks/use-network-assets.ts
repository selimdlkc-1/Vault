"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { networkAssetKeys } from "@/lib/query-keys";

/** `GET /networks/:networkId/assets` satırı (docs/03_API_CONTRACTS.md §5.3). */
export interface NetworkAsset {
  id: string;
  symbol: string;
  decimals: number;
  contractAddress: string | null;
  isActive: boolean;
}

/**
 * Bir ağın varlıklarını aktivasyon durumuyla listeler. Admin panelinden çağrıldığı
 * için `activeOnly=false` — pasif çiftler de görünür (docs/03 §5.3, docs/06 §4.4).
 */
export function useNetworkAssets(networkId: string) {
  return useQuery({
    queryKey: networkAssetKeys.list(networkId),
    queryFn: () =>
      apiClient.get<NetworkAsset[]>(
        `/networks/${networkId}/assets?activeOnly=false`,
      ),
  });
}
