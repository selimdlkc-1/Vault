import { Injectable } from "@nestjs/common";
import type { PortfolioSnapshot, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Cüzdan + varlık bazlı bakiye önbelleği (her satırın `asset`'i dahil) — portföy
 * özetinin ham kaynağı (Faz 3 §3.4b). `WalletsRepository`'deki `WalletWithBalances`
 * ile aynı şekle sahiptir; portföy modülü, modüller arası repository sızıntısını
 * engellemek için (`.claude/rules/10` — "bir modül başka bir modülün
 * repository'sine doğrudan erişmez") kendi sorgusunu tutar (`docs/04` §3).
 */
export type PortfolioWallet = Prisma.WalletGetPayload<{
  include: { balanceCaches: { include: { asset: true } } };
}>;

/** `portfolio_snapshots` insert girdisi (Faz 3 §3.4b). */
export interface CreateSnapshotData {
  userId: string;
  /** `DECIMAL(38,18)` string temsili — asla JS `number` (`docs/mimari-kararlar.md` P-015). */
  totalValueUsdt: string;
  priceSource: string;
}

/**
 * `portfolio` modülünün Prisma erişimi (`.claude/rules/10` repository katmanı —
 * yalnızca sorgu/yazma, iş kuralı yok). Yalnızca `PortfolioModule` içindeki
 * servislere enjekte edilir.
 */
@Injectable()
export class PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bir kullanıcının tüm cüzdanları, varlık bazlı `balance_caches` satırlarıyla
   * (sayfalama yok — özet toplamı tüm portföyü kapsar). Sahiplik dallanması
   * servis katmanında değil, çağıran `userId`'yi zaten çözmüş olarak gelir.
   */
  findWalletsWithBalancesByUser(userId: string): Promise<PortfolioWallet[]> {
    return this.prisma.wallet.findMany({
      where: { userId },
      include: { balanceCaches: { include: { asset: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * En az bir cüzdanı olan kullanıcıların id'leri — `portfolio-snapshot`
   * worker'ının tarama kümesi (Faz 3 §3.4b). Cüzdanı olmayan kullanıcı için
   * snapshot yazmanın anlamı yoktur (`docs/01_DOMAIN_MODEL.md` §3 — `User 1──N
   * PortfolioSnapshot` zorunlu değil).
   */
  async findUserIdsWithWallets(): Promise<string[]> {
    const rows = await this.prisma.wallet.findMany({
      distinct: ["userId"],
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /**
   * Bir portföy anlık görüntüsü ekler (Faz 3 §3.4b). Tek tablo yazımı, append-only
   * — audit gerektirmez, `$transaction` açılmaz (`docs/04_BACKEND_SPEC.md` §7
   * salt-yazma istisnası; `balance_caches` upsert'iyle aynı gerekçe). Idempotency
   * anahtarı yoktur: her tur kasıtlı olarak yeni bir kayıttır (`docs/04` §8 —
   * "job türüne göre").
   */
  async createSnapshot(data: CreateSnapshotData): Promise<void> {
    await this.prisma.portfolioSnapshot.create({
      data: {
        userId: data.userId,
        totalValueUsdt: data.totalValueUsdt,
        priceSource: data.priceSource,
      },
    });
  }

  /**
   * Bir kullanıcının `[dateFrom, dateTo]` aralığındaki snapshot'ları, grafik x
   * ekseni için artan zaman sırasında (`docs/03_API_CONTRACTS.md` §5.6). Yalnızca
   * `SELECT` — hiçbir yeniden hesaplama yok (`docs/mimari-kararlar.md` P-016).
   */
  findSnapshotsByUserAndRange(
    userId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<PortfolioSnapshot[]> {
    return this.prisma.portfolioSnapshot.findMany({
      where: { userId, createdAt: { gte: dateFrom, lte: dateTo } },
      orderBy: { createdAt: "asc" },
    });
  }
}
