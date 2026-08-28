import { Module } from "@nestjs/common";
import { PriceCacheModule } from "../common/price-cache.module";
import { MovementsController } from "./movements.controller";
import { MovementsRepository } from "./movements.repository";
import { MovementsService } from "./movements.service";

/**
 * Hareket geçmişi modülü (`docs/04_BACKEND_SPEC.md` §2). `PriceCacheModule` →
 * hareketin USDT karşılığının anlık fiyattan türetilmesi (`docs/mimari-kararlar.md`
 * P-014). `PrismaModule` global olduğundan ayrıca import edilmez.
 *
 * `MovementsService` dışa aktarılır:
 * - `WalletsModule` (Faz 3 §3.4a) → `GET /wallets/:id`'in "son 5 chainMovement"
 *   alanını doldurmak için `listRecentForWallet`'ı çağırır.
 * - `MovementIndexModule` (worker) → Alchemy webhook controller'ı ve Tron polling
 *   processor'ı `indexWebhookMovement` / `indexChainMovement` ile yazar.
 *
 * `WalletsModule` **import edilmez**: cüzdan/varlık lookup'ları `MovementsRepository`
 * kendi Prisma sorgusuyla yapar — modüller arası repository sızıntısını engellemek
 * için (`PortfolioModule` ile aynı gerekçe, `docs/04` §3).
 */
@Module({
  imports: [PriceCacheModule],
  controllers: [MovementsController],
  providers: [MovementsService, MovementsRepository],
  exports: [MovementsService],
})
export class MovementsModule {}
