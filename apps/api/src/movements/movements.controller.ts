import { Controller, Get, Query } from "@nestjs/common";
import { listMovementsQuerySchema, type ListMovementsQuery } from "@vault/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MovementsService, type MovementListResult } from "./movements.service";

/**
 * Hareket geçmişi endpoint'i (`docs/03_API_CONTRACTS.md` §5.5). Base path
 * `/api/v1` `main.ts`'te global prefix ile eklenir → `GET /api/v1/movements`.
 *
 * `@Roles()` **eklenmez** — her authenticated `User` yalnızca kendi cüzdanlarının
 * hareketlerini görür; sahiplik filtresi (`userId`) serviste/repository sorgusunda
 * zorlanır (`docs/03` §5.5, admin `?userId=` dallanması bu endpoint'te yoktur).
 */
@Controller("movements")
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  listMovements(
    @CurrentUser("id") userId: string,
    @Query(new ZodValidationPipe(listMovementsQuerySchema))
    query: ListMovementsQuery,
  ): Promise<MovementListResult> {
    return this.movementsService.listMovements(userId, {
      page: query.page,
      pageSize: query.pageSize,
      walletId: query.walletId,
      networkId: query.networkId,
      assetId: query.assetId,
      direction: query.direction,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      state: query.state,
    });
  }
}
