"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  MovementDirectionValue,
  MovementSourceValue,
} from "@vault/types";
import { apiClient, type PaginationMeta } from "@/lib/api-client";
import { movementKeys } from "@/lib/query-keys";

/**
 * `GET /movements` liste satırı (`docs/03_API_CONTRACTS.md` §5.5). Bu fazda
 * `source` her zaman `'chain'` ve `state` alanı gelmez — `transfers` tablosu
 * Faz 5'e kadar yoktur (`docs/10` §3.6, `docs/mimari-kararlar.md` W-006). Şema
 * yine de iki değeri de taşır ki Faz 5 sonrası filtre/badge kodu değişmesin.
 */
export interface MovementItem {
  source: MovementSourceValue;
  txHash: string;
  direction: MovementDirectionValue;
  /** En küçük birimde (wei/sun) tutar — `BigInt` string, asla JS `number`. */
  amount: string;
  assetId: string;
  networkId: string;
  occurredAt: string;
  /** Hareketin USDT karşılığı (anlık fiyattan) veya fiyat cache'te yoksa `null`. */
  valueUsdtAtTime: string | null;
  /** Yalnızca `source: 'system'` satırlarında dolu (Faz 5 sonrası). */
  state?: string;
}

/**
 * S-MOVEMENTS filtreleri (`docs/06_SCREEN_CATALOG.md` §4.3, `docs/mimari-kararlar.md`
 * W-007). `state` bu fazda backend'de etkisizdir ama spec'e göre baştan geçirilir.
 */
export interface MovementFilters {
  walletId?: string;
  networkId?: string;
  assetId?: string;
  direction?: MovementDirectionValue;
  dateFrom?: string;
  dateTo?: string;
  state?: string;
}

export interface MovementsQuery extends MovementFilters {
  page?: number;
  pageSize?: number;
}

export interface MovementsPage {
  data: MovementItem[];
  pagination: PaginationMeta;
}

const PAGE_SIZE = 20;

/**
 * `GET /movements` — S-MOVEMENTS. Sunucu tarafı offset sayfalama; `pagination`
 * bloğu envelope'ta üst düzeyde döndüğü için `apiClient.getPaginated` kullanılır.
 * `keepPreviousData` — sayfa değişiminde tablo boşalıp titremesin.
 */
export function useMovements(query: MovementsQuery = {}) {
  const { page = 1, pageSize = PAGE_SIZE, ...filters } = query;

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (filters.walletId) params.set("walletId", filters.walletId);
  if (filters.networkId) params.set("networkId", filters.networkId);
  if (filters.assetId) params.set("assetId", filters.assetId);
  if (filters.direction) params.set("direction", filters.direction);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.state) params.set("state", filters.state);

  return useQuery({
    queryKey: movementKeys.list({ page, pageSize, ...filters }),
    queryFn: () =>
      apiClient.getPaginated<MovementItem>(`/movements?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}
