import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  listAdminUsersQuerySchema,
  mintSchema,
  type ListAdminUsersQuery,
  type MintInput,
} from "@vault/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AdminMintThrottlerGuard } from "./admin-mint-throttler.guard";
import {
  AdminUsersService,
  type AdminUserListResult,
} from "./admin-users.service";
import { MintService, type MintOperationView } from "./mint.service";

/** `POST /admin/mint` rate limit'i (`docs/03_API_CONTRACTS.md` §6 — 20 istek/dk). */
const MINT_RATE_LIMIT = { limit: 20, ttl: 60_000 } as const;

/**
 * Admin mint + kullanıcı arama endpoint'leri (`docs/03_API_CONTRACTS.md` §5.8).
 * Base path `/api/v1` `main.ts`'te global prefix ile eklenir →
 * `POST /api/v1/admin/mint`, `GET /api/v1/admin/users`.
 *
 * Bu, Faz 4'te ilk kez oluşturulan `admin/` modülünün controller'ıdır — Faz 2
 * §2.3'ün `PATCH /admin/network-assets`'i `networks/` modülünde yaşar, `admin/`
 * değil (`docs/04_BACKEND_SPEC.md` §2). `@Roles('admin')` → global `RolesGuard`
 * `User` rolünü `403 FORBIDDEN_ROLE` ile reddeder.
 */
@Controller("admin")
export class AdminController {
  constructor(
    private readonly mintService: MintService,
    private readonly adminUsersService: AdminUsersService,
  ) {}

  @Post("mint")
  @Roles("admin")
  @UseGuards(AdminMintThrottlerGuard)
  @Throttle({ default: MINT_RATE_LIMIT })
  mint(
    @CurrentUser("id") adminId: string,
    @Body(new ZodValidationPipe(mintSchema)) body: MintInput,
  ): Promise<MintOperationView> {
    return this.mintService.mint(adminId, body);
  }

  @Get("users")
  @Roles("admin")
  listUsers(
    @Query(new ZodValidationPipe(listAdminUsersQuerySchema))
    query: ListAdminUsersQuery,
  ): Promise<AdminUserListResult> {
    return this.adminUsersService.search(query);
  }
}
