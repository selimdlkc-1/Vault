import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * `POST /admin/mint` rate limit'i (`docs/03_API_CONTRACTS.md` §6 — 20 istek/dk,
 * `adminId` anahtarlı). Standart `ThrottlerGuard` IP ile sayar; bu guard izleme
 * anahtarını `request.user.id`'ye (global `JwtAuthGuard`'ın doldurduğu kimlik)
 * çevirir — aynı admin farklı IP'lerden de tek bucket'a düşer.
 *
 * Eşik/pencere route üzerindeki `@Throttle()` dekoratöründe tanımlıdır
 * (`admin.controller.ts`). Aşımda `ThrottlerException` → `AllExceptionsFilter` →
 * `429 RATE_LIMIT_EXCEEDED` + `Retry-After`.
 */
@Injectable()
export class AdminMintThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: {
    user?: { id?: string };
    ip?: string;
  }): Promise<string> {
    return Promise.resolve(req.user?.id ?? req.ip ?? "unknown");
  }
}
