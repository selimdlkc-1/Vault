import { createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { RefreshToken } from "@prisma/client";
import {
  AuthRefreshReuseDetectedException,
  AuthTokenExpiredException,
} from "../common/exceptions/domain.exception";
import type { EnvConfig } from "../config/env.schema";
import type { PublicUser } from "./auth.service";
import type { RefreshTokensRepository } from "./refresh-tokens.repository";
import { TokenService, durationToMs } from "./token.service";

const ACCESS_SECRET = "a".repeat(32);
const REFRESH_SECRET = "b".repeat(32);
const ENV: Pick<
  EnvConfig,
  "JWT_ACCESS_SECRET" | "JWT_ACCESS_TTL" | "JWT_REFRESH_SECRET" | "JWT_REFRESH_TTL"
> = {
  JWT_ACCESS_SECRET: ACCESS_SECRET,
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_SECRET: REFRESH_SECRET,
  JWT_REFRESH_TTL: "7d",
};

const HEX_64 = /^[0-9a-f]{64}$/;

function expectedHash(raw: string): string {
  return createHmac("sha256", REFRESH_SECRET).update(raw).digest("hex");
}

function buildRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: "row-1",
    userId: "user-1",
    tokenHash: "hash-1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    revokedAt: null,
    ...overrides,
  };
}

const user: PublicUser = {
  id: "user-1",
  email: "user@vault.local",
  role: "user",
  createdAt: new Date(),
};

describe("durationToMs", () => {
  it.each([
    ["15m", 900_000],
    ["7d", 604_800_000],
    ["30s", 30_000],
    ["2h", 7_200_000],
  ])("%s → %d ms", (value, expected) => {
    expect(durationToMs(value)).toBe(expected);
  });

  it("geçersiz formatta hata fırlatır", () => {
    expect(() => durationToMs("7 gün")).toThrow(/Geçersiz süre formatı/);
  });
});

describe("TokenService", () => {
  let jwt: JwtService;
  let config: ConfigService<EnvConfig, true>;
  let refreshTokens: jest.Mocked<
    Pick<
      RefreshTokensRepository,
      "create" | "findByHash" | "rotate" | "revokeAllForUser"
    >
  >;
  let service: TokenService;

  beforeEach(() => {
    jwt = new JwtService({
      secret: ACCESS_SECRET,
      signOptions: { expiresIn: "15m" },
    });
    config = {
      get: (key: keyof typeof ENV) => ENV[key],
    } as unknown as ConfigService<EnvConfig, true>;
    refreshTokens = {
      create: jest.fn(),
      findByHash: jest.fn(),
      rotate: jest.fn(),
      revokeAllForUser: jest.fn().mockResolvedValue(1),
    };
    service = new TokenService(
      jwt,
      config,
      refreshTokens as unknown as RefreshTokensRepository,
    );
  });

  describe("issueAccessToken", () => {
    it("sub + role taşıyan, ~15dk sonra dolan bir JWT üretir", async () => {
      const token = await service.issueAccessToken(user);
      const payload = jwt.verify<{ sub: string; role: string; exp: number; iat: number }>(
        token,
      );

      expect(payload.sub).toBe("user-1");
      expect(payload.role).toBe("user");
      expect(payload.exp - payload.iat).toBe(900);
    });

    it("payload e-posta gibi hassas alan taşımaz", async () => {
      const token = await service.issueAccessToken(user);
      const payload = jwt.verify<Record<string, unknown>>(token);
      expect(payload).not.toHaveProperty("email");
    });
  });

  describe("issueRefreshToken", () => {
    it("DB'ye HMAC hash + expiresAt yazar, ham token'ı döner (hash'i değil)", async () => {
      refreshTokens.create.mockImplementation((data) =>
        Promise.resolve(buildRow(data)),
      );
      const before = Date.now();

      const raw = await service.issueRefreshToken("user-1");

      expect(raw).toMatch(HEX_64);
      const call = refreshTokens.create.mock.calls[0][0];
      expect(call.userId).toBe("user-1");
      expect(call.tokenHash).toBe(expectedHash(raw));
      expect(call.tokenHash).not.toBe(raw);
      // 7 gün ± küçük tolerans
      const ttl = call.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(604_800_000 - 5_000);
      expect(ttl).toBeLessThanOrEqual(604_800_000 + 5_000);
    });
  });

  describe("rotateRefreshToken", () => {
    it("token bulunamazsa AUTH_TOKEN_EXPIRED", async () => {
      refreshTokens.findByHash.mockResolvedValue(null);
      await expect(service.rotateRefreshToken("nope")).rejects.toBeInstanceOf(
        AuthTokenExpiredException,
      );
      expect(refreshTokens.rotate).not.toHaveBeenCalled();
    });

    it("token zaten revoke edilmişse (replay) AUTH_REFRESH_REUSE_DETECTED + kullanıcının tüm oturumları iptal", async () => {
      refreshTokens.findByHash.mockResolvedValue(
        buildRow({ userId: "user-1", revokedAt: new Date() }),
      );

      await expect(service.rotateRefreshToken("used")).rejects.toBeInstanceOf(
        AuthRefreshReuseDetectedException,
      );

      // Sıra önemli: önce cascade revoke, sonra hata.
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith("user-1");
      expect(refreshTokens.rotate).not.toHaveBeenCalled();
    });

    it("token hem süresi geçmiş hem revoke ise doğal süre dolumu önceliklidir (AUTH_TOKEN_EXPIRED)", async () => {
      refreshTokens.findByHash.mockResolvedValue(
        buildRow({
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() - 1_000),
        }),
      );

      await expect(service.rotateRefreshToken("old")).rejects.toBeInstanceOf(
        AuthTokenExpiredException,
      );
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it("token süresi geçmişse AUTH_TOKEN_EXPIRED", async () => {
      refreshTokens.findByHash.mockResolvedValue(
        buildRow({ expiresAt: new Date(Date.now() - 1_000) }),
      );
      await expect(service.rotateRefreshToken("old")).rejects.toBeInstanceOf(
        AuthTokenExpiredException,
      );
    });

    it("geçerli token → eski satırı revoke edip yeni satır oluşturur, yeni ham token döner", async () => {
      const existing = buildRow({ id: "row-1", userId: "user-1" });
      refreshTokens.findByHash.mockResolvedValue(existing);
      refreshTokens.rotate.mockImplementation((oldId, data) =>
        Promise.resolve(buildRow({ ...data, id: `rotated-from-${oldId}` })),
      );

      const result = await service.rotateRefreshToken("valid-raw");

      expect(refreshTokens.findByHash).toHaveBeenCalledWith(
        expectedHash("valid-raw"),
      );
      expect(result.userId).toBe("user-1");
      expect(result.rawRefreshToken).toMatch(HEX_64);

      const [rotatedId, newRow] = refreshTokens.rotate.mock.calls[0];
      expect(rotatedId).toBe("row-1");
      expect(newRow.tokenHash).toBe(expectedHash(result.rawRefreshToken));
      expect(newRow.userId).toBe("user-1");
    });
  });
});
