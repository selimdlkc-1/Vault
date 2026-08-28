/**
 * Testnet varlık sembolü → CoinGecko id eşlemesi (`docs/mimari-kararlar.md` I-010).
 *
 * Testnet varlığının kendi fiyatı yoktur; değerlemesi mainnet muadilinin
 * fiyatından türetilir (ör. Sepolia ETH ≈ mainnet `ethereum`). Bu tablo
 * `docs/02_DATABASE_SCHEMA.md` §2.2 `assets.coingecko_id` kolonunun kod
 * tarafındaki sabit karşılığıdır — seed bu kolonu aynı değerlerle doldurur
 * (`apps/api/prisma/seed.ts`).
 *
 * Anahtarlar `assets.symbol` ile birebir aynıdır; birden çok ağdaki aynı
 * sembol (Sepolia USDT, Tron USDT) tek bir CoinGecko id'ye (`tether`) düşer.
 * USDT peg'i sabit kabul edilmez — `tether` fiyatı da canlı çekilir
 * (`docs/mimari-kararlar.md` P-014).
 *
 * Tablo genişletilmez: yeni bir satır yeni bir varlık/ağ desteği demektir ve
 * ilgili seed + ADR ile birlikte gelir.
 */
export const ASSET_PRICE_MAP: Readonly<Record<string, string>> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  TRX: "tron",
  USDT: "tether",
};

/** `ASSET_PRICE_MAP`'te tanımlı varlık sembolleri. */
export type PricedAssetSymbol = keyof typeof ASSET_PRICE_MAP;
