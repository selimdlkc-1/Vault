import type { PriceCacheService } from "./price-cache.service";
import { calculateUsdtValue } from "./usdt-conversion.util";

/**
 * `docs/mimari-kararlar.md` P-014 — `ETH/USDT = (ETH/USD) ÷ (USDT/USD)`.
 * `docs/08_TESTING_STRATEGY.md` §3 (kritik modül civarı — fiyat türetme yolu).
 */
function priceCache(prices: Record<string, string | null>): PriceCacheService {
  return {
    get: jest.fn((symbol: string) => Promise.resolve(prices[symbol] ?? null)),
  } as unknown as PriceCacheService;
}

describe("calculateUsdtValue", () => {
  it("normal hesap: 1 ETH, ETH=2000 USD, USDT=1 USD → 2000", async () => {
    const value = await calculateUsdtValue(
      "1000000000000000000", // 1e18 wei = 1 ETH
      18,
      "ETH",
      priceCache({ ETH: "2000", USDT: "1" }),
    );
    expect(value).toBe("2000.000000000000000000");
  });

  it("USDT peg'i 1 değil: ETH=2000, USDT=0.5 → 1 ETH = 4000 USDT", async () => {
    const value = await calculateUsdtValue(
      "1000000000000000000",
      18,
      "ETH",
      priceCache({ ETH: "2000", USDT: "0.5" }),
    );
    expect(value).toBe("4000.000000000000000000");
  });

  it("6 ondalıklı varlık (USDT): 1.5 USDT bakiyesi → ~1.5 USDT değer", async () => {
    const value = await calculateUsdtValue(
      "1500000", // 1.5 * 1e6
      6,
      "USDT",
      priceCache({ USDT: "1.0004" }),
    );
    // (1.0004 / 1.0004) * 1.5 = 1.5
    expect(value).toBe("1.500000000000000000");
  });

  it("kesirli fiyat ve bakiye: 0.25 ETH, ETH=1234.5, USDT=1 → 308.625", async () => {
    const value = await calculateUsdtValue(
      "250000000000000000", // 0.25e18
      18,
      "ETH",
      priceCache({ ETH: "1234.5", USDT: "1" }),
    );
    expect(value).toBe("308.625000000000000000");
  });

  it("sıfır bakiye → 0 (fiyat eksik değil, hesap yapılır)", async () => {
    const value = await calculateUsdtValue(
      "0",
      18,
      "ETH",
      priceCache({ ETH: "2000", USDT: "1" }),
    );
    expect(value).toBe("0.000000000000000000");
  });

  it("varlık fiyatı cache'te yoksa → null (worker henüz turlamadı, hata fırlatmaz)", async () => {
    const value = await calculateUsdtValue(
      "1000000000000000000",
      18,
      "ETH",
      priceCache({ USDT: "1" }),
    );
    expect(value).toBeNull();
  });

  it("USDT fiyatı cache'te yoksa → null", async () => {
    const value = await calculateUsdtValue(
      "1000000000000000000",
      18,
      "ETH",
      priceCache({ ETH: "2000" }),
    );
    expect(value).toBeNull();
  });

  it("USDT fiyatı 0 ise → null (sıfıra bölme yok)", async () => {
    const value = await calculateUsdtValue(
      "1000000000000000000",
      18,
      "ETH",
      priceCache({ ETH: "2000", USDT: "0" }),
    );
    expect(value).toBeNull();
  });

  it("bozuk fiyat string'i (bilimsel gösterim) → null", async () => {
    const value = await calculateUsdtValue(
      "1000000000000000000",
      18,
      "ETH",
      priceCache({ ETH: "2e3", USDT: "1" }),
    );
    expect(value).toBeNull();
  });

  it("büyük bakiye taşma yaşamaz (BigInt aritmetiği)", async () => {
    // 1_000_000 ETH
    const value = await calculateUsdtValue(
      "1000000000000000000000000",
      18,
      "ETH",
      priceCache({ ETH: "3500.75", USDT: "1" }),
    );
    expect(value).toBe("3500750000.000000000000000000");
  });
});
