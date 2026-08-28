import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuditModule } from "../audit/audit.module";
import type { EnvConfig } from "../config/env.schema";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginThrottlerGuard } from "./login-throttler.guard";
import { PasswordService } from "./password.service";
import { RefreshTokensRepository } from "./refresh-tokens.repository";
import { TokenService } from "./token.service";
import { UsersRepository } from "./users.repository";

/**
 * Kimlik doğrulama modülü (`docs/04_BACKEND_SPEC.md` §2). register, login,
 * refresh, guard, logout, rate limit hepsi bu tek modülün içinde katmanlanır —
 * ayrı `users/` veya `tokens/` modülü açılmaz.
 *
 * Faz 1 §1.2: register endpoint + `AuthService` çekirdeği.
 * Faz 1 §1.3: JWT access token + rotating refresh cookie (`TokenService`,
 * `RefreshTokensRepository`, `JwtModule`).
 * Faz 1 §1.5: `JwtModule` dışa aktarılır — global `JwtAuthGuard` (`APP_GUARD`,
 * `AppModule`) access token'ı doğrulamak için `JwtService`'i buradan alır.
 * Faz 1 §1.6: `ThrottlerModule` — login (`IP + email`, 5/15dk) ve register
 * (`IP`, 3/saat) rate limit'i. `@Global()` olduğundan `AppModule` ve testler
 * ayrıca import etmez. Eşikler route'lardaki `@Throttle()` ile tanımlıdır;
 * `forRoot`'taki `default` yalnızca Faz 2+'nin authenticated endpoint tabanıdır
 * (`docs/03_API_CONTRACTS.md` §6 "diğer tüm authenticated endpoint'ler").
 *
 * `PrismaModule` ve global `ConfigModule` ayrıca import edilmez (ikisi de global).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        secret: config.get("JWT_ACCESS_SECRET", { infer: true }),
        signOptions: {
          expiresIn: config.get("JWT_ACCESS_TTL", { infer: true }),
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Faz 2 §2.3: `LOGIN`/`LOGIN_FAILED` audit yazımı için `AuditService`.
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    AuthService,
    TokenService,
    UsersRepository,
    RefreshTokensRepository,
    // `@UseGuards(...)` ile referans verilen throttler guard'ları provider olarak
    // da kayıtlı — `onModuleInit` (throttler tablosunu kuran hook) garanti çalışsın.
    ThrottlerGuard,
    LoginThrottlerGuard,
  ],
  exports: [PasswordService, JwtModule],
})
export class AuthModule {}
