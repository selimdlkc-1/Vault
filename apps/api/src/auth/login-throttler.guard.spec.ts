import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { ThrottlerException } from "@nestjs/throttler";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../prisma/prisma.service";
import { LoginThrottlerGuard, loginRateLimitKey } from "./login-throttler.guard";

/**
 * `docs/03_API_CONTRACTS.md` §6 — login rate-limit anahtarı `IP + email`
 * bileşiğidir ve email, login şemasının normalize kuralıyla (trim + lowercase)
 * hizalı olmalıdır (`.claude/rules/03-security-baseline.md` madde 5).
 */
describe("loginRateLimitKey", () => {
  it("IP ile normalize edilmiş email'i birleştirir", () => {
    expect(loginRateLimitKey("203.0.113.7", "demo@vault.local")).toBe(
      "203.0.113.7:demo@vault.local",
    );
  });

  it("email büyük/küçük harf ve boşluk farkına rağmen aynı bucket'a düşer", () => {
    const canonical = loginRateLimitKey("203.0.113.7", "demo@vault.local");

    expect(loginRateLimitKey("203.0.113.7", "  DEMO@Vault.LOCAL  ")).toBe(
      canonical,
    );
  });

  it("farklı IP → farklı bucket", () => {
    expect(loginRateLimitKey("10.0.0.1", "demo@vault.local")).not.toBe(
      loginRateLimitKey("10.0.0.2", "demo@vault.local"),
    );
  });

  it("email string değilse yalnızca IP ile anahtar üretir (gövde eksik/biçimsiz)", () => {
    expect(loginRateLimitKey("10.0.0.1", undefined)).toBe("10.0.0.1:");
    expect(loginRateLimitKey("10.0.0.1", { evil: true })).toBe("10.0.0.1:");
  });
});

/**
 * Faz 2 §2.3 / docs/03 §6: rate limit eşiği aşıldığında `LOGIN_FAILED` audit
 * kaydı `metadata: { reason: 'rate_limited' }` ile yazılır — ve istek yine
 * `ThrottlerException` ile reddedilir (audit best-effort, akışı bloklamaz).
 */
describe("LoginThrottlerGuard.throwThrottlingException", () => {
  function buildGuard(record: jest.Mock) {
    const audit = { record } as unknown as AuditService;
    const prisma = { marker: "prisma" } as unknown as PrismaService;
    // `options` bir dizi olmalı — `getErrorMessage` varsayılan mesaja düşsün.
    const guard = new LoginThrottlerGuard(
      [] as never,
      {} as never,
      {} as unknown as Reflector,
      audit,
      prisma,
    );
    return { guard, prisma };
  }

  const ctx = {} as ExecutionContext;
  const detail = { limit: 5, ttl: 900, key: "k", tracker: "t", totalHits: 6 };

  it("audit.record'u rate_limited metadata'sıyla çağırır ve ThrottlerException fırlatır", async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const { guard, prisma } = buildGuard(record);

    await expect(
      guard["throwThrottlingException"](ctx, detail as never),
    ).rejects.toBeInstanceOf(ThrottlerException);

    expect(record).toHaveBeenCalledWith(prisma, {
      actorType: "user",
      actorId: null,
      action: "LOGIN_FAILED",
      entityType: "user",
      entityId: null,
      metadata: { reason: "rate_limited" },
    });
  });

  it("audit yazımı patlasa bile istek yine ThrottlerException ile reddedilir", async () => {
    const record = jest.fn().mockRejectedValue(new Error("db down"));
    const { guard } = buildGuard(record);

    await expect(
      guard["throwThrottlingException"](ctx, detail as never),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });
});
