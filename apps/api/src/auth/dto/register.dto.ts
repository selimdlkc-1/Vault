import { registerSchema, type RegisterInput } from "@vault/types";

/**
 * İnce DTO dosyası (`docs/04_BACKEND_SPEC.md` §5) — asıl şema tanımı
 * `packages/types/src/schemas/auth.schema.ts`'te. Controller bu şemayı
 * `ZodValidationPipe` üzerinden çalıştırır.
 */
export { registerSchema };
export type RegisterDto = RegisterInput;
