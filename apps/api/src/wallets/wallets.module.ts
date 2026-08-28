import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PriceCacheModule } from "../common/price-cache.module";
import { MovementsModule } from "../movements/movements.module";
import { NetworksModule } from "../networks/networks.module";
import { WalletsController } from "./wallets.controller";
import { WalletsRepository } from "./wallets.repository";
import { WalletsService } from "./wallets.service";

/**
 * Cüzdan modülü (`docs/04_BACKEND_SPEC.md` §2). `AuditModule` → `WALLET_CREATED`
 * yazımı; `NetworksModule` → ağ chainType'ı + `(network, asset)` aktiflik
 * kontrolü. `PrismaModule` global olduğundan ayrıca import edilmez.
 * `WalletsService` dışa aktarılır — `balance-sync` worker'ı (Faz 3 §3.2) aktif
 * çiftleri okumak ve `balance_caches`'e yazmak için onu enjekte eder (worker
 * repository'ye doğrudan erişmez). `PriceCacheModule` → cüzdan okuma
 * endpoint'lerinde varlık bazlı USDT değerlemesi (Faz 3 §3.4a, P-014).
 * `MovementsModule` → `GET /wallets/:id`'in "son 5 chainMovement" alanını
 * `MovementsService.listRecentForWallet` ile doldurmak için (Faz 3 §3.6a —
 * İterasyon 4'te boş bırakılan alan).
 */
@Module({
  imports: [AuditModule, NetworksModule, PriceCacheModule, MovementsModule],
  controllers: [WalletsController],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsService],
})
export class WalletsModule {}
