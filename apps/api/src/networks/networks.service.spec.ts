import type { Asset, Network } from "@prisma/client";
import { ResourceNotFoundException } from "../common/exceptions/domain.exception";
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

describe("NetworksService", () => {
  let repository: jest.Mocked<
    Pick<NetworksRepository, "findAllNetworks" | "findNetworkById" | "findNetworkAssets">
  >;
  let service: NetworksService;

  beforeEach(() => {
    repository = {
      findAllNetworks: jest.fn(),
      findNetworkById: jest.fn(),
      findNetworkAssets: jest.fn(),
    };
    service = new NetworksService(repository as unknown as NetworksRepository);
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
});
