"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { portfolioKeys } from "@/lib/query-keys";

/** `GET /portfolio/summary` — varlık bazlı bakiye satırı (docs/03_API_CONTRACTS.md §5.6). */
export interface PortfolioAsset {
  assetId: string;
  symbol: string;
  balanceRaw: string;
  valueUsdt: string | null;
}

/** `GET /portfolio/summary` — cüzdan bazlı grup (docs/03_API_CONTRACTS.md §5.6). */
export interface PortfolioWallet {
  walletId: string;
  networkId: string;
  assets: PortfolioAsset[];
}

/** `GET /portfolio/summary` yanıtı (docs/03_API_CONTRACTS.md §5.6). */
export interface PortfolioSummary {
  /** `NUMERIC(38,18)` string temsili — asla JS `number` (`mimari-kararlar.md` P-015). */
  totalValueUsdt: string;
  wallets: PortfolioWallet[];
}

/**
 * `GET /portfolio/summary` — S-DASHBOARD toplam değer + cüzdan bazlı dağılım.
 * `staleTime` global 30 sn (docs/05_FRONTEND_SPEC.md §4).
 */
export function usePortfolioSummary() {
  return useQuery({
    queryKey: portfolioKeys.summary(),
    queryFn: () => apiClient.get<PortfolioSummary>("/portfolio/summary"),
  });
}
