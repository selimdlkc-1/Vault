import type { Job, Queue } from "bullmq";
import type { PriceCacheService } from "../../common/price-cache.service";
import type { CoingeckoClient } from "./coingecko-client";
import { PriceSyncProcessor, SYNC_PRICES_JOB } from "./price-sync.processor";

function job(name: string, data: unknown = {}): Job {
  return { name, data } as unknown as Job;
}

describe("PriceSyncProcessor", () => {
  let queue: jest.Mocked<Pick<Queue, "add">>;
  let coingecko: jest.Mocked<Pick<CoingeckoClient, "fetchUsdPrices">>;
  let priceCache: jest.Mocked<Pick<PriceCacheService, "set" | "get">>;
  let processor: PriceSyncProcessor;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    coingecko = { fetchUsdPrices: jest.fn().mockResolvedValue({}) };
    priceCache = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
    };
    processor = new PriceSyncProcessor(
      queue as unknown as Queue,
      coingecko as unknown as CoingeckoClient,
      priceCache as unknown as PriceCacheService,
    );
  });

  describe("onModuleInit", () => {
    it("60 sn'lik repeatable sync-prices job'unu sabit job id ile kaydeder", async () => {
      await processor.onModuleInit();

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data, opts] = queue.add.mock.calls[0];
      expect(name).toBe(SYNC_PRICES_JOB);
      expect(data).toEqual({});
      expect(opts).toMatchObject({
        repeat: { every: 60_000 },
        jobId: "price-sync-scheduler",
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
      });
    });
  });

  describe("process — sync-prices", () => {
    it("tüm coingecko id'lerini tek toplu çağrıda çeker (benzersizleştirerek)", async () => {
      coingecko.fetchUsdPrices.mockResolvedValue({
        ethereum: "3456",
        binancecoin: "700",
        tron: "0.12",
        tether: "1.0",
      });

      await processor.process(job(SYNC_PRICES_JOB));

      expect(coingecko.fetchUsdPrices).toHaveBeenCalledTimes(1);
      const ids = coingecko.fetchUsdPrices.mock.calls[0][0];
      expect([...ids].sort()).toEqual(["binancecoin", "ethereum", "tether", "tron"]);
    });

    it("her sembolü kendi USD fiyatıyla cache'e yazar (USDT → tether dahil)", async () => {
      coingecko.fetchUsdPrices.mockResolvedValue({
        ethereum: "3456",
        binancecoin: "700",
        tron: "0.12",
        tether: "0.9998",
      });

      await processor.process(job(SYNC_PRICES_JOB));

      expect(priceCache.set).toHaveBeenCalledWith("ETH", "3456");
      expect(priceCache.set).toHaveBeenCalledWith("BNB", "700");
      expect(priceCache.set).toHaveBeenCalledWith("TRX", "0.12");
      expect(priceCache.set).toHaveBeenCalledWith("USDT", "0.9998");
    });

    it("bir sembolün fiyatı gelmezse onu atlar, diğerlerini yine yazar", async () => {
      coingecko.fetchUsdPrices.mockResolvedValue({ ethereum: "3456" });

      await processor.process(job(SYNC_PRICES_JOB));

      expect(priceCache.set).toHaveBeenCalledWith("ETH", "3456");
      expect(priceCache.set).toHaveBeenCalledTimes(1);
    });

    it("fail-open: CoinGecko hatasında exception fırlar ve hiçbir cache yazması yapılmaz", async () => {
      coingecko.fetchUsdPrices.mockRejectedValue(new Error("CoinGecko simple/price 503"));

      await expect(processor.process(job(SYNC_PRICES_JOB))).rejects.toThrow("503");
      expect(priceCache.set).not.toHaveBeenCalled();
    });
  });

  describe("process — bilinmeyen job", () => {
    it("bilinmeyen job adında sessizce çıkar", async () => {
      await expect(processor.process(job("garip-job"))).resolves.toBeUndefined();
      expect(coingecko.fetchUsdPrices).not.toHaveBeenCalled();
      expect(priceCache.set).not.toHaveBeenCalled();
    });
  });
});
