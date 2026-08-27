import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
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
  providers: [],
})
export class AppModule {}
