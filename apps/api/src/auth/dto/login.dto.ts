import { loginSchema, type LoginInput } from "@vault/types";

/**
 * İnce DTO dosyası (`docs/04_BACKEND_SPEC.md` §5) — asıl şema tanımı
 * `packages/types/src/schemas/auth.schema.ts`'te.
 *
 * `POST /auth/login` HTTP route'u Faz 1 §1.3'te açıldı; controller bu şemayı
 * `ZodValidationPipe` üzerinden çalıştırır.
 */
export { loginSchema };
export type LoginDto = LoginInput;
