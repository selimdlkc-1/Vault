import { Controller, Get, Query } from "@nestjs/common";
import {
  portfolioHistoryQuerySchema,
  type PortfolioHistoryQuery,
} from "@vault/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import {
  PortfolioService,
  type PortfolioHistoryPointView,
  type PortfolioSummaryView,
} from "./portfolio.service";

/**
 * Portföy endpoint'leri (`docs/03_API_CONTRACTS.md` §5.6). Base path `/api/v1`
 * `main.ts`'te global prefix ile eklenir → `GET /api/v1/portfolio/summary`.
 *
 * `@Roles()` **eklenmez** — her authenticated `User` yalnızca kendi portföyünü
 * okur; `?userId=` gibi bir admin dallanması bu iki endpoint'te yoktur
 * (`docs/03` §5.6). `getHistory`'nin `{ data: [...] }` yanıtı, servis diziyi
 * döndürüp `ResponseEnvelopeInterceptor` onu `{ data, meta }`'ya sardığı için
 * otomatik oluşur.
 */
@Controller("portfolio")
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get("summary")
  getSummary(@CurrentUser("id") userId: string): Promise<PortfolioSummaryView> {
    return this.portfolioService.getSummary(userId);
  }

  @Get("history")
  getHistory(
    @CurrentUser("id") userId: string,
    @Query(new ZodValidationPipe(portfolioHistoryQuerySchema))
    query: PortfolioHistoryQuery,
  ): Promise<PortfolioHistoryPointView[]> {
    return this.portfolioService.getHistory(
      userId,
      query.dateFrom,
      query.dateTo,
    );
  }
}
