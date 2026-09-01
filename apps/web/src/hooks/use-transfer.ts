"use client";

import { useQuery } from "@tanstack/react-query";
import type { TransferStateValue } from "@vault/types";
import { apiClient } from "@/lib/api-client";
import { transferKeys } from "@/lib/query-keys";

/** Terminal durumlar — polling bu durumlarda durur (`docs/01_DOMAIN_MODEL.md` §5.2). */
const TERMINAL_STATES: readonly TransferStateValue[] = [
  "confirmed",
  "failed",
  "dropped",
];

const POLL_INTERVAL_MS = 5_000;

/** `GET /transfers/:id` yanıtındaki tek denetim izi kaydı (`docs/03` §5.4). */
export interface TransferStateEvent {
  fromState: TransferStateValue | null;
  toState: TransferStateValue;
  /** `'user'` | `'system'` | `'worker:<name>'`. */
  actor: string;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
}

/**
 * `GET /transfers/:id` yanıtı — transfer detay + tam denetim izi
 * (`docs/03_API_CONTRACTS.md` §5.4, backend `TransferDetailView` ile birebir).
 */
export interface TransferDetail {
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
  stateEvents: TransferStateEvent[];
}

export function isTerminalState(state: TransferStateValue): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * `GET /transfers/:id` — S-TRANSFER-CONFIRM (transfer `draft` iken) ve
 * S-TRANSFER-DETAIL (diğer durumlar) tek sorgu üzerinden beslenir.
 *
 * Polling (`docs/05_FRONTEND_SPEC.md`): terminal olmayan durumda 5 sn'de bir
 * yeniden çekilir; `confirmed`/`failed`/`dropped`'a ulaşınca `refetchInterval`
 * `false` döner ve polling **durur** (fonksiyon formu her fetch sonrası yeniden
 * değerlendirilir — ayrı bir `useEffect`/interval yazılmaz). Arka plan yenilemesi
 * sessizdir: aynı query key'e yapılan refetch mevcut veriyi ekranda tutar,
 * `isPending` yalnızca ilk yüklemede `true`'dur.
 *
 * `retry: false` — `RESOURCE_NOT_FOUND` / `FORBIDDEN_NOT_OWNER` kalıcı hataları
 * tekrar denenmez; ekran bunları özel durum olarak ele alır (`useWallet` kalıbı).
 */
export function useTransfer(id: string) {
  return useQuery({
    queryKey: transferKeys.detail(id),
    queryFn: () => apiClient.get<TransferDetail>(`/transfers/${id}`),
    retry: false,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state && isTerminalState(state)) return false;
      return POLL_INTERVAL_MS;
    },
  });
}
