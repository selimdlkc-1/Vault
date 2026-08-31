"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { walletKeys } from "@/lib/query-keys";
import type { WalletListItem } from "./use-wallets";

/**
 * S-ADMIN-MINT cüzdan seçim alanı (Faz 4 §4.4c). `GET /wallets?userId=<seçiliUser>`
 * — bu endpoint Faz 3 §3.4a'da zaten Admin-farkında (`?userId=`) teslim edildi
 * (docs/03 §5.2), yeni bir endpoint gerektirmez. Yalnızca bir kullanıcı seçiliyken
 * `enabled` — kullanıcı seçilmeden cüzdan alanı zaten devre dışıdır (docs/06
 * S-ADMIN-MINT UX state'i).
 *
 * `pageSize=100` — demo ölçeğinde bir kullanıcının tüm cüzdanları tek sayfada.
 */
export function useAdminUserWallets(userId: string | null) {
  return useQuery({
    queryKey: walletKeys.list({ userId: userId ?? undefined }),
    queryFn: () =>
      apiClient.get<WalletListItem[]>(
        `/wallets?userId=${encodeURIComponent(userId ?? "")}&pageSize=100`,
      ),
    enabled: userId !== null,
  });
}
