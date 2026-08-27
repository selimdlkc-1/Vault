import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Query,
} from "@nestjs/common";
import {
  ResourceNotFoundException,
  ValidationFailedException,
} from "../common/exceptions/domain.exception";
import {
  NetworksService,
  type NetworkAssetView,
  type NetworkView,
} from "./networks.service";

/**
 * Network/Asset okuma endpoint'leri (`docs/03_API_CONTRACTS.md` §5.3). Base path
 * `/api/v1` `main.ts`'te global prefix ile eklenir → `GET /api/v1/networks`.
 *
 * İkisi de yalnızca kimlik doğrulaması ister; global `JwtAuthGuard` yeterli.
 * `@Roles()` **eklenmez** — `activeOnly=false` dahil her iki endpoint `User`
 * rolüne de bilinçli olarak açıktır (`docs/03_API_CONTRACTS.md` §5.3). Admin
 * aktivasyon `PATCH`'i ayrı bir iterasyonda (§2.3) `@Roles('admin')` ile gelir.
 */
@Controller("networks")
export class NetworksController {
  constructor(private readonly networksService: NetworksService) {}

  @Get()
  listNetworks(): Promise<NetworkView[]> {
    return this.networksService.listNetworks();
  }

  @Get(":networkId/assets")
  listAssets(
    @Param(
      "networkId",
      new ParseUUIDPipe({
        // Biçimsiz id → 404 RESOURCE_NOT_FOUND (§5.3 bu endpoint için tek hata
        // kodunu tanımlar; "yok" ile "geçersiz" ayrımı istemciye gerekmez).
        exceptionFactory: () => new ResourceNotFoundException("Ağ bulunamadı."),
      }),
    )
    networkId: string,
    @Query(
      "activeOnly",
      new DefaultValuePipe(true),
      new ParseBoolPipe({
        exceptionFactory: () =>
          new ValidationFailedException([
            { field: "activeOnly", reason: "true veya false olmalı" },
          ]),
      }),
    )
    activeOnly: boolean,
  ): Promise<NetworkAssetView[]> {
    return this.networksService.listAssetsForNetwork(networkId, activeOnly);
  }
}
