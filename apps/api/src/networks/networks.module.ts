import { Module } from "@nestjs/common";
import { NetworksController } from "./networks.controller";
import { NetworksRepository } from "./networks.repository";
import { NetworksService } from "./networks.service";

/**
 * Network/Asset master data modülü (`docs/04_BACKEND_SPEC.md` §2). Ayrı bir
 * `admin/` modülü açılmaz — admin aktivasyon endpoint'i de (§2.3) bu modülün
 * parçası olacaktır. `PrismaModule` global olduğundan ayrıca import edilmez.
 */
@Module({
  controllers: [NetworksController],
  providers: [NetworksService, NetworksRepository],
})
export class NetworksModule {}
