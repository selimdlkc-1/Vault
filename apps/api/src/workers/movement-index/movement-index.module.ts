import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { MovementsModule } from "../../movements/movements.module";
import { AlchemyWebhookController } from "../../movements/webhooks/alchemy-webhook.controller";
import { WalletsModule } from "../../wallets/wallets.module";
import { MOVEMENT_INDEX_QUEUE, TronMovementPollProcessor } from "./tron-movement-poll.processor";
import { TrongridMovementClient } from "./trongrid-movement-client";

/**
 * `movement-index` kuyruğunun kayıt modülü (Faz 3 §3.6a) — `balance-sync.module.ts`
 * kalıbını izler. Zincir hareketi indexlemenin iki kaynağı da burada toplanır:
 * - **EVM (push):** `AlchemyWebhookController` — `movements/webhooks/` altında
 *   yaşar ama ayrı bir `webhooks/` üst modülü açılmaz; tek kaynağı EVM olduğundan
 *   `MovementsModule`'ün bir alt parçası gibi bu kuyruk modülünde register edilir
 *   (iterasyon planı §8).
 * - **Tron (poll):** `TronMovementPollProcessor` + `TrongridMovementClient`.
 *
 * `MovementsModule` → `MovementsService` (idempotent yazım + adres/varlık lookup).
 * `WalletsModule` → `WalletsService.listActiveWalletAssetPairs()` (Tron fan-out).
 * `BullModule.forRoot` bağlantısı `AppModule`'de bir kez tanımlıdır.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: MOVEMENT_INDEX_QUEUE }),
    MovementsModule,
    WalletsModule,
  ],
  controllers: [AlchemyWebhookController],
  providers: [TronMovementPollProcessor, TrongridMovementClient],
})
export class MovementIndexModule {}
