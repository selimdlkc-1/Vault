import type { Asset, Network, NetworkAsset } from "@prisma/client";
import type { AuditService } from "../audit/audit.service";
import { ResourceNotFoundException } from "../common/exceptions/domain.exception";
import type { PrismaService } from "../prisma/prisma.service";
import type { NetworkAssetWithAsset, NetworksRepository } from "./networks.repository";
import { NetworksService } from "./networks.service";

const SEPOLIA_ID = "11111111-1111-4111-8111-111111111111";

function buildNetwork(overrides: Partial<Network> = {}): Network {
  return {
    id: SEPOLIA_ID,
    name: "Sepolia",
    chainType: "evm",
    chainId: "11155111",
    confirmationThreshold: 12,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    networkId: SEPOLIA_ID,
    symbol: "ETH",
    decimals: 18,
    contractAddress: null,
    coingeckoId: "ethereum",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildNetworkAsset(
  asset: Asset,
  isActive: boolean,
): NetworkAssetWithAsset {
  return {
    networkId: asset.networkId,
    assetId: asset.id,
    isActive,
    activatedAt: isActive ? new Date("2026-08-01T00:00:00.000Z") : null,
    asset,
  };
}

const TX = Symbol("tx");

describe("NetworksService", () => {
  let repository: jest.Mocked<
    Pick<
      NetworksRepository,
      | "findAllNetworks"
      | "findNetworkById"
      | "findNetworkAssets"
      | "findNetworkAsset"
      | "updateActivation"
    >
  >;
  let prisma: { $transaction: jest.Mock };
  let audit: jest.Mocked<Pick<AuditService, "record">>;
  let service: NetworksService;

  beforeEach(() => {
    repository = {
      findAllNetworks: jest.fn(),
      findNetworkById: jest.fn(),
      findNetworkAssets: jest.fn(),
      findNetworkAsset: jest.fn(),
      updateActivation: jest.fn(),
    };
    // `$transaction(cb)` → cb'yi sabit bir tx handle ile çalıştırır.
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX)),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new NetworksService(
      repository as unknown as NetworksRepository,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe("listNetworks", () => {
    it("her ağı §5.3 yanıt şekline mapler (createdAt dışarı sızmaz)", async () => {
      repository.findAllNetworks.mockResolvedValue([
        buildNetwork(),
        buildNetwork({
          id: "33333333-3333-4333-8333-333333333333",
          name: "Tron Shasta",
          chainType: "tron",
          chainId: "shasta",
          confirmationThreshold: 19,
        }),
      ]);

      const result = await service.listNetworks();

      expect(result).toEqual([
        {
          id: SEPOLIA_ID,
          name: "Sepolia",
          chainType: "evm",
          chainId: "11155111",
          confirmationThreshold: 12,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Tron Shasta",
          chainType: "tron",
          chainId: "shasta",
          confirmationThreshold: 19,
        },
      ]);
      expect(result[0]).not.toHaveProperty("createdAt");
    });
  });

  describe("listAssetsForNetwork", () => {
    it("ağ yoksa RESOURCE_NOT_FOUND fırlatır, asset sorgusu yapılmaz", async () => {
      repository.findNetworkById.mockResolvedValue(null);

      await expect(
        service.listAssetsForNetwork(SEPOLIA_ID, true),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
      expect(repository.findNetworkAssets).not.toHaveBeenCalled();
    });

    it("activeOnly=true → repository'ye aktarılır, dönen satırlar §5.3 şekline maplenir", async () => {
      const eth = buildAsset();
      repository.findNetworkById.mockResolvedValue(buildNetwork());
      repository.findNetworkAssets.mockResolvedValue([
        buildNetworkAsset(eth, true),
      ]);

      const result = await service.listAssetsForNetwork(SEPOLIA_ID, true);

      expect(repository.findNetworkAssets).toHaveBeenCalledWith(SEPOLIA_ID, {
        activeOnly: true,
      });
      expect(result).toEqual([
        {
          id: eth.id,
          symbol: "ETH",
          decimals: 18,
          contractAddress: null,
          isActive: true,
        },
      ]);
    });

    it("activeOnly=false → pasif çiftler de döner, isActive alanı gerçek durumu yansıtır", async () => {
      const eth = buildAsset();
      const usdt = buildAsset({
        id: "44444444-4444-4444-8444-444444444444",
        symbol: "USDT",
        decimals: 6,
        coingeckoId: "tether",
      });
      repository.findNetworkById.mockResolvedValue(buildNetwork());
      repository.findNetworkAssets.mockResolvedValue([
        buildNetworkAsset(eth, true),
        buildNetworkAsset(usdt, false),
      ]);

      const result = await service.listAssetsForNetwork(SEPOLIA_ID, false);

      expect(repository.findNetworkAssets).toHaveBeenCalledWith(SEPOLIA_ID, {
        activeOnly: false,
      });
      expect(result).toEqual([
        expect.objectContaining({ symbol: "ETH", isActive: true }),
        expect.objectContaining({ symbol: "USDT", isActive: false }),
      ]);
    });
  });

  describe("activateNetworkAsset", () => {
    const ASSET_ID = "22222222-2222-4222-8222-222222222222";
    const ADMIN_ID = "99999999-9999-4999-8999-999999999999";

    function existingPair(isActive: boolean): NetworkAsset {
      return {
        networkId: SEPOLIA_ID,
        assetId: ASSET_ID,
        isActive,
        activatedAt: isActive ? new Date("2026-08-01T00:00:00.000Z") : null,
      };
    }

    it("çift yoksa RESOURCE_NOT_FOUND fırlatır, transaction açılmaz", async () => {
      repository.findNetworkAsset.mockResolvedValue(null);

      await expect(
        service.activateNetworkAsset(SEPOLIA_ID, ASSET_ID, false, ADMIN_ID),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("pasifleştirme: tek transaction içinde update + NETWORK_ASSET_DEACTIVATED audit yazar", async () => {
      repository.findNetworkAsset.mockResolvedValue(existingPair(true));
      repository.updateActivation.mockResolvedValue({
        ...existingPair(false),
        activatedAt: new Date("2026-08-01T00:00:00.000Z"),
      });

      const result = await service.activateNetworkAsset(
        SEPOLIA_ID,
        ASSET_ID,
        false,
        ADMIN_ID,
      );

      expect(repository.updateActivation).toHaveBeenCalledWith(
        TX,
        SEPOLIA_ID,
        ASSET_ID,
        false,
      );
      expect(audit.record).toHaveBeenCalledWith(TX, {
        actorType: "admin",
        actorId: ADMIN_ID,
        action: "NETWORK_ASSET_DEACTIVATED",
        entityType: "network_asset",
        entityId: null,
        metadata: { networkId: SEPOLIA_ID, assetId: ASSET_ID },
      });
      expect(result).toEqual({
        networkId: SEPOLIA_ID,
        assetId: ASSET_ID,
        isActive: false,
        activatedAt: "2026-08-01T00:00:00.000Z",
      });
    });

    it("aktifleştirme: NETWORK_ASSET_ACTIVATED audit action'ı yazılır", async () => {
      repository.findNetworkAsset.mockResolvedValue(existingPair(false));
      repository.updateActivation.mockResolvedValue(existingPair(true));

      await service.activateNetworkAsset(SEPOLIA_ID, ASSET_ID, true, ADMIN_ID);

      expect(audit.record).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ action: "NETWORK_ASSET_ACTIVATED" }),
      );
    });
  });
});
