import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * `POST /transfers` (ve İterasyon 2'de `POST /transfers/:id/confirm`) rate
 * limit'i (`docs/03_API_CONTRACTS.md` §6 — 10 istek/dk, `userId` anahtarlı).
 * Standart `ThrottlerGuard` IP ile sayar; bu guard izleme anahtarını
 * `request.user.id`'ye (global `JwtAuthGuard`'ın doldurduğu kimlik) çevirir —
 * aynı kullanıcı farklı IP'lerden de tek bucket'a düşer (`AdminMintThrottlerGuard`
 * kalıbı).
 *
 * Eşik/pencere route üzerindeki `@Throttle()` dekoratöründe tanımlıdır. Aşımda
 * `ThrottlerException` → `AllExceptionsFilter` → `429 RATE_LIMIT_EXCEEDED` +
 * `Retry-After`.
 */
@Injectable()
export class TransfersThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: {
    user?: { id?: string };
    ip?: string;
  }): Promise<string> {
    return Promise.resolve(req.user?.id ?? req.ip ?? "unknown");
  }
}
