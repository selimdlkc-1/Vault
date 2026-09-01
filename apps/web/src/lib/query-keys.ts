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
  list: (filters: { networkId?: string; type?: string; userId?: string } = {}) =>
    [...walletKeys.all, "list", filters] as const,
  detail: (id: string) => [...walletKeys.all, "detail", id] as const,
};

/**
 * Admin kullanıcı arama sorguları (`GET /admin/users`). S-ADMIN-MINT'in kullanıcı
 * seçim alanı (Faz 4 §4.4c) — arama terimi anahtarın parçasıdır, debounce'lanmış
 * değerle çağrılır.
 */
export const adminUserKeys = {
  all: ["admin-users"] as const,
  search: (email: string) => [...adminUserKeys.all, "search", email] as const,
};

/** Transfer sorguları (`GET /transfers/:id`). */
export const transferKeys = {
  all: ["transfers"] as const,
  detail: (id: string) => [...transferKeys.all, "detail", id] as const,
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
