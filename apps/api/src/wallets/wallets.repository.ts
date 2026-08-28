import { Injectable } from "@nestjs/common";
import type { ChainType, Prisma, Wallet, WalletType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** `wallets` insert girdisi — watch-only akışı (Faz 3 §3.1). */
export interface CreateWalletData {
  userId: string;
  networkId: string;
  type: Wallet["type"];
  address: string;
}

/**
 * `balance-sync` worker'ının işlediği en küçük birim (Faz 3 §3.2): bir cüzdan +
 * kendi ağında aktif bir varlık. `chainType`/`chainId` doğru `IChainProvider`'ı
 * seçmek, `assetContractAddress` native/kontrat dalını ayırmak için taşınır.
 */
export interface ActiveWalletAssetPair {
  walletId: string;
  address: string;
  chainType: ChainType;
  chainId: string;
  assetId: string;
  assetContractAddress: string | null;
  assetDecimals: number;
}

/** `balance_caches` upsert girdisi (Faz 3 §3.2). */
export interface UpsertBalanceCacheData {
  walletId: string;
  assetId: string;
  balanceRaw: string;
}

/** `GET /wallets` liste filtreleri (`docs/03_API_CONTRACTS.md` §5.2). */
export interface ListWalletsOptions {
  page: number;
  pageSize: number;
  networkId?: string;
  type?: WalletType;
}

/**
 * Cüzdan + varlık bazlı bakiye önbelleği (her satırın `asset`'i dahil) — cüzdan
 * okuma endpoint'lerinin ham kaynağı (Faz 3 §3.4a). `chain_movements` join'i
 * bilinçli olarak yok: tablo İterasyon 8'de eklenir, o zamana kadar servis
 * `chainMovements` alanını boş dizi döner.
 */
export type WalletWithBalances = Prisma.WalletGetPayload<{
  include: { balanceCaches: { include: { asset: true } } };
}>;

/**
 * `wallets` tablosuna erişim (`docs/04_BACKEND_SPEC.md` §1 repository katmanı —
 * yalnızca Prisma çağrısı, iş kuralı yok). Yalnızca `WalletsModule` içindeki
 * servislere enjekte edilir.
 */
@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bir kullanıcının cüzdanları, offset sayfalama + opsiyonel `(networkId, type)`
   * filtresiyle (`docs/03_API_CONTRACTS.md` §5.2). Toplam sayı aynı `where` ile
   * tek `$transaction` içinde alınır (tutarlı sayfalama). Her cüzdan varlık
   * bazlı `balance_caches` satırlarıyla birlikte döner. İş kuralı yok — sahiplik
   * / rol dallanması servis katmanında.
   */
  async findByUserId(
    userId: string,
    options: ListWalletsOptions,
  ): Promise<{ items: WalletWithBalances[]; totalItems: number }> {
    const where: Prisma.WalletWhereInput = {
      userId,
      ...(options.networkId ? { networkId: options.networkId } : {}),
      ...(options.type ? { type: options.type } : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.wallet.findMany({
        where,
        include: { balanceCaches: { include: { asset: true } } },
        orderBy: { createdAt: "desc" },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      this.prisma.wallet.count({ where }),
    ]);

    return { items, totalItems };
  }

  /**
   * Tek bir cüzdan, varlık bazlı `balance_caches` satırlarıyla (Faz 3 §3.4a).
   * Bulunamazsa `null` — çağıran (`WalletsService`) `RESOURCE_NOT_FOUND`'a
   * indirger. Sahiplik kontrolü burada yapılmaz.
   */
  findById(walletId: string): Promise<WalletWithBalances | null> {
    return this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: { balanceCaches: { include: { asset: true } } },
    });
  }

  /**
   * `(network, address)` benzersizlik ön kontrolü — deterministik `409`
   * (`WALLET_ADDRESS_ALREADY_EXISTS`) için. Yarış durumunda DB `P2002` yine
   * `AllExceptionsFilter`'da aynı koda eşlenir.
   */
  findByNetworkAndAddress(
    networkId: string,
    address: string,
  ): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: { networkId_address: { networkId, address } },
    });
  }

  /**
   * Cüzdanı çağıranın `$transaction`'ı içinde yaratır (`docs/04_BACKEND_SPEC.md`
   * §7 — `wallets` insert + `audit_logs` yazımı atomik). `type = 'watch_only'`
   * için `derivation_index` / `encrypted_dek` yazılmaz (NULL kalır).
   */
  create(tx: Prisma.TransactionClient, data: CreateWalletData): Promise<Wallet> {
    return tx.wallet.create({
      data: {
        userId: data.userId,
        networkId: data.networkId,
        type: data.type,
        address: data.address,
      },
    });
  }

  /**
   * Tüm cüzdanları, kendi ağlarında `is_active = true` olan varlıklarla düz bir
   * `(wallet, asset)` çift listesine açar (Faz 3 §3.2). Pasif `(network, asset)`
   * çiftleri sonuçta yer almaz — pasif bir çiftin bakiyesi senkronlanmaz
   * (`docs/mimari-kararlar.md` AP-001). İş kuralı yok; yalnızca sorgu + projeksiyon.
   */
  async findActiveWalletAssetPairs(): Promise<ActiveWalletAssetPair[]> {
    const wallets = await this.prisma.wallet.findMany({
      select: {
        id: true,
        address: true,
        network: {
          select: {
            chainType: true,
            chainId: true,
            networkAssets: {
              where: { isActive: true },
              select: {
                asset: { select: { id: true, contractAddress: true, decimals: true } },
              },
            },
          },
        },
      },
    });

    return wallets.flatMap((wallet) =>
      wallet.network.networkAssets.map((row) => ({
        walletId: wallet.id,
        address: wallet.address,
        chainType: wallet.network.chainType,
        chainId: wallet.network.chainId,
        assetId: row.asset.id,
        assetContractAddress: row.asset.contractAddress,
        assetDecimals: row.asset.decimals,
      })),
    );
  }

  /**
   * `balance_caches`'e bir `(wallet, asset)` bakiyesini yazar/günceller (Faz 3
   * §3.2). Tek tablo yazımı — audit gerektirmez, `$transaction` açılmaz
   * (`docs/04_BACKEND_SPEC.md` §7 salt-yazma istisnası).
   */
  async upsertBalanceCache(data: UpsertBalanceCacheData): Promise<void> {
    await this.prisma.balanceCache.upsert({
      where: {
        walletId_assetId: { walletId: data.walletId, assetId: data.assetId },
      },
      create: {
        walletId: data.walletId,
        assetId: data.assetId,
        balanceRaw: data.balanceRaw,
      },
      update: { balanceRaw: data.balanceRaw },
    });
  }
}
