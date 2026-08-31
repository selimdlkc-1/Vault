import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ChainProviderUnavailableException as ChainProviderUnavailableError } from "@vault/chain-providers";
import { AuditService } from "../audit/audit.service";
import {
  ChainProviderUnavailableException,
  ResourceNotFoundException,
} from "../common/exceptions/domain.exception";
import { ChainProviderFactory } from "../networks/chain-provider.factory";
import { PrismaService } from "../prisma/prisma.service";
import { fakePrismaService } from "../prisma/testing-prisma.module";
import { MintRepository, type MintTargetAsset, type MintTargetWallet } from "./mint.repository";
import { MintService } from "./mint.service";

const SEPOLIA_NETWORK_ID = "11111111-1111-4111-8111-111111111111";
const WALLET_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "admin-1";

const WALLET: MintTargetWallet = {
  id: WALLET_ID,
  networkId: SEPOLIA_NETWORK_ID,
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  network: { chainType: "evm", chainId: "11155111" },
};

const ASSET: MintTargetAsset = {
  id: ASSET_ID,
  networkId: SEPOLIA_NETWORK_ID,
  symbol: "USDT",
  decimals: 6,
  contractAddress: "0x1234567890123456789012345678901234567890",
};

const INPUT = { walletId: WALLET_ID, assetId: ASSET_ID, amount: "1000000" };

describe("MintService", () => {
  let service: MintService;
  let repository: {
    findWallet: jest.Mock;
    findAsset: jest.Mock;
    create: jest.Mock;
  };
  let mintToken: jest.Mock;
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    repository = {
      findWallet: jest.fn().mockResolvedValue(WALLET),
      findAsset: jest.fn().mockResolvedValue(ASSET),
      create: jest.fn().mockImplementation((tx, data) =>
        Promise.resolve({
          id: "mint-op-1",
          adminId: data.adminId,
          walletId: data.walletId,
          assetId: data.assetId,
          amount: data.amount,
          txHash: data.txHash,
          createdAt: new Date("2026-08-31T10:00:00.000Z"),
        }),
      ),
    };
    mintToken = jest.fn().mockResolvedValue({ txHash: "0xminttx" });
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MintService,
        { provide: MintRepository, useValue: repository },
        {
          provide: ChainProviderFactory,
          useValue: { getProvider: jest.fn().mockReturnValue({ mintToken }) },
        },
        { provide: PrismaService, useValue: fakePrismaService },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: () => `0x${"1".repeat(64)}` } },
      ],
    }).compile();

    service = moduleRef.get(MintService);
  });

  it("başarılı mint: kontrat mint()'i çağrılır, MintOperation döner, MINT_EXECUTED audit'i yazılır", async () => {
    const result = await service.mint(ADMIN_ID, INPUT);

    expect(mintToken).toHaveBeenCalledWith(
      ASSET.contractAddress,
      WALLET.address,
      "1000000",
      `0x${"1".repeat(64)}`,
    );
    expect(result).toEqual({
      id: "mint-op-1",
      adminId: ADMIN_ID,
      walletId: WALLET_ID,
      assetId: ASSET_ID,
      amount: "1000000",
      txHash: "0xminttx",
      createdAt: "2026-08-31T10:00:00.000Z",
    });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), {
      actorType: "admin",
      actorId: ADMIN_ID,
      action: "MINT_EXECUTED",
      entityType: "mint_operation",
      entityId: "mint-op-1",
      metadata: { walletId: WALLET_ID, assetId: ASSET_ID, amount: "1000000" },
    });
    // mint_operations insert audit'ten önce, ikisi de aynı tx handle ile.
    expect(repository.create).toHaveBeenCalledWith(
      { __fakeTx: true },
      expect.objectContaining({ txHash: "0xminttx" }),
    );
  });

  it("cüzdan bulunamazsa RESOURCE_NOT_FOUND — zincire hiçbir çağrı yapılmaz", async () => {
    repository.findWallet.mockResolvedValue(null);

    await expect(service.mint(ADMIN_ID, INPUT)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(mintToken).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("varlık bulunamazsa RESOURCE_NOT_FOUND", async () => {
    repository.findAsset.mockResolvedValue(null);

    await expect(service.mint(ADMIN_ID, INPUT)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(mintToken).not.toHaveBeenCalled();
  });

  it("varlık native (contractAddress null) ise RESOURCE_NOT_FOUND — native mint edilemez", async () => {
    repository.findAsset.mockResolvedValue({ ...ASSET, contractAddress: null });

    await expect(service.mint(ADMIN_ID, INPUT)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it("varlık cüzdanın ağında değilse RESOURCE_NOT_FOUND — yanlış zincirde kontrat çağrılmaz", async () => {
    repository.findAsset.mockResolvedValue({
      ...ASSET,
      networkId: "99999999-9999-4999-8999-999999999999",
    });

    await expect(service.mint(ADMIN_ID, INPUT)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(mintToken).not.toHaveBeenCalled();
  });

  it("provider hatası CHAIN_PROVIDER_UNAVAILABLE'a düşer — mint_operations yazılmaz", async () => {
    mintToken.mockRejectedValue(
      new ChainProviderUnavailableError("EvmProvider.mintToken", {
        cause: new Error("execution reverted: Ownable"),
      }),
    );

    await expect(service.mint(ADMIN_ID, INPUT)).rejects.toBeInstanceOf(
      ChainProviderUnavailableException,
    );
    expect(repository.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
