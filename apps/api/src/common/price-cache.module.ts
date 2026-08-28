import { Module } from "@nestjs/common";
import { PriceCacheService, priceCacheRedisProvider } from "./price-cache.service";

/**
 * Fiyat cache'ini (ioredis bağlantısı + `PriceCacheService`) DI'a sağlayan
 * paylaşılan modül. `price-sync` worker'ı `set()` ile yazar; `WalletsModule` /
 * `PortfolioModule` (İterasyon 4/5) `get()` ile okuyup USDT değerlemesi yapar
 * (`docs/mimari-kararlar.md` I-010, P-014).
 *
 * Ayrı bir modül olarak durur ki domain modülleri, bir *worker* modülünü
 * (`PriceSyncModule`) import etmek zorunda kalmasın (`.claude/rules/10` katman
 * sınırı).
 */
@Module({
  providers: [PriceCacheService, priceCacheRedisProvider],
  exports: [PriceCacheService],
})
export class PriceCacheModule {}
