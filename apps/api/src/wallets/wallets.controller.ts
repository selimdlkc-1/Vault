import { Body, Controller, Post } from "@nestjs/common";
import {
  createWatchOnlyWalletSchema,
  type CreateWatchOnlyWalletInput,
} from "@vault/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WalletsService, type WalletView } from "./wallets.service";

/**
 * Cüzdan endpoint'leri (`docs/03_API_CONTRACTS.md` §5.2). Base path `/api/v1`
 * `main.ts`'te global prefix ile eklenir → `POST /api/v1/wallets/watch-only`.
 *
 * `@Roles()` **eklenmez** — her authenticated `User` kendi watch-only cüzdanını
 * ekleyebilir; global `JwtAuthGuard` yeterli. Sahiplik `@CurrentUser('id')` ile
 * token'dan alınır, gövdeden değil (`docs/03_API_CONTRACTS.md` §5.2).
 *
 * `GET /wallets` ve `GET /wallets/:id` İterasyon 4'te bu controller'a eklenir.
 */
@Controller("wallets")
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post("watch-only")
  createWatchOnly(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(createWatchOnlyWalletSchema))
    body: CreateWatchOnlyWalletInput,
  ): Promise<WalletView> {
    return this.walletsService.createWatchOnly(userId, body);
  }
}
