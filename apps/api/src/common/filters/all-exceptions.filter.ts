import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { DomainException } from "../exceptions/domain.exception";

interface ErrorEnvelope {
  error: { code: string; message: string; details: unknown };
  meta: { timestamp: string; path: string };
}

/**
 * Global exception filter (`docs/04_BACKEND_SPEC.md` §6, `docs/03_API_CONTRACTS.md` §2).
 *
 * 1. `DomainException` → `code` / `httpStatus` / `details` doğrudan envelope'a.
 * 2. Bilinen Prisma hatası (`P2002` unique ihlali) → ilgili `DomainException`
 *    karşılığına çevrilir. Faz 1'de tek unique kısıt `users.email`.
 * 3. Hiçbiri değilse → `500 INTERNAL_ERROR`; ham mesaj/stack yalnızca log'a
 *    yazılır (`docs/04` §9), API yanıtına asla yansımaz.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { httpStatus, code, message, details } = this.resolve(exception);

    const body: ErrorEnvelope = {
      error: { code, message, details },
      meta: { timestamp: new Date().toISOString(), path: request.url },
    };

    response.status(httpStatus).json(body);
  }

  private resolve(exception: unknown): {
    httpStatus: number;
    code: string;
    message: string;
    details: unknown;
  } {
    if (exception instanceof DomainException) {
      return {
        httpStatus: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        details: exception.details ?? null,
      };
    }

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === "P2002"
    ) {
      // users.email üzerindeki UNIQUE ihlali — register'daki benzersizlik
      // kontrolüyle yarış durumunda (aynı anda iki kayıt) buraya düşer.
      return {
        httpStatus: 409,
        code: "EMAIL_ALREADY_EXISTS",
        message: "Bu e-posta adresi zaten kayıtlı.",
        details: null,
      };
    }

    this.logger.error(
      exception instanceof Error ? exception.message : "Bilinmeyen hata",
      exception instanceof Error ? exception.stack : undefined,
    );

    return {
      httpStatus: 500,
      code: "INTERNAL_ERROR",
      message: "Beklenmeyen bir sunucu hatası oluştu.",
      details: null,
    };
  }
}
