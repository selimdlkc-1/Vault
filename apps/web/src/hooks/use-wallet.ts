"use client";

import { useQuery } from "@tanstack/react-query";
import type { WalletTypeValue } from "@vault/types";
import { apiClient } from "@/lib/api-client";
import { walletKeys } from "@/lib/query-keys";
import type { WalletBalance } from "./use-wallets";

/**
 * `GET /wallets/:id` yanıtı (docs/03_API_CONTRACTS.md §5.2). Liste satırıyla aynı
 * alanlar + son 5 zincir hareketi. `chainMovements` İterasyon 8 (`chain_movements`
 * tablosu + `movement-index` worker) tamamlanana kadar backend her zaman boş dizi
 * döner — bu ekran o durumu "hareket yok" olarak render eder.
 */
export interface WalletDetail {
  id: string;
  type: WalletTypeValue;
  networkId: string;
  address: string;
  createdAt: string;
  balances: WalletBalance[];
  chainMovements: unknown[];
}

/**
 * `GET /wallets/:id` — S-WALLET-DETAIL. `retry: false` — `RESOURCE_NOT_FOUND` /
 * `FORBIDDEN_NOT_OWNER` gibi kalıcı hatalar tekrar denenmez, ekran bunları özel
 * durum olarak ele alır (404 mesajı / geçici `/dashboard` yönlendirmesi).
 */
export function useWallet(id: string) {
  return useQuery({
    queryKey: walletKeys.detail(id),
    queryFn: () => apiClient.get<WalletDetail>(`/wallets/${id}`),
    retry: false,
  });
}
