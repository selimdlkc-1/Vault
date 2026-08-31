import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { UserRole, WalletType } from "@prisma/client";
import { isValidAddress } from "@vault/chain-providers";
import type { EnvConfig } from "../config/env.schema";
import { ChainProviderFactory } from "../networks/chain-provider.factory";
import { EnvelopeEncryptionService } from "./envelope-encryption.service";
import {
  ForbiddenNotOwnerException,
  ForbiddenRoleException,
  NetworkAssetInactiveException,
  ResourceNotFoundException,
  WalletAddressAlreadyExistsException,
  WalletAddressInvalidFormatException,
} from "../common/exceptions/domain.exception";
import { PriceCacheService } from "../common/price-cache.service";
import { calculateUsdtValue } from "../common/usdt-conversion.util";
import {
  MovementsService,
  type WalletChainMovementView,
} from "../movements/movements.service";
import { NetworksService } from "../networks/networks.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  WalletsRepository,
  type ActiveWalletAssetPair,
  type UpsertBalanceCacheData,
  type WalletWithBalances,
} from "./wallets.repository";

/** `POST /wallets/watch-only` yanıtı — oluşturulan cüzdan (`docs/03_API_CONTRACTS.md` §5.2). */
export interface WalletView {
  id: string;
  userId: string;
  networkId: string;
  type: WalletType;
  address: string;
  createdAt: string;
}

/** `GET /wallets` yanıtındaki varlık bazlı bakiye satırı (`docs/03_API_CONTRACTS.md` §5.2). */
export interface WalletBalanceView {
  assetId: string;
  symbol: string;
  /** En küçük birimde (wei/sun) bakiye — `BigInt` string, asla JS `number`. */
  balanceRaw: string;
  /** USDT karşılığı (18 ondalıklı decimal string) veya fiyat cache'te yoksa `null` (UI'da "—"). */
  valueUsdt: string | null;
}

/** `GET /wallets` liste satırı (`docs/03_API_CONTRACTS.md` §5.2). */
export interface WalletListItemView {
  id: string;
  type: WalletType;
  networkId: string;
  address: string;
  createdAt: string;
  balances: WalletBalanceView[];
}

/**
 * `GET /wallets/:id` detay yanıtı — liste satırı + son 5 zincir hareketi
 * (`docs/03_API_CONTRACTS.md` §5.2). `chainMovements`, `MovementsService`'in
 * `listRecentForWallet`'ından gelir (Faz 3 §3.6a / İterasyon 8); cüzdanın hiç
 * hareketi yoksa boş dizidir.
 */
export interface WalletDetailView extends WalletListItemView {
  chainMovements: WalletChainMovementView[];
}

/** Offset sayfalama meta bloğu (`docs/03_API_CONTRACTS.md` §1). */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** `GET /wallets` servis çıktısı — controller bunu response envelope'una sarar. */
export interface WalletListResult {
  data: WalletListItemView[];
  pagination: PaginationMeta;
}

/** `GET /wallets` filtre girdisi (rol dallanması `userId` üzerinden). */
export interface ListWalletsInput {
  userId?: string;
  page: number;
  pageSize: number;
  networkId?: string;
  type?: WalletType;
}

/**
 * Cüzdan iş mantığı (`docs/04_BACKEND_SPEC.md` §1 service katmanı). Bu iterasyonda
 * yalnızca watch-only oluşturma yolu var; managed cüzdan türetme + envelope
 * encryption Faz 4 §4.1/§4.2'ye ait.
 */
