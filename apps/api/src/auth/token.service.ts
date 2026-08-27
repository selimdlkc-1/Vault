import { createHmac, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthTokenExpiredException } from "../common/exceptions/domain.exception";
import type { EnvConfig } from "../config/env.schema";
import type { PublicUser } from "./auth.service";
import { RefreshTokensRepository } from "./refresh-tokens.repository";

/** Access token JWT payload — hassas veri taşımaz (`docs/07_SECURITY_IMPLEMENTATION.md` §3). */
export interface AccessTokenPayload {
  sub: string;
  role: PublicUser["role"];
}

export interface RotatedRefreshToken {
  userId: string;
  rawRefreshToken: string;
}

const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;
const UNIT_TO_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * `"15m"` / `"7d"` gibi bir süre string'ini milisaniyeye çevirir. Env'den okunan
 * `JWT_*_TTL` değerlerini `@nestjs/jwt` string olarak kabul eder; cookie `maxAge`
 * ve `refresh_tokens.expires_at` hesabı için milisaniye gerekir.
 */
export function durationToMs(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Geçersiz süre formatı: "${value}" (beklenen örnek: "15m", "7d")`);
  }
  return Number(match[1]) * UNIT_TO_MS[match[2]];
}

/**
 * Access token üretimi (JWT) ve refresh token yaşam döngüsü (üretim + rotation).
 * Refresh token'ın ham değeri yalnızca üretildiği anda döner; DB'ye yalnızca
 * `JWT_REFRESH_SECRET` anahtarlı HMAC-SHA256 hash'i yazılır
 * (`mimari-kararlar.md` SEC-013, `docs/02_DATABASE_SCHEMA.md` §2.13).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  /** Ömrü env `JWT_ACCESS_TTL` (varsayılan 15dk) olan imzalı access token. */
  issueAccessToken(user: PublicUser): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return this.jwt.signAsync(payload);
  }

  /**
   * Yeni refresh token üretir: ham 32-byte rastgele değer çağırana döner (bu
   * tek an), `refresh_tokens`'a yalnızca hash + `expiresAt` (now + `JWT_REFRESH_TTL`)
   * yazılır.
   */
  async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    await this.refreshTokens.create({
      userId,
      tokenHash: this.hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + this.refreshTtlMs()),
    });
    return raw;
  }

  /**
   * Rotation: sunulan ham token hash'lenip bulunur. Yoksa / süresi geçmişse /
   * zaten revoke edilmişse `AUTH_TOKEN_EXPIRED`. Geçerliyse eski satır revoke
   * edilir + yeni satır oluşturulur (tek transaction) ve yeni ham token döner.
   *
   * Not: "zaten revoke edilmiş bir token'ın tekrar kullanımı" (replay) ayrı bir
   * hata kodu + tüm oturumların iptali olarak Faz 1 §1.4'te ele alınır; bu
   * iterasyonda o durum da bu genel koda düşer.
   */
  async rotateRefreshToken(rawOldToken: string): Promise<RotatedRefreshToken> {
    const existing = await this.refreshTokens.findByHash(
      this.hashRefreshToken(rawOldToken),
    );

    if (
      !existing ||
      existing.revokedAt !== null ||
      existing.expiresAt.getTime() <= Date.now()
    ) {
      throw new AuthTokenExpiredException();
    }

    const raw = randomBytes(32).toString("hex");
    await this.refreshTokens.rotate(existing.id, {
      userId: existing.userId,
      tokenHash: this.hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + this.refreshTtlMs()),
    });

    return { userId: existing.userId, rawRefreshToken: raw };
  }

  private hashRefreshToken(raw: string): string {
    return createHmac("sha256", this.config.get("JWT_REFRESH_SECRET", { infer: true }))
      .update(raw)
      .digest("hex");
  }

  private refreshTtlMs(): number {
    return durationToMs(this.config.get("JWT_REFRESH_TTL", { infer: true }));
  }
}
