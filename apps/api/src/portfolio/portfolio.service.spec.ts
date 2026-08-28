import type { PortfolioSnapshot } from "@prisma/client";
import { ValidationFailedException } from "../common/exceptions/domain.exception";
import type { PriceCacheService } from "../common/price-cache.service";
import type { PortfolioRepository, PortfolioWallet } from "./portfolio.repository";
import { PortfolioService } from "./portfolio.service";

/** Fiyat cache'i stub'ı — sembol → USD string map'i. Tanımsız sembol `null`. */
function fakePriceCache(prices: Record<string, string> = {}): PriceCacheService {
  return {
    get: jest.fn((symbol: string) => Promise.resolve(prices[symbol] ?? null)),
  } as unknown as PriceCacheService;
}

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEPOLIA_ID = "22222222-2222-4222-8222-222222222222";
const SHASTA_ID = "33333333-3333-4333-8333-333333333333";

function walletRow(
  overrides: Partial<PortfolioWallet> = {},
  balanceCaches: PortfolioWallet["balanceCaches"] = [],
): PortfolioWallet {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    userId: USER_ID,
    networkId: SEPOLIA_ID,
    type: "watch_only",
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    derivationIndex: null,
    encryptedDek: null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    balanceCaches,
    ...overrides,
  } as PortfolioWallet;
}

function cache(
  assetId: string,
  symbol: string,
  decimals: number,
  balanceRaw: string,
): PortfolioWallet["balanceCaches"][number] {
  return {
    walletId: "99999999-9999-4999-8999-999999999999",
    assetId,
    balanceRaw,
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    asset: {
      id: assetId,
      networkId: SEPOLIA_ID,
      symbol,
      decimals,
      contractAddress: null,
      coingeckoId: symbol.toLowerCase(),
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    },
  } as PortfolioWallet["balanceCaches"][number];
}

describe("PortfolioService.getSummary", () => {
  let repository: jest.Mocked<
    Pick<PortfolioRepository, "findWalletsWithBalancesByUser">
  >;

  function service(prices: Record<string, string>): PortfolioService {
    return new PortfolioService(
      repository as unknown as PortfolioRepository,
      fakePriceCache(prices),
    );
  }

  beforeEach(() => {
    repository = { findWalletsWithBalancesByUser: jest.fn() };
  });

  it("tüm cüzdan/varlık değerlerini toplar, DECIMAL(38,18) string döner", async () => {
    repository.findWalletsWithBalancesByUser.mockResolvedValue([
      walletRow({ id: "w1", networkId: SEPOLIA_ID }, [
        cache("a-eth", "ETH", 18, "1000000000000000000"), // 1 ETH
        cache("a-usdt", "USDT", 6, "500000000"), // 500 USDT
      ]),
      walletRow({ id: "w2", networkId: SHASTA_ID }, [
        cache("a-trx", "TRX", 6, "1000000000"), // 1000 TRX
      ]),
    ]);

    const result = await service({
      ETH: "2000",
      USDT: "1",
      TRX: "0.1",
    }).getSummary(USER_ID);

    // 1·2000 + 500·1 + 1000·0.1 = 2600
    expect(result.totalValueUsdt).toBe("2600.000000000000000000");
    expect(result.wallets).toHaveLength(2);
    expect(result.wallets[0]).toEqual({
      walletId: "w1",
      networkId: SEPOLIA_ID,
      assets: [
        {
          assetId: "a-eth",
          symbol: "ETH",
          balanceRaw: "1000000000000000000",
          valueUsdt: "2000.000000000000000000",
        },
        {
          assetId: "a-usdt",
          symbol: "USDT",
          balanceRaw: "500000000",
          valueUsdt: "500.000000000000000000",
        },
      ],
    });
  });

  it("fiyatı eksik varlığı toplamdan hariç tutar (satır yine döner, valueUsdt null)", async () => {
    repository.findWalletsWithBalancesByUser.mockResolvedValue([
      walletRow({ id: "w1" }, [
        cache("a-eth", "ETH", 18, "1000000000000000000"),
        cache("a-mystery", "MYST", 18, "5000000000000000000"),
      ]),
    ]);

    const result = await service({ ETH: "2000", USDT: "1" }).getSummary(USER_ID);

    expect(result.totalValueUsdt).toBe("2000.000000000000000000");
    expect(result.wallets[0].assets[1]).toMatchObject({
      symbol: "MYST",
      valueUsdt: null,
    });
  });

  it("hiç cüzdan yoksa toplam 0.<18 sıfır>", async () => {
    repository.findWalletsWithBalancesByUser.mockResolvedValue([]);

    const result = await service({ ETH: "2000", USDT: "1" }).getSummary(USER_ID);

    expect(result.totalValueUsdt).toBe("0.000000000000000000");
    expect(result.wallets).toEqual([]);
  });

  it("varlıkları sembole göre deterministik sıralar", async () => {
    repository.findWalletsWithBalancesByUser.mockResolvedValue([
      walletRow({ id: "w1" }, [
        cache("a-usdt", "USDT", 6, "0"),
        cache("a-eth", "ETH", 18, "0"),
      ]),
    ]);

    const result = await service({ ETH: "2000", USDT: "1" }).getSummary(USER_ID);

    expect(result.wallets[0].assets.map((a) => a.symbol)).toEqual(["ETH", "USDT"]);
  });
});

