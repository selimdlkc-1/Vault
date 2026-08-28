import type { PriceCacheService } from "./price-cache.service";

/**
 * `docs/mimari-kararlar.md` P-014 — testnet varlığının USDT karşılığı, USDT
 * peg'i sabit kabul edilmeden canlı fiyatlardan türetilir:
 *
 *   valueUsdt = (assetUsd / usdtUsd) × (balanceRaw / 10^decimals)
 *
 * Bu formülün ilk gerçek implementasyonu burada kurulur; İterasyon 5'in portföy
 * toplamı aynı util'i yeniden kullanır (`GET /portfolio/summary`).
 *
 * **Sayısal disiplin (`docs/mimari-kararlar.md` P-015):** hesabın hiçbir adımı JS
 * `number` aritmetiği kullanmaz. Fiyatlar decimal string olarak cache'ten okunur,
 * `BigInt` sabit-nokta (18 ondalık) aritmetiğiyle çarpılır, sonuç yine string
 * döner — `DECIMAL(38,18)` string temsili.
 *
 * **Fiyat eksikliği bilinçli olarak `null` döndürür** (iterasyon Risk notu):
 * `price-sync` worker'ı henüz ilk turunu atmamışsa (sistem yeni ayağa kalktı)
 * veya cache TTL'i dolmuşsa endpoint hata fırlatmamalı; çağıran taraf `null`'ı
 * UI'da "—" olarak gösterir.
 */

/** Sabit-nokta ölçeği — `DECIMAL(38,18)` ile hizalı 18 ondalık. */
const SCALE_DECIMALS = 18;
const SCALE = 10n ** BigInt(SCALE_DECIMALS);

/**
 * `"3456.78"` gibi bir decimal string'i 18 ondalıkla ölçeklenmiş `BigInt`'e
 * çevirir. Biçim beklenmedikse (ör. bilimsel gösterim, harf) `null` döner —
 * çağıran bunu "fiyat yok" gibi ele alır, exception'a çevirmez.
 */
function parseDecimalToScaled(input: string): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) {
    return null;
  }
  const [, sign, intPart, fracPartRaw = ""] = match;
  const fracPart = fracPartRaw.slice(0, SCALE_DECIMALS).padEnd(SCALE_DECIMALS, "0");
  const scaled = BigInt(`${intPart}${fracPart}`);
  return sign === "-" ? -scaled : scaled;
}

/** 18 ondalıkla ölçeklenmiş bir `BigInt`'i sabit `"tam.kesir"` string'ine çevirir. */
function formatScaled(value: bigint): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(SCALE_DECIMALS + 1, "0");
  const intPart = digits.slice(0, digits.length - SCALE_DECIMALS);
  const fracPart = digits.slice(digits.length - SCALE_DECIMALS);
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

/**
 * Bir `(balanceRaw, decimals, assetSymbol)` üçlüsünün USDT karşılığını hesaplar.
 *
 * @param balanceRaw En küçük birimde (wei/sun) bakiye — `BigInt` string.
 * @param decimals Varlığın ondalık basamak sayısı (`assets.decimals`).
 * @param assetSymbol `ASSET_PRICE_MAP` / `assets.symbol` ile birebir sembol (ör. `"ETH"`).
 * @param priceCache 60 sn TTL'li fiyat cache'i (`price-sync` worker'ı yazar).
 * @returns USDT değeri (18 ondalıklı decimal string) veya fiyat cache'te yoksa `null`.
 */
export async function calculateUsdtValue(
  balanceRaw: string,
  decimals: number,
  assetSymbol: string,
  priceCache: PriceCacheService,
): Promise<string | null> {
  const [assetUsdRaw, usdtUsdRaw] = await Promise.all([
    priceCache.get(assetSymbol),
    priceCache.get("USDT"),
  ]);

  if (assetUsdRaw === null || usdtUsdRaw === null) {
    return null;
  }

  const assetUsdScaled = parseDecimalToScaled(assetUsdRaw);
  const usdtUsdScaled = parseDecimalToScaled(usdtUsdRaw);
  if (assetUsdScaled === null || usdtUsdScaled === null || usdtUsdScaled === 0n) {
    return null;
  }

  let balance: bigint;
  try {
    balance = BigInt(balanceRaw);
  } catch {
    return null;
  }

  // amountScaled = varlık miktarı × 10^18  (en küçük birimden tam birime)
  const amountScaled = (balance * SCALE) / 10n ** BigInt(decimals);
  // valueScaled = (assetUsd·S) × (amount·S) ÷ (usdtUsd·S) = valueUsdt · S
  const valueScaled = (assetUsdScaled * amountScaled) / usdtUsdScaled;

  return formatScaled(valueScaled);
}
