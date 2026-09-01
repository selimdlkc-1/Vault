"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  confirmTransferSchema,
  type ConfirmTransferInput,
  type TransferStateValue,
} from "@vault/types";
import { apiClient } from "@/lib/api-client";
import { transferKeys } from "@/lib/query-keys";

/** `POST /transfers/:id/confirm` yanıtı (`docs/03_API_CONTRACTS.md` §5.4). */
export interface ConfirmTransferResult {
  state: TransferStateValue;
}

/**
 * S-TRANSFER-CONFIRM "Onayla ve Gönder" aksiyonu (Faz 5 §5.6b, step-up
 * authentication — `docs/mimari-kararlar.md` SEC-008). Kullanıcı mevcut şifresini
 * tekrar girer; backend doğrulamadan `draft → pending_signature` geçişine izin
 * vermez.
 *
 * Aynı zod şeması hem burada hem backend `ZodValidationPipe`'ında kullanılır
 * (`packages/types` — tek kaynak). Başarıda transfer sorgusu invalidate edilir;
 * `useTransfer` yeniden fetch ederek aynı sayfada S-TRANSFER-DETAIL görünümüne
 * geçilmesini sağlar.
 *
 * Hata eşlemesi çağıran formda (`docs/06` S-TRANSFER-CONFIRM):
 * `AUTH_STEP_UP_REQUIRED` (yalnızca şifre alanı sıfırlanır),
 * `WALLET_INSUFFICIENT_BALANCE`, `TRANSFER_INVALID_TRANSITION`.
 */
export function useConfirmTransfer(transferId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConfirmTransferInput) =>
      apiClient.post<ConfirmTransferResult>(
        `/transfers/${transferId}/confirm`,
        confirmTransferSchema.parse(input),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: transferKeys.detail(transferId),
      });
    },
  });
}
