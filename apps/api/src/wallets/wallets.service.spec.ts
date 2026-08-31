import type { ConfigService } from "@nestjs/config";
import type { Wallet } from "@prisma/client";
import type { DerivedWallet } from "@vault/chain-providers";
import type { AuditService } from "../audit/audit.service";
import type { EnvConfig } from "../config/env.schema";
import type { ChainProviderFactory } from "../networks/chain-provider.factory";
import type { EnvelopeEncryptionService } from "./envelope-encryption.service";
import {
  ForbiddenNotOwnerException,
  ForbiddenRoleException,
  NetworkAssetInactiveException,
  ResourceNotFoundException,
  WalletAddressAlreadyExistsException,
  WalletAddressInvalidFormatException,
} from "../common/exceptions/domain.exception";
import type { PriceCacheService } from "../common/price-cache.service";
import type { MovementsService } from "../movements/movements.service";
import type { NetworkView, NetworksService } from "../networks/networks.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { WalletsRepository, WalletWithBalances } from "./wallets.repository";
import { WalletsService } from "./wallets.service";

/** Fiyat cache'i stub'ı — sembol → USD string map'i. Tanımsız sembol `null`. */
function fakePriceCache(prices: Record<string, string> = {}): PriceCacheService {
  return {
    get: jest.fn((symbol: string) => Promise.resolve(prices[symbol] ?? null)),
  } as unknown as PriceCacheService;
}

/** `MovementsService` stub'ı — `getWalletById` yalnızca `listRecentForWallet`'ı çağırır. */
function fakeMovements(recent: unknown[] = []): MovementsService {
  return {
    listRecentForWallet: jest.fn().mockResolvedValue(recent),
  } as unknown as MovementsService;
}

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEPOLIA_ID = "22222222-2222-4222-8222-222222222222";
const SHASTA_ID = "33333333-3333-4333-8333-333333333333";

// Gerçek EIP-55 checksum'lı adres (senaryo #12 pozitif yolu).
const VALID_EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const VALID_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const TX = Symbol("tx");

function evmNetwork(): NetworkView {
  return {
    id: SEPOLIA_ID,
    name: "Sepolia",
    chainType: "evm",
    chainId: "11155111",
    confirmationThreshold: 12,
  };
}

function tronNetwork(): NetworkView {
  return {
    id: SHASTA_ID,
    name: "Tron Shasta",
    chainType: "tron",
    chainId: "shasta",
    confirmationThreshold: 19,
  };
}

function walletRow(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    userId: USER_ID,
    networkId: SEPOLIA_ID,
    type: "watch_only",
    address: VALID_EVM,
    derivationIndex: null,
    encryptedDek: null,
    encryptedPrivateKey: null,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    ...overrides,
  };
}

