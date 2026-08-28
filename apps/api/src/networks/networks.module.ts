import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AdminNetworkAssetsController } from "./admin-network-assets.controller";
import { ChainProviderFactory } from "./chain-provider.factory";
import { NetworksController } from "./networks.controller";
import { NetworksRepository } from "./networks.repository";
import { NetworksService } from "./networks.service";

/**
 * Network/Asset master data modülü (`docs/04_BACKEND_SPEC.md` §2). Ayrı bir
 * `admin/` modülü açılmaz — admin aktivasyon endpoint'i de bu modülün parçasıdır
 * (`AdminNetworkAssetsController`). `AuditModule` aktivasyon değişikliğinin audit
 * yazımı için import edilir. `PrismaModule` global olduğundan ayrıca import edilmez.
 */
@Module({
  imports: [AuditModule],
  controllers: [NetworksController, AdminNetworkAssetsController],
  providers: [NetworksService, NetworksRepository, ChainProviderFactory],
  // `WalletsModule` (Faz 3 §3.1) `NetworksService`'i cüzdan eklerken ağ
  // chainType'ı + `(network, asset)` aktiflik kontrolü için enjekte eder.
  // `ChainProviderFactory` (Faz 3 §3.2) `balance-sync` worker'ına dışa aktarılır.
  exports: [NetworksService, ChainProviderFactory],
})
export class NetworksModule {}
