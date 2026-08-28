import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { PortfolioModule } from "../../portfolio/portfolio.module";
import {
  PORTFOLIO_SNAPSHOT_QUEUE,
  PortfolioSnapshotProcessor,
} from "./portfolio-snapshot.processor";

/**
 * `portfolio-snapshot` kuyruğunun kayıt modülü (Faz 3 §3.4b) — `price-sync.module.ts`
 * kalıbını izler. `PortfolioModule` kullanıcı listesi + `portfolio_snapshots`
 * yazımı için `PortfolioService`'i sağlar (worker kendi repository'sini tutmaz).
 * `BullModule.forRoot` bağlantısı `AppModule`'de bir kez tanımlıdır.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: PORTFOLIO_SNAPSHOT_QUEUE }),
    PortfolioModule,
  ],
  providers: [PortfolioSnapshotProcessor],
})
export class PortfolioSnapshotModule {}
