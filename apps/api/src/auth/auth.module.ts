import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { UsersRepository } from "./users.repository";

/**
 * Kimlik doğrulama modülü (`docs/04_BACKEND_SPEC.md` §2). register, login,
 * refresh, guard, logout, rate limit hepsi bu tek modülün içinde katmanlanır —
 * ayrı `users/` veya `tokens/` modülü açılmaz.
 *
 * Faz 1 §1.2: register endpoint + `AuthService` (register + validateCredentials).
 * `PrismaModule` global olduğundan ayrıca import edilmez.
 */
@Module({
  controllers: [AuthController],
  providers: [PasswordService, AuthService, UsersRepository],
  exports: [PasswordService],
})
export class AuthModule {}
