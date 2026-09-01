import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { NetworksModule } from "../../networks/networks.module";
import { TransfersModule } from "../../transfers/transfers.module";
import { WalletsModule } from "../../wallets/wallets.module";
import { BROADCAST_QUEUE } from "../broadcast/broadcast.queue";
import { SigningProcessor } from "./signing.processor";
import { SIGNING_QUEUE } from "./signing.queue";

/**
 * `signing` kuyruğunun kayıt modülü (Faz 5 §5.3) — `balance-sync.module.ts`
 * kalıbı (kuyruk tanımı ile domain mantığı ayrı dosyalarda,
 * `docs/04_BACKEND_SPEC.md` §3).
 *
 * - `TransfersModule` → `TransfersService.getSigningContext` (transfer + ağ/varlık
 *   bağlamı) + `TransferStateMachine.transitionTo` (`pending_signature → signed/failed`).
 * - `WalletsModule` → `WalletsService.getSigningMaterial` (envelope ciphertext'leri)
 *   + `EnvelopeEncryptionService` (bellek-içi decrypt).
 * - `NetworksModule` → `ChainProviderFactory` (`IChainProvider.signTransaction`).
 *
 * `BullModule.forRoot` bağlantısı `AppModule`'de bir kez tanımlıdır. Kuyruğun
 * kendisi `TransfersModule`'de de `registerQueue` ile kayıtlıdır — `TransfersService`
 * `confirm()` sonunda job ekleyebilsin diye.
 *
 * `broadcast` kuyruğu (İterasyon 4 §5.4) burada `registerQueue` ile kayıtlıdır —
 * `SigningProcessor` başarılı imzalamanın sonunda `broadcast` job'u ekler.
 * Processor'ı ayrı `BroadcastQueueModule`'de yaşar.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: SIGNING_QUEUE }),
    BullModule.registerQueue({ name: BROADCAST_QUEUE }),
    TransfersModule,
    WalletsModule,
    NetworksModule,
  ],
  providers: [SigningProcessor],
})
export class SigningQueueModule {}
