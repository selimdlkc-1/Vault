import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NetworksModule } from "../networks/networks.module";
import { WalletsController } from "./wallets.controller";
import { WalletsRepository } from "./wallets.repository";
import { WalletsService } from "./wallets.service";

/**
 * Cüzdan modülü (`docs/04_BACKEND_SPEC.md` §2). `AuditModule` → `WALLET_CREATED`
 * yazımı; `NetworksModule` → ağ chainType'ı + `(network, asset)` aktiflik
 * kontrolü. `PrismaModule` global olduğundan ayrıca import edilmez.
 * Balance-sync worker + `GET /wallets` sonraki iterasyonlarda eklenir.
 */
@Module({
  imports: [AuditModule, NetworksModule],
  controllers: [WalletsController],
  providers: [WalletsService, WalletsRepository],
})
export class WalletsModule {}
