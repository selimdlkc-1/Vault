import { Module } from "@nestjs/common";
import { PriceCacheModule } from "../common/price-cache.module";
import { PortfolioController } from "./portfolio.controller";
import { PortfolioRepository } from "./portfolio.repository";
import { PortfolioService } from "./portfolio.service";

/**
 * Portföy modülü (`docs/04_BACKEND_SPEC.md` §2). `PriceCacheModule` → varlık
 * bazlı USDT değerlemesi (`docs/mimari-kararlar.md` P-014, I-010). `PrismaModule`
 * global olduğundan ayrıca import edilmez.
 *
 * `PortfolioService` dışa aktarılır — `portfolio-snapshot` worker'ı (Faz 3 §3.4b)
 * kullanıcı listesini okumak ve `portfolio_snapshots`'a yazmak için onu enjekte
 * eder (worker repository'ye doğrudan erişmez, `.claude/rules/10`).
 *
 * `WalletsModule` **import edilmez**: portföy özeti kendi cüzdan/bakiye sorgusunu
 * `PortfolioRepository`'de tutar — modüller arası repository sızıntısını
 * engellemek için (`docs/04` §3). Hafif bir sorgu tekrarı pahasına katman sınırı
 * korunur (iterasyon Risk notu).
 */
@Module({
  imports: [PriceCacheModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, PortfolioRepository],
  exports: [PortfolioService],
})
export class PortfolioModule {}
