/**
 * TanStack Query key fabrikası (docs/05_FRONTEND_SPEC.md §4). Key'ler bileşen
 * içinde elle string olarak yazılmaz — invalidation'ı tutarlı tutmak için hepsi
 * buradan üretilir.
 */
export const networkKeys = {
  all: ["networks"] as const,
  list: () => [...networkKeys.all, "list"] as const,
};

export const networkAssetKeys = {
  all: ["network-assets"] as const,
  list: (networkId: string) =>
    [...networkAssetKeys.all, networkId, { activeOnly: false }] as const,
};

/** Cüzdan sorguları (`GET /wallets`, `GET /wallets/:id`). */
export const walletKeys = {
  all: ["wallets"] as const,
  list: (filters: { networkId?: string; type?: string } = {}) =>
    [...walletKeys.all, "list", filters] as const,
  detail: (id: string) => [...walletKeys.all, "detail", id] as const,
};

/** Hareket geçmişi sorguları (`GET /movements`). */
export const movementKeys = {
  all: ["movements"] as const,
  list: (filters: Record<string, string | number | undefined> = {}) =>
    [...movementKeys.all, "list", filters] as const,
};

/** Portföy sorguları (`GET /portfolio/summary`, `GET /portfolio/history`). */
export const portfolioKeys = {
  all: ["portfolio"] as const,
  summary: () => [...portfolioKeys.all, "summary"] as const,
  history: (range: { dateFrom: string; dateTo: string }) =>
    [...portfolioKeys.all, "history", range] as const,
};
