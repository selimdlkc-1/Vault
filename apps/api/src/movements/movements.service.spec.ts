import type { Asset } from "@prisma/client";
import type { PriceCacheService } from "../common/price-cache.service";
import { MovementsService } from "./movements.service";
import type {
  ChainMovementRow,
  MovementsRepository,
} from "./movements.repository";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEPOLIA_ID = "22222222-2222-4222-8222-222222222222";
const WALLET_ID = "99999999-9999-4999-8999-999999999999";

/** Fiyat cache'i stub'ı — sembol → USD string map'i. Tanımsız sembol `null`. */
function fakePriceCache(prices: Record<string, string> = {}): PriceCacheService {
  return {
    get: jest.fn((symbol: string) => Promise.resolve(prices[symbol] ?? null)),
  } as unknown as PriceCacheService;
}

function assetRow(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "a-eth",
    networkId: SEPOLIA_ID,
    symbol: "ETH",
    decimals: 18,
    contractAddress: null,
    coingeckoId: "ethereum",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function movementRow(overrides: Partial<ChainMovementRow> = {}): ChainMovementRow {
  return {
    id: "m1",
    walletId: WALLET_ID,
    assetId: "a-eth",
    txHash: "0xabc",
    direction: "incoming",
    amount: "1000000000000000000",
    occurredAt: new Date("2026-08-20T10:00:00.000Z"),
    createdAt: new Date("2026-08-20T10:05:00.000Z"),
    asset: assetRow(),
    wallet: { networkId: SEPOLIA_ID, userId: USER_ID },
    ...overrides,
  } as ChainMovementRow;
}

describe("MovementsService", () => {
  let repository: jest.Mocked<
    Pick<
      MovementsRepository,
      | "findByFilters"
      | "findRecentByWallet"
      | "create"
      | "findNetworkIdByChainId"
      | "findWalletByNetworkAndAddress"
      | "findAssetByNetworkAndContract"
    >
  >;
  let service: MovementsService;

  function build(prices: Record<string, string> = { ETH: "2000", USDT: "1" }): void {
    service = new MovementsService(
      repository as unknown as MovementsRepository,
      fakePriceCache(prices),
    );
  }

  beforeEach(() => {
    repository = {
      findByFilters: jest.fn().mockResolvedValue({ items: [], totalItems: 0 }),
      findRecentByWallet: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(true),
      findNetworkIdByChainId: jest.fn().mockResolvedValue(SEPOLIA_ID),
      findWalletByNetworkAndAddress: jest
        .fn()
        .mockResolvedValue({ id: WALLET_ID, userId: USER_ID }),
      findAssetByNetworkAndContract: jest.fn().mockResolvedValue({ id: "a-eth" }),
    };
    build();
  });

  describe("listMovements", () => {
    it("her satır source:'chain', state alanı yok, USDT anlık fiyattan türetilir", async () => {
      repository.findByFilters.mockResolvedValue({
        items: [movementRow()],
        totalItems: 1,
      });

      const result = await service.listMovements(USER_ID, { page: 1, pageSize: 20 });

      expect(result.data).toEqual([
        {
          source: "chain",
          txHash: "0xabc",
          direction: "incoming",
          amount: "1000000000000000000",
          assetId: "a-eth",
          networkId: SEPOLIA_ID,
          occurredAt: "2026-08-20T10:00:00.000Z",
          valueUsdtAtTime: "2000.000000000000000000",
        },
      ]);
      expect(result.data[0]).not.toHaveProperty("state");
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it("sahiplik userId'si ve tüm filtreler repository'ye iletilir", async () => {
      const dateFrom = new Date("2026-08-01T00:00:00.000Z");
      const dateTo = new Date("2026-08-31T00:00:00.000Z");

      await service.listMovements(USER_ID, {
        page: 2,
        pageSize: 10,
        walletId: WALLET_ID,
        networkId: SEPOLIA_ID,
        assetId: "a-eth",
        direction: "outgoing",
        dateFrom,
        dateTo,
        state: "confirmed",
      });

      expect(repository.findByFilters).toHaveBeenCalledWith(USER_ID, {
        page: 2,
        pageSize: 10,
        walletId: WALLET_ID,
        networkId: SEPOLIA_ID,
        assetId: "a-eth",
        direction: "outgoing",
        dateFrom,
        dateTo,
      });
    });

    it("dateTo < dateFrom → VALIDATION_FAILED, repository çağrılmaz", async () => {
      await expect(
        service.listMovements(USER_ID, {
          page: 1,
          pageSize: 20,
          dateFrom: new Date("2026-08-31T00:00:00.000Z"),
          dateTo: new Date("2026-08-01T00:00:00.000Z"),
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      expect(repository.findByFilters).not.toHaveBeenCalled();
    });

    it("fiyat cache boşsa valueUsdtAtTime null (hata fırlatmaz)", async () => {
      build({});
      repository.findByFilters.mockResolvedValue({
        items: [movementRow()],
        totalItems: 1,
      });

      const result = await service.listMovements(USER_ID, { page: 1, pageSize: 20 });

      expect(result.data[0].valueUsdtAtTime).toBeNull();
    });
  });

  describe("indexChainMovement (Tron polling yolu)", () => {
    it("repository.create'e çözülmüş (walletId, assetId) ile geçer, sonucu döner", async () => {
      repository.create.mockResolvedValue(true);

      const written = await service.indexChainMovement({
        walletId: WALLET_ID,
        assetId: "a-usdt",
        txHash: "tron-tx-1",
        direction: "incoming",
        amount: "5000000",
        occurredAt: new Date("2026-08-21T00:00:00.000Z"),
      });

      expect(written).toBe(true);
      expect(repository.create).toHaveBeenCalledWith({
        walletId: WALLET_ID,
        assetId: "a-usdt",
        txHash: "tron-tx-1",
        direction: "incoming",
        amount: "5000000",
        occurredAt: new Date("2026-08-21T00:00:00.000Z"),
      });
    });

    it("aynı hareket ikinci kez → repository.create false döner, servis de false", async () => {
      repository.create.mockResolvedValue(false);
      const written = await service.indexChainMovement({
        walletId: WALLET_ID,
        assetId: "a-usdt",
        txHash: "tron-tx-1",
        direction: "incoming",
        amount: "5000000",
        occurredAt: new Date(),
      });
      expect(written).toBe(false);
    });
  });

  describe("indexWebhookMovement (Alchemy yolu)", () => {
    const base = {
      chainId: "11155111",
      address: "0xWALLET",
      contractAddress: null,
      txHash: "0xdead",
      direction: "incoming" as const,
      amount: "1000000000000000000",
      occurredAt: new Date("2026-08-22T00:00:00.000Z"),
    };

    it("ağ + cüzdan + varlık çözülünce chain_movements'e yazar", async () => {
      const written = await service.indexWebhookMovement(base);

      expect(written).toBe(true);
      expect(repository.create).toHaveBeenCalledWith({
        walletId: WALLET_ID,
        assetId: "a-eth",
        txHash: "0xdead",
        direction: "incoming",
        amount: "1000000000000000000",
        occurredAt: base.occurredAt,
      });
    });

    it("bilinmeyen chain_id → yazmaz, false", async () => {
      repository.findNetworkIdByChainId.mockResolvedValue(null);
      const written = await service.indexWebhookMovement(base);
      expect(written).toBe(false);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("kayıtlı olmayan adres → sessizce atlanır (false, yazmaz)", async () => {
      repository.findWalletByNetworkAndAddress.mockResolvedValue(null);
      const written = await service.indexWebhookMovement(base);
      expect(written).toBe(false);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("sisteme tanımlı olmayan token → yazmaz, false", async () => {
      repository.findAssetByNetworkAndContract.mockResolvedValue(null);
      const written = await service.indexWebhookMovement({
        ...base,
        contractAddress: "0xUnknownToken",
      });
      expect(written).toBe(false);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe("listRecentForWallet", () => {
    it("satırları sembol + USDT karşılığıyla mapler", async () => {
      repository.findRecentByWallet.mockResolvedValue([movementRow()]);

      const rows = await service.listRecentForWallet(WALLET_ID, 5);

      expect(repository.findRecentByWallet).toHaveBeenCalledWith(WALLET_ID, 5);
      expect(rows).toEqual([
        {
          txHash: "0xabc",
          direction: "incoming",
          amount: "1000000000000000000",
          assetId: "a-eth",
          symbol: "ETH",
          occurredAt: "2026-08-20T10:00:00.000Z",
          valueUsdtAtTime: "2000.000000000000000000",
        },
      ]);
    });
  });
});
