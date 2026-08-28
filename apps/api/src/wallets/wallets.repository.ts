import { Injectable } from "@nestjs/common";
import type { ChainType, Prisma, Wallet } from "@prisma/client";
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

/**
 * `wallets` tablosuna erişim (`docs/04_BACKEND_SPEC.md` §1 repository katmanı —
 * yalnızca Prisma çağrısı, iş kuralı yok). Yalnızca `WalletsModule` içindeki
 * servislere enjekte edilir.
 */
@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

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
