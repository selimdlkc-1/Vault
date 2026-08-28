"use client";

import { useQuery } from "@tanstack/react-query";
import type { WalletTypeValue } from "@vault/types";
import { apiClient } from "@/lib/api-client";
import { walletKeys } from "@/lib/query-keys";

/** `GET /wallets` liste satırındaki varlık bakiyesi (docs/03_API_CONTRACTS.md §5.2). */
export interface WalletBalance {
  assetId: string;
  symbol: string;
  /** En küçük birimde (wei/sun) bakiye — `BigInt` string, asla JS `number`. */
  balanceRaw: string;
  /** USDT karşılığı (18 ondalıklı decimal string) veya fiyat cache'te yoksa `null`. */
  valueUsdt: string | null;
}

/** `GET /wallets` liste satırı (docs/03_API_CONTRACTS.md §5.2). */
export interface WalletListItem {
  id: string;
  type: WalletTypeValue;
  networkId: string;
  address: string;
  createdAt: string;
  balances: WalletBalance[];
}

export interface WalletFilters {
  networkId?: string;
  type?: WalletTypeValue;
}

/**
 * `GET /wallets` — kullanıcının cüzdanları (S-WALLET-LIST, S-DASHBOARD).
 * `staleTime` global 30 sn (docs/05_FRONTEND_SPEC.md §4). `pageSize=100` —
 * demo ölçeğinde tek sayfa yeterli, `api-client` yalnızca `data` dizisini döner.
 */
export function useWallets(filters: WalletFilters = {}) {
  const params = new URLSearchParams({ pageSize: "100" });
  if (filters.networkId) params.set("networkId", filters.networkId);
  if (filters.type) params.set("type", filters.type);

  return useQuery({
    queryKey: walletKeys.list(filters),
    queryFn: () =>
      apiClient.get<WalletListItem[]>(`/wallets?${params.toString()}`),
  });
}
