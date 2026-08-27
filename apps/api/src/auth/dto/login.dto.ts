import { loginSchema, type LoginInput } from "@vault/types";

/**
 * İnce DTO dosyası (`docs/04_BACKEND_SPEC.md` §5) — asıl şema tanımı
 * `packages/types/src/schemas/auth.schema.ts`'te.
 *
 * `POST /auth/login` HTTP route'u Faz 1 §1.3'te açılır; şema/DTO burada
 * hazırlanır ki `AuthService.validateCredentials` §1.2'de test edilebilsin.
 */
export { loginSchema };
export type LoginDto = LoginInput;
