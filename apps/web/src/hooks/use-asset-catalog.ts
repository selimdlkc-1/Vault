"use client";

import { useQueries } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { networkAssetKeys } from "@/lib/query-keys";
import type { NetworkAsset } from "./use-network-assets";
import { useNetworks } from "./use-networks";

export interface CatalogAsset {
  id: string;
  symbol: string;
  decimals: number;
  networkId: string;
}

/**
 * Tüm ağların varlıklarını tek bir `assetId → { symbol, decimals, networkId }`
 * arama tablosunda toplar. `GET /movements` yanıtı satır başına yalnızca `assetId`
 * döndürdüğünden (`docs/03_API_CONTRACTS.md` §5.5) S-MOVEMENTS'te sembol/ondalık
 * çözümü buradan yapılır. Ağ sayısı `CHAIN_ID_ALLOWLIST` ile sınırlı olduğundan
 * (`.claude/rules/00`) paralel sorgu maliyeti önemsizdir; sorgu anahtarları
 * `useNetworkAssets` ile aynı olduğu için cache paylaşılır.
 */
export function useAssetCatalog() {
  const networks = useNetworks();

  const results = useQueries({
    queries: (networks.data ?? []).map((network) => ({
      queryKey: networkAssetKeys.list(network.id),
      queryFn: () =>
        apiClient.get<NetworkAsset[]>(
          `/networks/${network.id}/assets?activeOnly=false`,
        ),
    })),
  });

  const byId = new Map<string, CatalogAsset>();
  results.forEach((result, index) => {
    const networkId = networks.data?.[index]?.id;
    if (!networkId || !result.data) return;
    for (const asset of result.data) {
      byId.set(asset.id, {
        id: asset.id,
        symbol: asset.symbol,
        decimals: asset.decimals,
        networkId,
      });
    }
  });

  return {
    byId,
    isPending: networks.isPending || results.some((r) => r.isPending),
  };
}
