import { Inject, Injectable, type Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/** DI token'ı — paylaşılan ioredis bağlantısı (BullMQ bağlantısından ayrı). */
export const PRICE_CACHE_REDIS = Symbol("PRICE_CACHE_REDIS");

/** `docs/mimari-kararlar.md` I-010 — fiyat cache'i 60 saniyelik TTL taşır. */
const TTL_SECONDS = 60;

/**
 * `PriceCacheService`'in ihtiyaç duyduğu minimal Redis yüzeyi. Gerçek `Redis`
 * örneği bunu yapısal olarak karşılar; testte küçük bir mock yeterlidir.
 */
export interface PriceCacheRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
}

/**
 * `REDIS_URL`'e bağlanan ioredis örneğini DI'a sağlar. BullMQ'nun
 * `BullModule.forRoot` bağlantısıyla aynı sunucu, ayrı istemci — fiyat cache'i
 * bir kuyruk değil düz key/value kullanımıdır (`docs/04_BACKEND_SPEC.md` §10:
 * `REDIS_URL` "BullMQ ve fiyat cache için").
 */
export const priceCacheRedisProvider: Provider = {
  provide: PRICE_CACHE_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis =>
    new Redis(config.getOrThrow<string>("REDIS_URL")),
};

/**
 * Asset başına USDT değerlemesinin girdi fiyatlarını (varlık → USD) 60 saniyelik
 * Redis TTL'iyle saklayan sarmalayıcı (`docs/mimari-kararlar.md` I-010).
 *
 * `price-sync` worker'ı `set()` ile yazar; İterasyon 4/5'in portföy hesabı
 * `get()` ile okuyup `ETH/USDT = (ETH/USD) ÷ (USDT/USD)` formülünü uygular
 * (`docs/mimari-kararlar.md` P-014) — bu iterasyon formülü uygulamaz.
 *
 * Fiyat her zaman `string` decimal temsille tutulur, `number` olarak
 * saklanmaz/döndürülmez (`docs/mimari-kararlar.md` P-015; `CLAUDE.md` §02).
 * TTL dolduğunda anahtar kendiliğinden düşer; worker bir tur atlarsa `get()`
 * `null` döner ve tüketen taraf bunu "fiyat yok" olarak ele alır.
 */
@Injectable()
export class PriceCacheService {
  constructor(@Inject(PRICE_CACHE_REDIS) private readonly redis: PriceCacheRedis) {}

  private static keyFor(assetSymbol: string): string {
    return `price:usd:${assetSymbol}`;
  }

  /** Bir varlık sembolünün USD fiyatını 60 sn TTL ile yazar. */
  async set(assetSymbol: string, usdPrice: string): Promise<void> {
    await this.redis.set(PriceCacheService.keyFor(assetSymbol), usdPrice, "EX", TTL_SECONDS);
  }

  /** Bir varlık sembolünün cache'lenmiş USD fiyatını döner; yoksa `null`. */
  async get(assetSymbol: string): Promise<string | null> {
    return this.redis.get(PriceCacheService.keyFor(assetSymbol));
  }
}
