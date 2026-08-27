import { Injectable, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { ValidationFailedException } from "../exceptions/domain.exception";

/**
 * `packages/types`'taki zod şemasını bir NestJS pipe'ı üzerinden çalıştırır
 * (`docs/04_BACKEND_SPEC.md` §5). Şema `class-validator` dekoratörlerine
 * çevrilmez; doğrudan `schema.parse()` çağrılır.
 *
 * Her route kendi şemasını verir: `@UsePipes(new ZodValidationPipe(registerSchema))`.
 * Tek bir global `APP_PIPE` kullanılmaz — farklı route'lar farklı şema gerektirir;
 * bu konvansiyon buradan itibaren sabittir.
 *
 * `ZodError` → `ValidationFailedException` (`400 VALIDATION_FAILED`, `details`
 * alanında alan bazlı `{ field, reason }` listesi — `docs/03_API_CONTRACTS.md` §3).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new ValidationFailedException(
        result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          reason: issue.message,
        })),
      );
    }

    return result.data;
  }
}