@Injectable()
export class WalletsService {
  constructor(
    private readonly repository: WalletsRepository,
    private readonly networksService: NetworksService,
    // `$transaction` orkestrasyonu servis katmanında — `wallets` insert ile
    // `audit_logs` yazımı tek atomik blokta (`docs/04_BACKEND_SPEC.md` §7).
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // Cüzdan okuma endpoint'lerinde varlık bazlı USDT değerlemesi için
    // (`docs/mimari-kararlar.md` P-014); `price-sync` worker'ının yazdığı cache.
    private readonly priceCache: PriceCacheService,
    // `GET /wallets/:id`'in son 5 zincir hareketi (Faz 3 §3.6a) — worker
    // repository'ye değil domain servisine bağımlıdır (`.claude/rules/10`).
    private readonly movements: MovementsService,
    // Managed cüzdan türetme (Faz 4 §4.2): `HD_WALLET_MNEMONIC` +
    // `IChainProvider.deriveWallet` + `EnvelopeEncryptionService`.
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly chainProviderFactory: ChainProviderFactory,
    private readonly envelopeEncryption: EnvelopeEncryptionService,
  ) {}

  /**
   * `docs/mimari-kararlar.md` §6 [W-001] watch-only akışı, sırasıyla:
   * 1. Ağ + `chainType` okunur (yoksa `NETWORK_ASSET_INACTIVE` — §5.2 hata
   *    listesi RESOURCE_NOT_FOUND içermez).
   * 2. Ağa özel adres format doğrulaması (`isValidAddress`, kritik modül) —
   *    başarısızsa `WALLET_ADDRESS_INVALID_FORMAT` (senaryo #12).
   * 3. `(network, asset)` aktiflik kontrolü — aktif varlık yoksa
   *    `NETWORK_ASSET_INACTIVE` (senaryo #2).
   * 4. `(network, address)` benzersizlik ön kontrolü → `WALLET_ADDRESS_ALREADY_EXISTS`.
   * 5. Tek `$transaction`: `wallets` insert + `WALLET_CREATED` audit
   *    (`metadata: { type: 'watch_only' }`).
   */
  async createWatchOnly(
    userId: string,
    input: { networkId: string; address: string },
  ): Promise<WalletView> {
    const network = await this.networksService.findNetworkById(input.networkId);
    if (!network) {
      throw new NetworkAssetInactiveException();
    }

    if (!isValidAddress(network.chainType, input.address)) {
      throw new WalletAddressInvalidFormatException();
    }

    const hasActiveAsset = await this.networksService.hasActiveAsset(
      input.networkId,
    );
    if (!hasActiveAsset) {
      throw new NetworkAssetInactiveException();
    }

    const existing = await this.repository.findByNetworkAndAddress(
      input.networkId,
      input.address,
    );
    if (existing) {
      throw new WalletAddressAlreadyExistsException();
    }

    const wallet = await this.prisma.$transaction(async (tx) => {
      const created = await this.repository.create(tx, {
        userId,
        networkId: input.networkId,
        type: "watch_only",
        address: input.address,
      });
      await this.audit.record(tx, {
        actorType: "user",
        actorId: userId,
        action: "WALLET_CREATED",
        entityType: "wallet",
        entityId: created.id,
        metadata: { type: "watch_only" },
      });
      return created;
    });

    return {
      id: wallet.id,
      userId: wallet.userId,
      networkId: wallet.networkId,
      type: wallet.type,
      address: wallet.address,
      createdAt: wallet.createdAt.toISOString(),
    };
  }

