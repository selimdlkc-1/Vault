"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { portfolioKeys } from "@/lib/query-keys";

/** `GET /portfolio/history` — tek grafik noktası (docs/03_API_CONTRACTS.md §5.6). */
export interface PortfolioHistoryPoint {
  timestamp: string;
  /** `NUMERIC(38,18)` string temsili — asla JS `number`. */
  totalValueUsdt: string;
  priceSource: string;
}

export interface HistoryRange {
  /** ISO tarih-saat (backend `z.coerce.date()`). */
  dateFrom: string;
  dateTo: string;
}

/**
 * `GET /portfolio/history` — S-DASHBOARD geçmiş grafiği. Kayıtlar önceden yazılmış
 * `portfolio_snapshots`'tan okunur, sorgu anında hesaplanmaz (`mimari-kararlar.md`
 * P-016). Tarih aralığı zorunlu (`docs/03` §5.6); dashboard preset aralık geçirir.
 */
export function usePortfolioHistory(range: HistoryRange) {
  const params = new URLSearchParams({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });

  return useQuery({
    queryKey: portfolioKeys.history(range),
    queryFn: () =>
      apiClient.get<PortfolioHistoryPoint[]>(
        `/portfolio/history?${params.toString()}`,
      ),
  });
}
