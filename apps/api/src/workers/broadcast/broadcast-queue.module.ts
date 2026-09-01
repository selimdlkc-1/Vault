import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { NetworksModule } from "../../networks/networks.module";
import { TransfersModule } from "../../transfers/transfers.module";
import { BroadcastProcessor } from "./broadcast.processor";
import { BROADCAST_QUEUE } from "./broadcast.queue";

/**
 * `broadcast` kuyruğunun kayıt modülü (Faz 5 §5.4) — `signing-queue.module.ts`
 * kalıbı (kuyruk tanımı ile domain mantığı ayrı dosyalarda,
 * `docs/04_BACKEND_SPEC.md` §3).
 *
 * - `TransfersModule` → `TransfersService.getBroadcastContext` (ağ bağlamı) +
 *   `TransferStateMachine.transitionTo` (`signed → broadcast/failed`).
 * - `NetworksModule` → `ChainProviderFactory`
 *   (`IChainProvider.broadcastTransaction`).
 *
 * `BullModule.forRoot` bağlantısı `AppModule`'de bir kez tanımlıdır. Kuyruk
 * `SigningQueueModule`'de de `registerQueue` ile kayıtlıdır — `SigningProcessor`
 * başarılı imzalamanın sonunda job ekleyebilsin diye.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: BROADCAST_QUEUE }),
    TransfersModule,
    NetworksModule,
  ],
  providers: [BroadcastProcessor],
})
export class BroadcastQueueModule {}
