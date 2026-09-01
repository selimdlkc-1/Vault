"use client";

import { useMutation } from "@tanstack/react-query";
import type { CreateTransferInput, TransferStateValue } from "@vault/types";
import { apiClient } from "@/lib/api-client";

/**
 * `POST /transfers` yanıtı — oluşturulan `Transfer` (`state: 'draft'`,
 * `docs/03_API_CONTRACTS.md` §5.4, backend `TransferView` ile birebir).
 */
export interface CreatedTransfer {
  id: string;
  walletId: string;
  networkId: string;
  assetId: string;
  toAddress: string;
  /** En küçük birimde (wei/sun) BigInt string. */
  amount: string;
  state: TransferStateValue;
  txHash: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * S-TRANSFER-NEW "Devam Et" aksiyonu (Faz 5 §5.6a, `docs/03_API_CONTRACTS.md`
 * §5.4 + §7). Draft transfer oluşturur; başarıda çağıran bileşen
 * `/transfers/[id]`'e (İterasyon 7'nin onay adımı) yönlendirir.
 *
 * `Idempotency-Key` header'ı **her** `mutateAsync` çağrısında yeniden
 * `crypto.randomUUID()` ile üretilir: kullanıcının formu düzeltip tekrar
 * göndermesi yeni bir taslak denemesidir, önceki başarısız denemenin anahtarı
 * tekrar kullanılmaz (`docs/03` §7 — istemci-tarafı idempotency yalnızca aynı
 * isteğin ağ-kesintisi retry'ı içindir, bu form onu üretmez).
 *
 * Hata eşlemesi çağıran formda: `WALLET_CROSS_NETWORK_MISMATCH`,
 * `NETWORK_ASSET_INACTIVE`, `VALIDATION_FAILED` (docs/06 S-TRANSFER-NEW).
 */
export function useCreateTransfer() {
  return useMutation({
    mutationFn: (input: CreateTransferInput) =>
      apiClient.post<CreatedTransfer>("/transfers", input, {
        "Idempotency-Key": crypto.randomUUID(),
      }),
  });
}
