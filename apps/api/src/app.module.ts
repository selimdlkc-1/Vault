import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { validateEnv } from "./config/env.schema";
import { NetworksModule } from "./networks/networks.module";
import { PortfolioModule } from "./portfolio/portfolio.module";
import { PrismaModule } from "./prisma/prisma.module";
import { WalletsModule } from "./wallets/wallets.module";
import { BalanceSyncModule } from "./workers/balance-sync/balance-sync.module";
import { PortfolioSnapshotModule } from "./workers/portfolio-snapshot/portfolio-snapshot.module";
import { PriceSyncModule } from "./workers/price-sync/price-sync.module";

@Module({
  imports: [
    // Global config (docs/04_BACKEND_SPEC.md §3). `.env` dosyası okunmaz —
    // env yalnızca `process.env`'den gelir (docker compose `env_file` veya shell);
    // `validate` fail-fast doğrulamayı bir kez daha uygular (bkz. main.ts).
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      validate: (raw: Record<string, unknown>) =>
        validateEnv(raw as Record<string, string | undefined>),
    }),
    // BullMQ bağlantısı bir kez burada tanımlanır (docs/04_BACKEND_SPEC.md §8 —
    // tüm arka plan işleri BullMQ üzerinde; cron kullanılmaz). Her kuyruk kendi
    // alt-modülünde `BullModule.registerQueue()` ile eklenir.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("REDIS_URL") },
      }),
    }),
    PrismaModule,
    AuthModule,
    NetworksModule,
    WalletsModule,
    PortfolioModule,
    BalanceSyncModule,
    PriceSyncModule,
    PortfolioSnapshotModule,
  ],
  controllers: [],
  providers: [
    // Global guard zinciri (docs/04_BACKEND_SPEC.md §4 adım 4-5). Sıra sabittir:
    // önce kimlik doğrulama (`request.user`'ı doldurur), sonra rol kontrolü.
    // `@Public()` taşıyan route'lar (auth/register|login|refresh) ilk guard'da atlanır.
    // `JwtService` `AuthModule`'ün dışa aktardığı `JwtModule`'den gelir.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
