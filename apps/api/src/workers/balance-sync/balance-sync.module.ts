import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { NetworksModule } from "../../networks/networks.module";
import { WalletsModule } from "../../wallets/wallets.module";
import { BALANCE_SYNC_QUEUE, BalanceSyncProcessor } from "./balance-sync.processor";

/**
 * `balance-sync` kuyruğunun kayıt modülü (`docs/04_BACKEND_SPEC.md` §3 — kuyruk
 * tanımı ile domain mantığı ayrı dosyalarda). `WalletsModule` aktif çift
 * listesi + `balance_caches` yazımı için `WalletsService`'i; `NetworksModule`
 * `ChainProviderFactory`'yi sağlar (Faz 3 §3.2). `BullModule.forRoot` bağlantısı
 * `AppModule`'de bir kez tanımlanır.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: BALANCE_SYNC_QUEUE }),
    WalletsModule,
    NetworksModule,
  ],
  providers: [BalanceSyncProcessor],
})
export class BalanceSyncModule {}
