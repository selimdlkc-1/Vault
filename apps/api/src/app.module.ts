import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { validateEnv } from "./config/env.schema";
import { PrismaModule } from "./prisma/prisma.module";

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
    PrismaModule,
    AuthModule,
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
