import { loginRateLimitKey } from "./login-throttler.guard";

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