describe("WalletsService.createWatchOnly", () => {
  let repository: jest.Mocked<
    Pick<WalletsRepository, "findByNetworkAndAddress" | "create">
  >;
  let networksService: jest.Mocked<
    Pick<NetworksService, "findNetworkById" | "hasActiveAsset">
  >;
  let prisma: { $transaction: jest.Mock };
  let audit: jest.Mocked<Pick<AuditService, "record">>;
  let service: WalletsService;

  beforeEach(() => {
    repository = {
      findByNetworkAndAddress: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(walletRow()),
    };
    networksService = {
      findNetworkById: jest.fn().mockResolvedValue(evmNetwork()),
      hasActiveAsset: jest.fn().mockResolvedValue(true),
    };
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX)),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new WalletsService(
      repository as unknown as WalletsRepository,
      networksService as unknown as NetworksService,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      fakePriceCache(),
      fakeMovements(),
      {} as unknown as ConfigService<EnvConfig, true>,
      {} as unknown as ChainProviderFactory,
      {} as unknown as EnvelopeEncryptionService,
    );
  });

  it("başarılı: tek transaction içinde wallet insert + WALLET_CREATED audit yazar", async () => {
    const result = await service.createWatchOnly(USER_ID, {
      networkId: SEPOLIA_ID,
      address: VALID_EVM,
    });

    expect(repository.create).toHaveBeenCalledWith(TX, {
      userId: USER_ID,
      networkId: SEPOLIA_ID,
      type: "watch_only",
      address: VALID_EVM,
    });
    expect(audit.record).toHaveBeenCalledWith(TX, {
      actorType: "user",
      actorId: USER_ID,
      action: "WALLET_CREATED",
      entityType: "wallet",
      entityId: "99999999-9999-4999-8999-999999999999",
      metadata: { type: "watch_only" },
    });
    expect(result).toEqual({
      id: "99999999-9999-4999-8999-999999999999",
      userId: USER_ID,
      networkId: SEPOLIA_ID,
      type: "watch_only",
      address: VALID_EVM,
      createdAt: "2026-08-28T00:00:00.000Z",
    });
  });

  it("Tron ağında geçerli base58check adresi kabul eder", async () => {
    networksService.findNetworkById.mockResolvedValue(tronNetwork());
    repository.create.mockResolvedValue(
      walletRow({ networkId: SHASTA_ID, address: VALID_TRON }),
    );

    await expect(
      service.createWatchOnly(USER_ID, {
        networkId: SHASTA_ID,
        address: VALID_TRON,
      }),
    ).resolves.toMatchObject({ address: VALID_TRON });
  });

  it("ağ yoksa → NETWORK_ASSET_INACTIVE, transaction açılmaz (§5.2 RESOURCE_NOT_FOUND döndürmez)", async () => {
    networksService.findNetworkById.mockResolvedValue(null);

    await expect(
      service.createWatchOnly(USER_ID, {
        networkId: SEPOLIA_ID,
        address: VALID_EVM,
      }),
    ).rejects.toBeInstanceOf(NetworkAssetInactiveException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // docs/08 §4 senaryo #12.
  it("geçersiz adres formatı (EVM ağına Tron adresi) → WALLET_ADDRESS_INVALID_FORMAT", async () => {
    await expect(
      service.createWatchOnly(USER_ID, {
        networkId: SEPOLIA_ID,
        address: VALID_TRON,
      }),
    ).rejects.toBeInstanceOf(WalletAddressInvalidFormatException);
    expect(networksService.hasActiveAsset).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("EVM checksum'ı bozuk adres → WALLET_ADDRESS_INVALID_FORMAT", async () => {
    await expect(
      service.createWatchOnly(USER_ID, {
        networkId: SEPOLIA_ID,
        address: "0xd8da6BF26964aF9D7eEd9e03E53415D37aA96045",
      }),
    ).rejects.toBeInstanceOf(WalletAddressInvalidFormatException);
  });

  // docs/08 §4 senaryo #2.
  it("aktif (network, asset) çifti yoksa → NETWORK_ASSET_INACTIVE, transaction açılmaz", async () => {
    networksService.hasActiveAsset.mockResolvedValue(false);

    await expect(
      service.createWatchOnly(USER_ID, {
        networkId: SEPOLIA_ID,
        address: VALID_EVM,
      }),
    ).rejects.toBeInstanceOf(NetworkAssetInactiveException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("adres zaten kayıtlıysa → WALLET_ADDRESS_ALREADY_EXISTS, transaction açılmaz", async () => {
    repository.findByNetworkAndAddress.mockResolvedValue(walletRow());

    await expect(
      service.createWatchOnly(USER_ID, {
        networkId: SEPOLIA_ID,
        address: VALID_EVM,
      }),
    ).rejects.toBeInstanceOf(WalletAddressAlreadyExistsException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// Faz 4 §4.2 — managed cüzdan türetme + envelope encryption.
describe("WalletsService.createManaged", () => {
  const MANAGED_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const DERIVED: DerivedWallet = {
    address: MANAGED_ADDR,
    privateKey: `0x${"a".repeat(64)}`,
  };

  let repository: jest.Mocked<
    Pick<WalletsRepository, "findMaxDerivationIndex" | "create">
  >;
  let networksService: jest.Mocked<
    Pick<NetworksService, "findNetworkById" | "hasActiveAsset">
  >;
  let prisma: { $transaction: jest.Mock };
  let audit: jest.Mocked<Pick<AuditService, "record">>;
  let deriveWallet: jest.Mock;
  let chainProviderFactory: jest.Mocked<Pick<ChainProviderFactory, "getProvider">>;
  let encryptPrivateKey: jest.Mock;
  let envelope: jest.Mocked<Pick<EnvelopeEncryptionService, "encryptPrivateKey">>;
  let configGet: jest.Mock;
  let service: WalletsService;

  beforeEach(() => {
    repository = {
      findMaxDerivationIndex: jest.fn().mockResolvedValue(null),
      create: jest.fn((tx, data) =>
        Promise.resolve(
          walletRow({
            type: "managed",
            address: data.address,
            derivationIndex: data.derivationIndex ?? null,
            encryptedDek: data.encryptedDek ?? null,
            encryptedPrivateKey: data.encryptedPrivateKey ?? null,
          }),
        ),
      ),
    };
    networksService = {
      findNetworkById: jest.fn().mockResolvedValue(evmNetwork()),
      hasActiveAsset: jest.fn().mockResolvedValue(true),
    };
    prisma = { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX)) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    deriveWallet = jest.fn().mockReturnValue(DERIVED);
    chainProviderFactory = {
      getProvider: jest.fn().mockReturnValue({ deriveWallet }),
    };
    encryptPrivateKey = jest.fn().mockReturnValue({
      encryptedPrivateKey: "enc-pk",
      encryptedDek: "enc-dek",
    });
    envelope = { encryptPrivateKey };
    configGet = jest.fn().mockReturnValue("test test test test test test test test test test test junk");

    service = new WalletsService(
      repository as unknown as WalletsRepository,
      networksService as unknown as NetworksService,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      fakePriceCache(),
      fakeMovements(),
      { get: configGet } as unknown as ConfigService<EnvConfig, true>,
      chainProviderFactory as unknown as ChainProviderFactory,
      envelope as unknown as EnvelopeEncryptionService,
    );
  });

  it("başarılı: türetilen index 0'dan başlar, key şifrelenir, tek transaction içinde insert + audit", async () => {
    await service.createManaged(USER_ID, { networkId: SEPOLIA_ID });

    expect(chainProviderFactory.getProvider).toHaveBeenCalledWith({
      chainType: "evm",
      chainId: "11155111",
    });
    expect(deriveWallet).toHaveBeenCalledWith(
      "test test test test test test test test test test test junk",
      0,
    );
    // Türetilen private key doğrudan envelope servisine geçer.
    expect(encryptPrivateKey).toHaveBeenCalledWith(DERIVED.privateKey);
    expect(repository.create).toHaveBeenCalledWith(TX, {
      userId: USER_ID,
      networkId: SEPOLIA_ID,
      type: "managed",
      address: MANAGED_ADDR,
      derivationIndex: 0,
      encryptedDek: "enc-dek",
      encryptedPrivateKey: "enc-pk",
    });
    expect(audit.record).toHaveBeenCalledWith(TX, {
      actorType: "user",
      actorId: USER_ID,
      action: "WALLET_CREATED",
      entityType: "wallet",
      entityId: expect.any(String),
      metadata: { type: "managed" },
    });
  });

  it("yanıt body'sinde private key / envelope alanları yok (Faz 4 güvenlik sınırı)", async () => {
    const result = await service.createManaged(USER_ID, { networkId: SEPOLIA_ID });

    expect(result).toEqual({
      id: expect.any(String),
      userId: USER_ID,
      networkId: SEPOLIA_ID,
      type: "managed",
      address: MANAGED_ADDR,
      createdAt: expect.any(String),
    });
    expect(result).not.toHaveProperty("privateKey");
    expect(result).not.toHaveProperty("encryptedDek");
    expect(result).not.toHaveProperty("encryptedPrivateKey");
    expect(JSON.stringify(result)).not.toContain("a".repeat(64));
  });

  it("mevcut managed cüzdan varsa sıradaki index = max + 1", async () => {
    repository.findMaxDerivationIndex.mockResolvedValue(4);

    await service.createManaged(USER_ID, { networkId: SEPOLIA_ID });

    expect(deriveWallet).toHaveBeenCalledWith(expect.any(String), 5);
    expect(repository.findMaxDerivationIndex).toHaveBeenCalledWith("evm");
  });

  it("ağ yoksa → NETWORK_ASSET_INACTIVE, türetme/transaction yapılmaz", async () => {
    networksService.findNetworkById.mockResolvedValue(null);

    await expect(
      service.createManaged(USER_ID, { networkId: SEPOLIA_ID }),
    ).rejects.toBeInstanceOf(NetworkAssetInactiveException);
    expect(deriveWallet).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // docs/08 §4 senaryo #2.
  it("aktif (network, asset) çifti yoksa → NETWORK_ASSET_INACTIVE, türetme/transaction yapılmaz", async () => {
    networksService.hasActiveAsset.mockResolvedValue(false);

    await expect(
      service.createManaged(USER_ID, { networkId: SEPOLIA_ID }),
    ).rejects.toBeInstanceOf(NetworkAssetInactiveException);
    expect(deriveWallet).not.toHaveBeenCalled();
    expect(encryptPrivateKey).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// Faz 3 §3.2 — `balance-sync` worker'ının kullandığı ince servis metotları.
// Worker repository'ye doğrudan erişmez; servis passthrough sağlar.
describe("WalletsService — balance-sync destek metotları", () => {
  let repository: jest.Mocked<
    Pick<WalletsRepository, "findActiveWalletAssetPairs" | "upsertBalanceCache">
  >;
  let service: WalletsService;

  beforeEach(() => {
    repository = {
      findActiveWalletAssetPairs: jest.fn(),
      upsertBalanceCache: jest.fn().mockResolvedValue(undefined),
    };
    service = new WalletsService(
      repository as unknown as WalletsRepository,
      {} as unknown as NetworksService,
      {} as unknown as PrismaService,
      {} as unknown as AuditService,
      fakePriceCache(),
      fakeMovements(),
      {} as unknown as ConfigService<EnvConfig, true>,
      {} as unknown as ChainProviderFactory,
      {} as unknown as EnvelopeEncryptionService,
    );
  });

  it("listActiveWalletAssetPairs repository sonucunu olduğu gibi döner", async () => {
    const pairs = [
      {
        walletId: "w1",
        address: VALID_EVM,
        chainType: "evm" as const,
        chainId: "11155111",
        assetId: "a1",
        assetContractAddress: null,
        assetDecimals: 18,
      },
    ];
    repository.findActiveWalletAssetPairs.mockResolvedValue(pairs);

    await expect(service.listActiveWalletAssetPairs()).resolves.toBe(pairs);
  });

  it("saveCachedBalance girdiyi repository.upsertBalanceCache'e geçirir", async () => {
    await service.saveCachedBalance({
      walletId: "w1",
      assetId: "a1",
      balanceRaw: "1000000000000000000",
    });

    expect(repository.upsertBalanceCache).toHaveBeenCalledWith({
      walletId: "w1",
      assetId: "a1",
      balanceRaw: "1000000000000000000",
    });
  });
});

describe("WalletsService.getSigningMaterial (Faz 5 §5.3)", () => {
  let repository: jest.Mocked<Pick<WalletsRepository, "findSigningMaterial">>;
  let service: WalletsService;

  beforeEach(() => {
    repository = { findSigningMaterial: jest.fn() };
    service = new WalletsService(
      repository as unknown as WalletsRepository,
      {} as unknown as NetworksService,
      {} as unknown as PrismaService,
      {} as unknown as AuditService,
      fakePriceCache(),
      fakeMovements(),
      {} as unknown as ConfigService<EnvConfig, true>,
      {} as unknown as ChainProviderFactory,
      {} as unknown as EnvelopeEncryptionService,
    );
  });

  it("managed cüzdan: adres + iki envelope ciphertext'ini döner", async () => {
    repository.findSigningMaterial.mockResolvedValue({
      id: "w1",
      type: "managed",
      address: VALID_EVM,
      encryptedPrivateKey: "enc-pk",
      encryptedDek: "enc-dek",
    });

    await expect(service.getSigningMaterial("w1")).resolves.toEqual({
      address: VALID_EVM,
      encryptedPrivateKey: "enc-pk",
      encryptedDek: "enc-dek",
    });
  });

  it("cüzdan yoksa RESOURCE_NOT_FOUND", async () => {
    repository.findSigningMaterial.mockResolvedValue(null);

    await expect(service.getSigningMaterial("w1")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("watch-only cüzdan (materyal NULL) → WALLET_NOT_MANAGED", async () => {
    repository.findSigningMaterial.mockResolvedValue({
      id: "w1",
      type: "watch_only",
      address: VALID_EVM,
      encryptedPrivateKey: null,
      encryptedDek: null,
    });

    await expect(service.getSigningMaterial("w1")).rejects.toMatchObject({
      code: "WALLET_NOT_MANAGED",
    });
  });

  it("managed ama ciphertext eksikse → WALLET_NOT_MANAGED (bozuk kayıt)", async () => {
    repository.findSigningMaterial.mockResolvedValue({
      id: "w1",
      type: "managed",
      address: VALID_EVM,
      encryptedPrivateKey: "enc-pk",
      encryptedDek: null,
    });

    await expect(service.getSigningMaterial("w1")).rejects.toMatchObject({
      code: "WALLET_NOT_MANAGED",
    });
  });
});

// Faz 3 §3.4a — cüzdan okuma endpoint'lerinin rol/sahiplik dallanmaları.
describe("WalletsService — cüzdan okuma (listWallets / getWalletById)", () => {
  const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const WALLET_ID = "99999999-9999-4999-8999-999999999999";

  function walletWithBalances(
    overrides: Partial<WalletWithBalances> = {},
  ): WalletWithBalances {
    return {
      id: WALLET_ID,
      userId: USER_ID,
      networkId: SEPOLIA_ID,
      type: "watch_only",
      address: VALID_EVM,
      derivationIndex: null,
      encryptedDek: null,
      encryptedPrivateKey: null,
      createdAt: new Date("2026-08-28T00:00:00.000Z"),
      updatedAt: new Date("2026-08-28T00:00:00.000Z"),
      balanceCaches: [
        {
          walletId: WALLET_ID,
          assetId: "asset-eth",
          balanceRaw: "1000000000000000000",
          updatedAt: new Date("2026-08-28T00:00:00.000Z"),
          asset: {
            id: "asset-eth",
            networkId: SEPOLIA_ID,
            symbol: "ETH",
            decimals: 18,
            contractAddress: null,
            coingeckoId: "ethereum",
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
      ],
      ...overrides,
    } as WalletWithBalances;
  }

  let repository: jest.Mocked<Pick<WalletsRepository, "findByUserId" | "findById">>;
  let service: WalletsService;

  beforeEach(() => {
    repository = {
      findByUserId: jest.fn().mockResolvedValue({ items: [], totalItems: 0 }),
      findById: jest.fn().mockResolvedValue(walletWithBalances()),
    };
    service = new WalletsService(
      repository as unknown as WalletsRepository,
      {} as unknown as NetworksService,
      {} as unknown as PrismaService,
      {} as unknown as AuditService,
      fakePriceCache({ ETH: "2000", USDT: "1" }),
      fakeMovements(),
      {} as unknown as ConfigService<EnvConfig, true>,
      {} as unknown as ChainProviderFactory,
      {} as unknown as EnvelopeEncryptionService,
    );
  });

  it("Admin + ?userId= → hedef kullanıcının cüzdanları sorgulanır", async () => {
    await service.listWallets(ADMIN_ID, "admin", {
      userId: OTHER_USER_ID,
      page: 1,
      pageSize: 20,
    });

    expect(repository.findByUserId).toHaveBeenCalledWith(
      OTHER_USER_ID,
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it("Admin ?userId= vermezse kendi cüzdanlarını sorgular", async () => {
    await service.listWallets(ADMIN_ID, "admin", { page: 1, pageSize: 20 });

    expect(repository.findByUserId).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.anything(),
    );
  });

  it("User başka bir userId denerse → FORBIDDEN_ROLE, repository çağrılmaz", async () => {
    await expect(
      service.listWallets(USER_ID, "user", {
        userId: OTHER_USER_ID,
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(ForbiddenRoleException);
    expect(repository.findByUserId).not.toHaveBeenCalled();
  });

  it("User kendi userId'sini açıkça geçebilir (kendi kendine izin)", async () => {
    await service.listWallets(USER_ID, "user", {
      userId: USER_ID,
      page: 1,
      pageSize: 20,
    });
    expect(repository.findByUserId).toHaveBeenCalledWith(USER_ID, expect.anything());
  });

  it("liste: pagination meta'sını ve USDT değerlemesini doldurur", async () => {
    repository.findByUserId.mockResolvedValue({
      items: [walletWithBalances()],
      totalItems: 1,
    });

    const result = await service.listWallets(USER_ID, "user", {
      page: 1,
      pageSize: 20,
    });

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    expect(result.data[0].balances[0]).toEqual({
      assetId: "asset-eth",
      symbol: "ETH",
      balanceRaw: "1000000000000000000",
      valueUsdt: "2000.000000000000000000",
    });
  });

  it("getWalletById: sahip olan User → detay + boş chainMovements", async () => {
    const detail = await service.getWalletById(USER_ID, "user", WALLET_ID);

    expect(detail.id).toBe(WALLET_ID);
    expect(detail.chainMovements).toEqual([]);
    expect(detail.balances[0].valueUsdt).toBe("2000.000000000000000000");
  });

  it("getWalletById: Admin başkasının cüzdanını görebilir (sahiplikten muaf)", async () => {
    await expect(
      service.getWalletById(ADMIN_ID, "admin", WALLET_ID),
    ).resolves.toMatchObject({ id: WALLET_ID });
  });

  // docs/08 §4 senaryo #5.
  it("getWalletById: sahiplik olmayan User → FORBIDDEN_NOT_OWNER", async () => {
    await expect(
      service.getWalletById(OTHER_USER_ID, "user", WALLET_ID),
    ).rejects.toBeInstanceOf(ForbiddenNotOwnerException);
  });

  it("getWalletById: cüzdan yoksa → RESOURCE_NOT_FOUND", async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.getWalletById(USER_ID, "user", WALLET_ID),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it("getWalletById: fiyat cache boşsa valueUsdt null (hata fırlatmaz)", async () => {
    service = new WalletsService(
      repository as unknown as WalletsRepository,
      {} as unknown as NetworksService,
      {} as unknown as PrismaService,
      {} as unknown as AuditService,
      fakePriceCache(),
      fakeMovements(),
      {} as unknown as ConfigService<EnvConfig, true>,
      {} as unknown as ChainProviderFactory,
      {} as unknown as EnvelopeEncryptionService,
    );

    const detail = await service.getWalletById(USER_ID, "user", WALLET_ID);
    expect(detail.balances[0].valueUsdt).toBeNull();
  });
});
