"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { transferKeys, walletKeys } from "@/lib/query-keys";

/**
 * S-TRANSFER-CONFIRM "İptal Et" aksiyonu (Faz 5 §5.6b). `DELETE /transfers/:id` —
 * yalnızca `draft` durumundaki kendi transfer'i silinebilir
 * (`docs/03_API_CONTRACTS.md` §5.4, `docs/mimari-kararlar.md` W-005). Başarıda
 * `204`; çağıran bileşen `/wallets`'a döner.
 *
 * `draft` değilse backend `409 TRANSFER_INVALID_TRANSITION` döner — bu, durumun
 * başka yerden değiştiği anlamına gelir; çağıran sayfa `useTransfer`'ı invalidate
 * edip S-TRANSFER-DETAIL görünümüne düşer.
 */
export function useDeleteTransfer(transferId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.request<void>(`/transfers/${transferId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: transferKeys.detail(transferId) });
      void queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });
}
