import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { PriceCacheService, priceCacheRedisProvider } from "../../common/price-cache.service";
import { CoingeckoClient } from "./coingecko-client";
import { PRICE_SYNC_QUEUE, PriceSyncProcessor } from "./price-sync.processor";

/**
 * `price-sync` kuyruğunun kayıt modülü (Faz 3 §3.3) — `balance-sync.module.ts`
 * kalıbını izler. `PriceCacheService` + ioredis bağlantısı burada sağlanır;
 * İterasyon 4/5 portföy hesabı için `PriceCacheService` dışa aktarılır.
 * `BullModule.forRoot` bağlantısı `AppModule`'de bir kez tanımlıdır.
 */
@Module({
  imports: [BullModule.registerQueue({ name: PRICE_SYNC_QUEUE })],
  providers: [PriceSyncProcessor, CoingeckoClient, PriceCacheService, priceCacheRedisProvider],
  exports: [PriceCacheService],
})
export class PriceSyncModule {}