  /**
   * `POST /wallets/managed` (`docs/03_API_CONTRACTS.md` §5.2,
   * `docs/01_DOMAIN_MODEL.md` §5.1 Managed akışı, `docs/mimari-kararlar.md`
   * W-001/SEC-006), sırasıyla:
   * 1. Ağ + `chainType` okunur (yoksa `NETWORK_ASSET_INACTIVE` — §5.2 hata
   *    listesi RESOURCE_NOT_FOUND içermez, watch-only kalıbının aynısı).
   * 2. `(network, asset)` aktiflik kontrolü — aktif varlık yoksa
   *    `NETWORK_ASSET_INACTIVE` (`docs/01` §4 madde 1).
   * 3. `chainType`'a göre `IChainProvider` seçilir; `findMaxDerivationIndex` ile
   *    sıradaki global index hesaplanır (`m/44'/<coinType>'/0'/0/<index>` yolu
   *    yalnızca coinType'a bağlı — Sepolia + BSC Testnet aynı sayacı paylaşır).
   * 4. `deriveWallet(mnemonic, index)` → adres + private key (bellek-içi).
   * 5. `EnvelopeEncryptionService.encryptPrivateKey` → iki katmanlı ciphertext.
   * 6. Tek `$transaction`: `wallets` insert (`derivationIndex` + iki ciphertext)
   *    + `WALLET_CREATED` audit (`metadata: { type: 'managed' }`).
   *
   * Güvenlik sınırı (`.claude/rules/03-security-baseline.md` madde 1): türetilen
   * private key hiçbir log/yanıt/cache'e yazılmaz — yalnızca `deriveWallet`'ın
   * dönüşünden doğrudan `encryptPrivateKey`'e geçer, yerel değişkende tutulmaz.
   * Dönüş `WalletView`'dır; `encryptedDek`/`encryptedPrivateKey`/`privateKey`
   * alanları yoktur.
   */
  async createManaged(
    userId: string,
    input: { networkId: string },
  ): Promise<WalletView> {
    const network = await this.networksService.findNetworkById(input.networkId);
    if (!network) {
      throw new NetworkAssetInactiveException();
    }

    const hasActiveAsset = await this.networksService.hasActiveAsset(
      input.networkId,
    );
    if (!hasActiveAsset) {
      throw new NetworkAssetInactiveException();
    }

    const provider = this.chainProviderFactory.getProvider({
      chainType: network.chainType,
      chainId: network.chainId,
    });

    const maxIndex = await this.repository.findMaxDerivationIndex(
      network.chainType,
    );
    const derivationIndex = maxIndex === null ? 0 : maxIndex + 1;

    const derived = provider.deriveWallet(
      this.config.get("HD_WALLET_MNEMONIC"),
      derivationIndex,
    );
    const { encryptedPrivateKey, encryptedDek } =
      this.envelopeEncryption.encryptPrivateKey(derived.privateKey);

    const wallet = await this.prisma.$transaction(async (tx) => {
      const created = await this.repository.create(tx, {
        userId,
        networkId: input.networkId,
        type: "managed",
        address: derived.address,
        derivationIndex,
        encryptedDek,
        encryptedPrivateKey,
      });
      await this.audit.record(tx, {
        actorType: "user",
        actorId: userId,
        action: "WALLET_CREATED",
        entityType: "wallet",
        entityId: created.id,
        metadata: { type: "managed" },
      });
      return created;
    });

    return {
      id: wallet.id,
      userId: wallet.userId,
      networkId: wallet.networkId,
      type: wallet.type,
      address: wallet.address,
      createdAt: wallet.createdAt.toISOString(),
    };
  }

