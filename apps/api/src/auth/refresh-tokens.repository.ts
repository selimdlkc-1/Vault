import { Injectable } from "@nestjs/common";
import type { RefreshToken } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Yeni bir `refresh_tokens` satırı için yazılabilir alanlar. */
export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * `refresh_tokens` tablosu erişimi (`docs/04_BACKEND_SPEC.md` §1 repository
 * katmanı — yalnızca sorgu/yazma, iş kuralı yok). Şema: `docs/02` §2.13,
 * `mimari-kararlar.md` SEC-013.
 *
 * Satır asla silinmez; rotation/logout/replay tespitinde `revokedAt` doldurulur
 * (tombstone).
 */
@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: NewRefreshToken): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Rotation: eski satırı `revokedAt = now()` ile kapatır ve yeni satırı ekler —
   * tek transaction, ikisi birlikte başarılı olur ya da birlikte geri alınır.
   */
  async rotate(oldId: string, next: NewRefreshToken): Promise<RefreshToken> {
    const [, created] = await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: oldId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({ data: next }),
    ]);
    return created;
  }

  /** Logout: tek bir satırı geçersiz kılar. Zaten yoksa/kapalıysa sessiz no-op. */
  async revoke(id: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Logout: sunulan token hash'ine karşılık gelen aktif satırı geçersiz kılar.
   * Eşleşen aktif satır yoksa (cookie yok, zaten revoke, uydurma değer) sessiz
   * no-op — `docs/03_API_CONTRACTS.md` §5.1 bu durum için hata kodu tanımlamaz.
   */
  async revokeByHash(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Replay tespiti: kullanıcının o ana kadar `revokedAt`'ı boş olan **tüm**
   * refresh token satırlarını tek bir atomik `UPDATE` ile geçersiz kılar
   * (`docs/07_SECURITY_IMPLEMENTATION.md` §2 — replay → tüm oturumlar). Tek
   * `updateMany` çağrısı olduğundan eşzamanlı iki replay denemesi tutarsız
   * sonuç üretemez. Geçersiz kılınan satır sayısını döner.
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }
}
