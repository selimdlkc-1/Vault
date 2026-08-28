import { type ExecutionContext, Inject, Injectable, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  getOptionsToken,
  getStorageToken,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
} from "@nestjs/throttler";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * `POST /auth/login` brute-force koruması (`docs/03_API_CONTRACTS.md` §6,
 * `.claude/rules/03-security-baseline.md` madde 5). Standart `ThrottlerGuard`'ı
 * iki noktada genişletir:
 *
 * 1. İzleme anahtarı (`getTracker`): varsayılan yalnızca IP iken, login
 *    `IP + email` bileşik anahtarıyla sayılır — aynı ağdan farklı kullanıcıların
 *    girişleri birbirini kilitlemez, ama tek bir hesaba karşı deneme yağmuru
 *    15 dakikada 5 ile sınırlanır.
 * 2. Eşik aşımı (`throwThrottlingException`): `LOGIN_FAILED` audit kaydı
 *    `metadata: { reason: 'rate_limited' }` ile yazılır (`docs/03` §6). Faz 1'de
 *    `audit_logs` tablosu yokken ertelenmişti; Faz 2 §2.3'te tamamlandı.
 *
 * Eşik/pencere değerleri route üzerindeki `@Throttle()` dekoratöründe tanımlıdır
 * (`auth.controller.ts`). Aşımda `ThrottlerException` fırlar; `AllExceptionsFilter`
 * bunu `429 RATE_LIMIT_EXCEEDED` + `Retry-After` yanıtına çevirir.
 */

/**
 * Login rate-limit bucket anahtarı. Email, login şemasındaki normalize kuralıyla
 * (trim + lowercase, `packages/types` `auth.schema.ts`) birebir hizalı olmalı —
 * aksi halde aynı kullanıcı farklı harf düzeniyle ayrı bucket'lara düşer ve
 * limit etkisiz kalır. Email string değilse (eksik/biçimsiz gövde) yalnızca IP
 * kullanılır; doğrulama hatasını `ZodValidationPipe` üretir.
 */
export function loginRateLimitKey(ip: string, rawEmail: unknown): string {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  return `${ip}:${email}`;
}

interface LoginRequestShape {
  ip?: string;
  socket?: { remoteAddress?: string | null };
  body?: { email?: unknown };
}

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(LoginThrottlerGuard.name);

  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {
    super(options, storageService, reflector);
  }

  protected getTracker(req: LoginRequestShape): Promise<string> {
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    return Promise.resolve(loginRateLimitKey(ip, req.body?.email));
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    // Best-effort: audit yazımı başarısız olsa bile istek yine 429 ile reddedilir.
    try {
      await this.audit.record(this.prisma, {
        actorType: "user",
        actorId: null,
        action: "LOGIN_FAILED",
        entityType: "user",
        entityId: null,
        metadata: { reason: "rate_limited" },
      });
    } catch (error) {
      this.logger.warn(
        `rate_limited LOGIN_FAILED audit kaydı yazılamadı: ${String(error)}`,
      );
    }

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