  /**
   * `GET /wallets` (`docs/03_API_CONTRACTS.md` §5.2). Rol dallanması:
   * - `Admin` + `?userId=` → o kullanıcının cüzdanları (salt-okunur); `?userId=`
   *   yoksa Admin'in kendi cüzdanları.
   * - `User` → yalnızca kendi cüzdanları; başka bir `userId` denerse
   *   `FORBIDDEN_ROLE` (`docs/04_BACKEND_SPEC.md` §4 adım 6 — Admin muaf).
   *
   * Her cüzdanın `balances` listesi `calculateUsdtValue` ile zenginleştirilir;
   * fiyat cache'te yoksa `valueUsdt: null` döner (hata fırlatılmaz).
   */
  async listWallets(
    requesterId: string,
    requesterRole: UserRole,
    input: ListWalletsInput,
  ): Promise<WalletListResult> {
    const targetUserId = this.resolveTargetUserId(
      requesterId,
      requesterRole,
      input.userId,
    );

    const { items, totalItems } = await this.repository.findByUserId(targetUserId, {
      page: input.page,
      pageSize: input.pageSize,
      networkId: input.networkId,
      type: input.type,
    });

    const data = await Promise.all(items.map((wallet) => this.toListItemView(wallet)));

    return {
      data,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / input.pageSize),
      },
    };
  }

  /**
   * `GET /wallets/:id` (`docs/03_API_CONTRACTS.md` §5.2). Bulunamazsa
   * `RESOURCE_NOT_FOUND`; sahiplik olmayan `User` erişimi `FORBIDDEN_NOT_OWNER`
   * (`Admin` muaf — salt-okunur, `docs/08` senaryo #5). `chainMovements` son 5
   * zincir hareketidir (`MovementsService.listRecentForWallet`, Faz 3 §3.6a).
   */
  async getWalletById(
    requesterId: string,
    requesterRole: UserRole,
    walletId: string,
  ): Promise<WalletDetailView> {
    const wallet = await this.repository.findById(walletId);
    if (!wallet) {
      throw new ResourceNotFoundException("Cüzdan bulunamadı.");
    }
    if (requesterRole !== "admin" && wallet.userId !== requesterId) {
      throw new ForbiddenNotOwnerException();
    }

    const [view, chainMovements] = await Promise.all([
      this.toListItemView(wallet),
      this.movements.listRecentForWallet(wallet.id, 5),
    ]);
    return { ...view, chainMovements };
  }

  /**
   * `?userId=` ile istenen hedef kullanıcıyı role göre çözer. `Admin` herhangi
   * bir kullanıcıyı (veya belirtmezse kendini) görebilir; `User` yalnızca
   * kendini — başka bir `userId` `FORBIDDEN_ROLE`.
   */
  private resolveTargetUserId(
    requesterId: string,
    requesterRole: UserRole,
    requestedUserId: string | undefined,
  ): string {
    if (requesterRole === "admin") {
      return requestedUserId ?? requesterId;
    }
    if (requestedUserId && requestedUserId !== requesterId) {
      throw new ForbiddenRoleException();
    }
    return requesterId;
  }

  /**
   * Bir `WalletWithBalances` satırını `§5.2` liste şekline mapler; her varlık
   * bakiyesinin USDT karşılığını `calculateUsdtValue` ile hesaplar. Bakiyeler
   * sembol'e göre deterministik sıralanır.
   */
  private async toListItemView(
    wallet: WalletWithBalances,
  ): Promise<WalletListItemView> {
    const balances = await Promise.all(
      wallet.balanceCaches.map(async (cache) => ({
        assetId: cache.assetId,
        symbol: cache.asset.symbol,
        balanceRaw: cache.balanceRaw,
        valueUsdt: await calculateUsdtValue(
          cache.balanceRaw,
          cache.asset.decimals,
          cache.asset.symbol,
          this.priceCache,
        ),
      })),
    );
    balances.sort((a, b) => a.symbol.localeCompare(b.symbol));

    return {
      id: wallet.id,
      type: wallet.type,
      networkId: wallet.networkId,
      address: wallet.address,
      createdAt: wallet.createdAt.toISOString(),
      balances,
    };
  }

  /**
   * `balance-sync` worker'ının fan-out adımı için: senkronlanacak tüm aktif
   * `(wallet, asset)` çiftleri (Faz 3 §3.2). Worker repository'ye doğrudan
   * erişmez — domain servisini enjekte eder (`docs/04_BACKEND_SPEC.md` §2).
   */
  listActiveWalletAssetPairs(): Promise<ActiveWalletAssetPair[]> {
    return this.repository.findActiveWalletAssetPairs();
  }

  /**
   * `balance-sync` worker'ının tek çift adımı için: okunan zincir bakiyesini
   * `balance_caches`'e yazar (Faz 3 §3.2). `balanceRaw` en küçük birimde bir
   * BigInt string'idir, servis onu yorumlamaz.
   */
  saveCachedBalance(data: UpsertBalanceCacheData): Promise<void> {
    return this.repository.upsertBalanceCache(data);
  }
}
