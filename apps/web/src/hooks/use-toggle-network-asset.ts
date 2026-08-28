"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { networkAssetKeys } from "@/lib/query-keys";
import type { NetworkAsset } from "./use-network-assets";

interface ToggleVars {
  assetId: string;
  isActive: boolean;
}

interface ActivationResponse {
  networkId: string;
  assetId: string;
  isActive: boolean;
  activatedAt: string | null;
}

interface MutationContext {
  previous: NetworkAsset[] | undefined;
}

/**
 * `PATCH /admin/network-assets/:networkId/:assetId` — bir `(network, asset)`
 * çiftini aktif/pasif yapar (docs/03 §5.3, docs/06 §4.4).
 *
 * Toggle anında tetiklenir (ayrı "Kaydet" yok). Optimistic update: switch yeni
 * durumu hemen yansıtır; istek başarısız olursa `onError` cache'i snapshot'a geri
 * alır (rollback) ve çağıran hata toast'ını gösterir. `onSettled`'da liste
 * invalidate edilerek sunucu gerçeğiyle senkronlanır.
 */
export function useToggleNetworkAsset(networkId: string) {
  const queryClient = useQueryClient();
  const listKey = networkAssetKeys.list(networkId);

  return useMutation<ActivationResponse, unknown, ToggleVars, MutationContext>({
    mutationFn: ({ assetId, isActive }) =>
      apiClient.request<ActivationResponse>(
        `/admin/network-assets/${networkId}/${assetId}`,
        { method: "PATCH", body: { isActive } },
      ),
    onMutate: async ({ assetId, isActive }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<NetworkAsset[]>(listKey);
      queryClient.setQueryData<NetworkAsset[]>(listKey, (old) =>
        old?.map((asset) =>
          asset.id === assetId ? { ...asset, isActive } : asset,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}
