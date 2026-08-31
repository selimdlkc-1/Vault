/**
 * Deploy edilecek mock token kataloğu.
 *
 * Yalnızca kontrat-tabanlı varlıklar burada yer alır — native varlıklar
 * (ETH / BNB / TRX) kontrat adresi taşımaz, `assets.contract_address` NULL kalır
 * (docs/02_DATABASE_SCHEMA.md §2.3). `symbol` / `decimals` değerleri
 * `apps/api/prisma/seed.ts` içindeki `assets` kataloğuyla birebir eşleşmelidir.
 */
export interface MockToken {
  /** `assets.symbol` ile eşleşir */
  symbol: string;
  /** ERC-20 `name()` — yalnızca kozmetik */
  name: string;
  /** `assets.decimals` ile eşleşir */
  decimals: number;
}

/** Her EVM ağı (Sepolia, BSC Testnet) için aynı token seti deploy edilir. */
export const EVM_TOKENS: readonly MockToken[] = [
  { symbol: "USDT", name: "Mock Tether USD", decimals: 6 },
];

/** Tron Shasta için token seti (şu an EVM ile aynı). */
export const TRON_TOKENS: readonly MockToken[] = [
  { symbol: "USDT", name: "Mock Tether USD", decimals: 6 },
];
