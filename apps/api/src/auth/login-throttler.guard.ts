import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * `POST /auth/login` brute-force koruması (`docs/03_API_CONTRACTS.md` §6,
 * `.claude/rules/03-security-baseline.md` madde 5). Standart `ThrottlerGuard`'ı
 * yalnızca izleme anahtarında (`getTracker`) genişletir: varsayılan yalnızca
 * IP iken, login `IP + email` bileşik anahtarıyla sayılır — böylece aynı ağdan
 * (NAT/ofis) farklı kullanıcıların girişleri birbirini kilitlemez, ama tek bir
 * hesaba karşı deneme yağmuru 15 dakikada 5 ile sınırlanır.
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
  protected getTracker(req: LoginRequestShape): Promise<string> {
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    return Promise.resolve(loginRateLimitKey(ip, req.body?.email));
  }
}
