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
