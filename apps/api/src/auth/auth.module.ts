import { Module } from "@nestjs/common";
import { PasswordService } from "./password.service";

/**
 * Kimlik doğrulama modülü (`docs/04_BACKEND_SPEC.md` §2). Bu iterasyon (Faz 1 §1.1)
 * yalnızca `PasswordService`'i sağlar; register/login/refresh/guard katmanları
 * sonraki iterasyonlarda aynı modüle eklenir.
 */
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class AuthModule {}
