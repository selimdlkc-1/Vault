import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
} from "@nestjs/common";
import { patchNetworkAssetSchema, type PatchNetworkAssetInput } from "@vault/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ResourceNotFoundException } from "../common/exceptions/domain.exception";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import {
  NetworksService,
  type NetworkAssetActivationView,
} from "./networks.service";

/**
 * Admin network/asset aktivasyon endpoint'i (`docs/03_API_CONTRACTS.md` §5.3).
 * Base path `/api/v1` `main.ts`'te global prefix ile eklenir →
 * `PATCH /api/v1/admin/network-assets/:networkId/:assetId`.
 *
 * `@Roles('admin')` — `RolesGuard`'ın (Faz 1 §1.5) ilk gerçek endpoint kullanımı;
 * `User` rolü buraya gelirse global `RolesGuard` `403 FORBIDDEN_ROLE` döner
 * (zorunlu negatif senaryo #6). Ayrı bir `admin/` modülü açılmaz — endpoint
 * `networks` master data'sının bir parçasıdır (`NetworksModule`).
 */
@Controller("admin/network-assets")
export class AdminNetworkAssetsController {
  constructor(private readonly networksService: NetworksService) {}

  @Patch(":networkId/:assetId")
  @Roles("admin")
  activateNetworkAsset(
    @Param(
      "networkId",
      new ParseUUIDPipe({
        // Biçimsiz path id → 404 (§5.3 bu endpoint için "yok" ile "geçersiz"
        // ayrımını istemciye vermez — GET assets ile aynı gerekçe).
        exceptionFactory: () =>
          new ResourceNotFoundException("Ağ/varlık çifti bulunamadı."),
      }),
    )
    networkId: string,
    @Param(
      "assetId",
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ResourceNotFoundException("Ağ/varlık çifti bulunamadı."),
      }),
    )
    assetId: string,
    @Body(new ZodValidationPipe(patchNetworkAssetSchema))
    body: PatchNetworkAssetInput,
    @CurrentUser("id") adminUserId: string,
  ): Promise<NetworkAssetActivationView> {
    return this.networksService.activateNetworkAsset(
      networkId,
      assetId,
      body.isActive,
      adminUserId,
    );
  }
}
