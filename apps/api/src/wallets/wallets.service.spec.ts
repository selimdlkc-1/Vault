import type { Wallet } from "@prisma/client";
import type { AuditService } from "../audit/audit.service";
import {
  NetworkAssetInactiveException,
  WalletAddressAlreadyExistsException,
  WalletAddressInvalidFormatException,
} from "../common/exceptions/domain.exception";
import type { NetworkView, NetworksService } from "../networks/networks.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { WalletsRepository } from "./wallets.repository";
import { WalletsService } from "./wallets.service";

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