describe("PortfolioService.getHistory", () => {
  let repository: jest.Mocked<
    Pick<PortfolioRepository, "findSnapshotsByUserAndRange">
  >;
  let service: PortfolioService;

  beforeEach(() => {
    repository = { findSnapshotsByUserAndRange: jest.fn().mockResolvedValue([]) };
    service = new PortfolioService(
      repository as unknown as PortfolioRepository,
      fakePriceCache(),
    );
  });

  it("dateTo < dateFrom → VALIDATION_FAILED, repository çağrılmaz", async () => {
    await expect(
      service.getHistory(
        USER_ID,
        new Date("2026-08-10T00:00:00.000Z"),
        new Date("2026-08-01T00:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(repository.findSnapshotsByUserAndRange).not.toHaveBeenCalled();
  });

  it("snapshot'ları { timestamp, totalValueUsdt, priceSource } noktalarına maplar", async () => {
    repository.findSnapshotsByUserAndRange.mockResolvedValue([
      {
        id: "s1",
        userId: USER_ID,
        totalValueUsdt: { toFixed: (n: number) => "2600." + "0".repeat(n) },
        priceSource: "coingecko",
        createdAt: new Date("2026-08-05T12:00:00.000Z"),
      } as unknown as PortfolioSnapshot,
    ]);

    const result = await service.getHistory(
      USER_ID,
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-10T00:00:00.000Z"),
    );

    expect(result).toEqual([
      {
        timestamp: "2026-08-05T12:00:00.000Z",
        totalValueUsdt: "2600.000000000000000000",
        priceSource: "coingecko",
      },
    ]);
  });

  it("dateTo === dateFrom geçerlidir (aralık sınırı)", async () => {
    const at = new Date("2026-08-05T00:00:00.000Z");
    await expect(service.getHistory(USER_ID, at, at)).resolves.toEqual([]);
    expect(repository.findSnapshotsByUserAndRange).toHaveBeenCalledWith(
      USER_ID,
      at,
      at,
    );
  });
});

describe("PortfolioService — portfolio-snapshot worker passthrough", () => {
  let repository: jest.Mocked<
    Pick<PortfolioRepository, "findUserIdsWithWallets" | "createSnapshot">
  >;
  let service: PortfolioService;

  beforeEach(() => {
    repository = {
      findUserIdsWithWallets: jest.fn().mockResolvedValue(["u1", "u2"]),
      createSnapshot: jest.fn().mockResolvedValue(undefined),
    };
    service = new PortfolioService(
      repository as unknown as PortfolioRepository,
      fakePriceCache(),
    );
  });

  it("listUserIdsWithWallets repository sonucunu döner", async () => {
    await expect(service.listUserIdsWithWallets()).resolves.toEqual(["u1", "u2"]);
  });

  it("saveSnapshot girdiyi repository.createSnapshot'a geçirir", async () => {
    await service.saveSnapshot({
      userId: "u1",
      totalValueUsdt: "2600.000000000000000000",
      priceSource: "coingecko",
    });

    expect(repository.createSnapshot).toHaveBeenCalledWith({
      userId: "u1",
      totalValueUsdt: "2600.000000000000000000",
      priceSource: "coingecko",
    });
  });
});
