import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { NetworksModule } from "../../networks/networks.module";
import { TransfersModule } from "../../transfers/transfers.module";
import { ConfirmationProcessor } from "./confirmation.processor";
import { CONFIRMATION_QUEUE } from "./confirmation.queue";

/**
 * `confirmation` kuyruğunun kayıt modülü (Faz 5 §5.5) — `broadcast-queue.module.ts`
 * kalıbı (kuyruk tanımı ile domain mantığı ayrı dosyalarda,
 * `docs/04_BACKEND_SPEC.md` §3).
 *
 * - `TransfersModule` → `TransfersService.listInFlightTransferIds` /
 *   `getConfirmationContext` (fan-out + bağlam) + `TransferStateMachine.transitionTo`
 *   (`broadcast → confirming/failed/dropped`, `confirming → confirmed/dropped/failed`).
 * - `NetworksModule` → `ChainProviderFactory` (`IChainProvider.getTransactionReceipt`).
 *
 * `BullModule.forRoot` bağlantısı `AppModule`'de bir kez tanımlıdır. Kuyruk
 * `BroadcastQueueModule`'de de `registerQueue` ile kayıtlıdır — `BroadcastProcessor`
 * başarılı broadcast'in sonunda ilk `poll-one` job'unu ekleyebilsin diye.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: CONFIRMATION_QUEUE }),
    TransfersModule,
    NetworksModule,
  ],
  providers: [ConfirmationProcessor],
})
export class ConfirmationQueueModule {}
