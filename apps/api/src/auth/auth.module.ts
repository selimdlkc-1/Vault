import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { EnvConfig } from "../config/env.schema";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
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
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    AuthService,
    TokenService,
    UsersRepository,
    RefreshTokensRepository,
  ],
  exports: [PasswordService, JwtModule],
})
export class AuthModule {}
