import { Module } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { WalletsModule } from "../wallets/wallets.module";
import { TransfersController } from "./transfers.controller";
import { TransfersRepository } from "./transfers.repository";
import { TransfersService } from "./transfers.service";
import { TransfersThrottlerGuard } from "./transfers-throttler.guard";
import { TransferStateMachine } from "./transfer-state-machine.service";

/**
 * Transfer modülü (`docs/04_BACKEND_SPEC.md` §2) — Faz 5 §5.1'de oluşturulur.
 *
 * `WalletsModule` import edilir: sahiplik + managed tip kontrolü için
 * `WalletsService.findOwnedManagedWallet` tüketilir (`docs/04_BACKEND_SPEC.md`
 * §3 — "`TransfersModule` ... sahiplik kontrolü için `WalletsModule`'ü import
 * eder"). `PrismaModule` ve `ConfigModule` global olduğundan ayrıca import
 * edilmez; `ThrottlerModule` `AuthModule`'de `@Global()` kayıtlıdır.
 *
 * `TransferStateMachine` bu modülde yaşar (`transfer-state-machine.service.ts` —
 * yalnızca `transfers/` modülünde). İterasyon 3-5'in `signing`/`broadcast`/
 * `confirmation` worker'ları `TransfersModule`'ü import edip `TransferStateMachine`'e
 * erişecek — bu yüzden servis + state machine `exports` edilir.
 *
 * `TransfersThrottlerGuard` / `ThrottlerGuard` provider olarak da kayıtlı —
 * `@UseGuards(...)` ile referans verilen guard'ın DI'ı ve `onModuleInit` hook'u
 * garanti çalışsın (`AdminModule` kalıbı).
 */
@Module({
  imports: [WalletsModule],
  controllers: [TransfersController],
  providers: [
    TransfersService,
    TransferStateMachine,
    TransfersRepository,
    ThrottlerGuard,
    TransfersThrottlerGuard,
  ],
  exports: [TransfersService, TransferStateMachine],
})
export class TransfersModule {}
