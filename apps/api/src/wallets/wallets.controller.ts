import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  createWatchOnlyWalletSchema,
  listWalletsQuerySchema,
  type CreateWatchOnlyWalletInput,
  type ListWalletsQuery,
} from "@vault/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ResourceNotFoundException } from "../common/exceptions/domain.exception";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import {
  WalletsService,
  type WalletDetailView,
  type WalletListResult,
  type WalletView,
} from "./wallets.service";

/**
 * Cüzdan endpoint'leri (`docs/03_API_CONTRACTS.md` §5.2). Base path `/api/v1`
 * `main.ts`'te global prefix ile eklenir → `GET /api/v1/wallets`.
 *
 * `@Roles()` **eklenmez** — her authenticated `User` kendi cüzdanlarını okur;
 * `Admin`'in `?userId=` ile başka kullanıcının cüzdanlarını görmesi ve `User`'ın
 * bunu deneyince `FORBIDDEN_ROLE` alması servis katmanında (`resolveTargetUserId`)
 * ele alınır. Tekil detay için sahiplik kontrolü de servis katmanındadır
 * (`docs/04_BACKEND_SPEC.md` §4 adım 6 — `Admin` muaf).
 */
@Controller("wallets")
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  listWallets(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listWalletsQuerySchema)) query: ListWalletsQuery,
  ): Promise<WalletListResult> {
    return this.walletsService.listWallets(user.id, user.role, {
      userId: query.userId,
      page: query.page,
      pageSize: query.pageSize,
      networkId: query.networkId,
      type: query.type,
    });
  }

  @Get(":id")
  getWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      "id",
      new ParseUUIDPipe({
        // Biçimsiz id → 404 RESOURCE_NOT_FOUND (`docs/03` §5.2 tekil endpoint
        // hata listesi yalnızca RESOURCE_NOT_FOUND / FORBIDDEN_NOT_OWNER içerir).
        exceptionFactory: () => new ResourceNotFoundException("Cüzdan bulunamadı."),
      }),
    )
    id: string,
  ): Promise<WalletDetailView> {
    return this.walletsService.getWalletById(user.id, user.role, id);
  }

  @Post("watch-only")
  createWatchOnly(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(createWatchOnlyWalletSchema))
    body: CreateWatchOnlyWalletInput,
  ): Promise<WalletView> {
    return this.walletsService.createWatchOnly(userId, body);
  }
}
