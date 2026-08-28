import { Injectable } from "@nestjs/common";
import { Prisma, type MovementDirection } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** `chain_movements` insert girdisi — `(walletId, assetId)` çağıran tarafından çözülmüş gelir. */
export interface CreateChainMovementData {
  walletId: string;
  assetId: string;
  txHash: string;
  direction: MovementDirection;
  /** En küçük birimde (wei/sun) tutar — `BigInt` string, asla JS `number`. */
  amount: string;
  /** Zincirdeki blok zaman damgası. */
  occurredAt: Date;
}

/** `GET /movements` liste filtreleri (`docs/03_API_CONTRACTS.md` §5.5, `mimari-kararlar.md` W-007). */
export interface MovementFilters {
  page: number;
  pageSize: number;
  walletId?: string;
  networkId?: string;
  assetId?: string;
  direction?: MovementDirection;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Zincir hareketi + bağlı `asset` (sembol/decimals — USDT değerlemesi için) +
 * cüzdanın `networkId`/`userId` projeksiyonu (yanıt şekli + sahiplik filtresi).
 */
export type ChainMovementRow = Prisma.ChainMovementGetPayload<{
  include: {
    asset: true;
    wallet: { select: { networkId: true; userId: true } };
  };
}>;

const ROW_INCLUDE = {
  asset: true,
  wallet: { select: { networkId: true, userId: true } },
} as const;

/**
 * `movements` modülünün Prisma erişimi (`.claude/rules/10` repository katmanı —
 * yalnızca sorgu/yazma, iş kuralı yok). `wallets`/`assets` tablolarını doğrudan
 * sorgular; modüller arası **repository** import etmez (`PortfolioRepository` ile
 * aynı gerekçe — `docs/04_BACKEND_SPEC.md` §3). Yalnızca `MovementsModule`
 * içindeki servise enjekte edilir.
 */
@Injectable()
export class MovementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bir zincir hareketini idempotent yazar. `(wallet_id, tx_hash, direction)`
   * UNIQUE kısıtı çakışırsa (aynı worker taraması / tekrar tetiklenen webhook)
   * sessizce atlanır — `docs/02_DATABASE_SCHEMA.md` §2.9, `docs/04` §8.
   *
   * @returns `true` yeni satır yazıldıysa, `false` zaten mevcuttu.
   */
  async create(data: CreateChainMovementData): Promise<boolean> {
    try {
      await this.prisma.chainMovement.create({
        data: {
          walletId: data.walletId,
          assetId: data.assetId,
          txHash: data.txHash,
          direction: data.direction,
          amount: data.amount,
          occurredAt: data.occurredAt,
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Bir `(networkId, address)` çiftine karşılık gelen kayıtlı cüzdanı bulur —
   * Alchemy webhook'unun payload'daki adresi sistemdeki bir cüzdana bağlaması
   * için. Yoksa `null` (webhook o hareketi yok sayar, `docs/03` §8).
   *
   * Eşleşme **büyük/küçük harf duyarsız**: cüzdan adresi EIP-55 checksum'lı
   * saklanır, Alchemy ise adresleri küçük harfle gönderir; ayrı bir
   * checksum'lama adımı (kritik modül dokunuşu) yerine sorguda `insensitive`
   * karşılaştırma yapılır. Tron base58check adreslerinde harf-çakışması pratikte
   * yoktur; ayrıca Tron yolu bu metodu kullanmaz (`walletId` doğrudan gelir).
   */
  findWalletByNetworkAndAddress(
    networkId: string,
    address: string,
  ): Promise<{ id: string; userId: string } | null> {
    return this.prisma.wallet.findFirst({
      where: { networkId, address: { equals: address, mode: "insensitive" } },
      select: { id: true, userId: true },
    });
  }

  /**
   * Bir ağda `(contractAddress)` ile eşleşen aktif varlığı bulur (native varlık
   * için `contractAddress = null`). Yoksa `null` — hareket sisteme tanımlı
   * olmayan bir token içindir, yok sayılır.
   */
  findAssetByNetworkAndContract(
    networkId: string,
    contractAddress: string | null,
  ): Promise<{ id: string } | null> {
    return this.prisma.asset.findFirst({
      where: {
        networkId,
        contractAddress:
          contractAddress === null
            ? null
            : { equals: contractAddress, mode: "insensitive" },
      },
      select: { id: true },
    });
  }

  /**
   * `networks.chain_id` → `networks.id`. Alchemy webhook payload'ı ağı `chain_id`
   * ile taşımaz (`ETH_SEPOLIA` gibi bir etiket taşır); controller o etiketi
   * `chain_id`'ye çevirir, bu metod da id'ye. Bilinmeyen `chain_id` → `null`.
   */
  async findNetworkIdByChainId(chainId: string): Promise<string | null> {
    const network = await this.prisma.network.findUnique({
      where: { chainId },
      select: { id: true },
    });
    return network?.id ?? null;
  }

  /**
   * Kullanıcının cüzdanlarındaki zincir hareketleri, offset sayfalama + opsiyonel
   * filtrelerle (`docs/03_API_CONTRACTS.md` §5.5). Sahiplik `wallet.userId`
   * üzerinden sorguda zorlanır — servis katmanı ayrıca bir kontrol yapmaz.
   * Toplam sayı aynı `where` ile tek `$transaction` içinde alınır.
   */
  async findByFilters(
    userId: string,
    filters: MovementFilters,
  ): Promise<{ items: ChainMovementRow[]; totalItems: number }> {
    const where: Prisma.ChainMovementWhereInput = {
      wallet: {
        userId,
        ...(filters.networkId ? { networkId: filters.networkId } : {}),
      },
      ...(filters.walletId ? { walletId: filters.walletId } : {}),
      ...(filters.assetId ? { assetId: filters.assetId } : {}),
      ...(filters.direction ? { direction: filters.direction } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            occurredAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.chainMovement.findMany({
        where,
        include: ROW_INCLUDE,
        orderBy: { occurredAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.chainMovement.count({ where }),
    ]);

    return { items, totalItems };
  }

  /**
   * Bir cüzdanın en yeni `limit` zincir hareketi (`docs/03_API_CONTRACTS.md`
   * §5.2 — `GET /wallets/:id` "son 5 chainMovement"). Sahiplik kontrolü çağıran
   * `WalletsService`'te zaten yapılmıştır.
   */
  findRecentByWallet(walletId: string, limit: number): Promise<ChainMovementRow[]> {
    return this.prisma.chainMovement.findMany({
      where: { walletId },
      include: ROW_INCLUDE,
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  }
}
