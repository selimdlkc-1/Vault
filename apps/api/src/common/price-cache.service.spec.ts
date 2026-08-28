import { type PriceCacheRedis, PriceCacheService } from "./price-cache.service";

describe("PriceCacheService", () => {
  let redis: jest.Mocked<PriceCacheRedis>;
  let service: PriceCacheService;

  beforeEach(() => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue("OK"),
    };
    service = new PriceCacheService(redis);
  });

  it("set(): sembolü namespace'li anahtara yazar ve 60 sn TTL uygular", async () => {
    await service.set("ETH", "3456.78");

    expect(redis.set).toHaveBeenCalledWith("price:usd:ETH", "3456.78", "EX", 60);
  });

  it("get(): namespace'li anahtardan okur", async () => {
    redis.get.mockResolvedValue("0.9998");

    await expect(service.get("USDT")).resolves.toBe("0.9998");
    expect(redis.get).toHaveBeenCalledWith("price:usd:USDT");
  });

  it("get(): anahtar yoksa (TTL doldu) null döner", async () => {
    redis.get.mockResolvedValue(null);
    await expect(service.get("TRX")).resolves.toBeNull();
  });
});
