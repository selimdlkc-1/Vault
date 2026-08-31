import { Module } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { NetworksModule } from "../networks/networks.module";
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
  // İterasyon 2 (§5.2): `AuthModule` → step-up doğrulaması
  // (`AuthService.verifyPassword`); `NetworksModule` → cross-network guard'ın ağ
  // `chainType`'ı + `(network, asset)` aktiflik tekrar kontrolü; `AuditModule` →
  // `TRANSFER_STATE_CHANGED` yazımı (geçişle aynı `$transaction`).
  imports: [WalletsModule, AuthModule, NetworksModule, AuditModule],
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
