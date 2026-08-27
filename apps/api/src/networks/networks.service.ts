import { Injectable } from "@nestjs/common";
import type { ChainType } from "@prisma/client";
import { ResourceNotFoundException } from "../common/exceptions/domain.exception";
import { NetworksRepository } from "./networks.repository";

/** `GET /networks` yanıt satırı (`docs/03_API_CONTRACTS.md` §5.3). */
export interface NetworkView {
  id: string;
  name: string;
  chainType: ChainType;
  chainId: string;
  confirmationThreshold: number;
}

/** `GET /networks/:networkId/assets` yanıt satırı (`docs/03_API_CONTRACTS.md` §5.3). */
export interface NetworkAssetView {
  id: string;
  symbol: string;
  decimals: number;
  contractAddress: string | null;
  isActive: boolean;
}

/**
 * Network/Asset master data okuma iş mantığı (`docs/04_BACKEND_SPEC.md` §1
 * service katmanı). Aktivasyon yazımı (admin `PATCH`) İterasyon 3'te eklenir.
 */
@Injectable()
export class NetworksService {
  constructor(private readonly repository: NetworksRepository) {}

  async listNetworks(): Promise<NetworkView[]> {
    const networks = await this.repository.findAllNetworks();
    return networks.map((network) => ({
      id: network.id,
      name: network.name,
      chainType: network.chainType,
      chainId: network.chainId,
      confirmationThreshold: network.confirmationThreshold,
    }));
  }

  /**
   * Bir ağın varlıklarını aktivasyon durumuyla listeler. Ağ yoksa
   * `RESOURCE_NOT_FOUND` (`docs/03_API_CONTRACTS.md` §5.3). `activeOnly`
   * varsayılan `true` — controller `ParseBoolPipe` + `DefaultValuePipe` ile geçirir.
   */
  async listAssetsForNetwork(
    networkId: string,
    activeOnly: boolean,
  ): Promise<NetworkAssetView[]> {
    const network = await this.repository.findNetworkById(networkId);
    if (!network) {
      throw new ResourceNotFoundException("Ağ bulunamadı.");
    }

    const rows = await this.repository.findNetworkAssets(networkId, { activeOnly });
    return rows.map((row) => ({
      id: row.asset.id,
      symbol: row.asset.symbol,
      decimals: row.asset.decimals,
      contractAddress: row.asset.contractAddress,
      isActive: row.isActive,
    }));
  }
}
