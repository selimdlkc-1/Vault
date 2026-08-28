import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { PriceCacheModule } from "../../common/price-cache.module";
import { CoingeckoClient } from "./coingecko-client";
import { PRICE_SYNC_QUEUE, PriceSyncProcessor } from "./price-sync.processor";

/**
 * `price-sync` kuyruğunun kayıt modülü (Faz 3 §3.3) — `balance-sync.module.ts`
 * kalıbını izler. Fiyat cache'i (`PriceCacheService` + ioredis bağlantısı)
 * paylaşılan `PriceCacheModule`'den gelir; bu modül yalnızca CoinGecko'dan
 * çekip cache'e yazan tarafı barındırır. `BullModule.forRoot` bağlantısı
 * `AppModule`'de bir kez tanımlıdır.
 */
@Module({
  imports: [BullModule.registerQueue({ name: PRICE_SYNC_QUEUE }), PriceCacheModule],
  providers: [PriceSyncProcessor, CoingeckoClient],
})
export class PriceSyncModule {}
