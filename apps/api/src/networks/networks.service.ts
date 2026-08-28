import { Injectable } from "@nestjs/common";
import type { ChainType } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { ResourceNotFoundException } from "../common/exceptions/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
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

/** `PATCH /admin/network-assets/:networkId/:assetId` yanıtı — güncellenmiş çift (`docs/03` §5.3). */
export interface NetworkAssetActivationView {
  networkId: string;
  assetId: string;
  isActive: boolean;
  activatedAt: string | null;
}

/**
 * Network/Asset master data okuma iş mantığı (`docs/04_BACKEND_SPEC.md` §1
 * service katmanı). Aktivasyon yazımı (admin `PATCH`) İterasyon 3'te eklenir.
 */
@Injectable()
export class NetworksService {
  constructor(
    private readonly repository: NetworksRepository,
    // `$transaction` orkestrasyonu servis katmanında yapılır — `network_assets`
    // güncellemesi ile audit yazımı tek atomik blokta (`docs/04_BACKEND_SPEC.md` §7).
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
   * Tek bir ağı `§5.3` yanıt şekline maplanmış olarak döner; yoksa `null`
   * (çağıran karar verir — ör. `WalletsService` bunu `NETWORK_ASSET_INACTIVE`'e
   * indirger, `docs/03_API_CONTRACTS.md` §5.2 hata listesi RESOURCE_NOT_FOUND
   * içermez). `chainType`, adres format doğrulamasının hangi dala gireceğini
   * belirler.
   */
  async findNetworkById(networkId: string): Promise<NetworkView | null> {
    const network = await this.repository.findNetworkById(networkId);
    if (!network) {
      return null;
    }
    return {
      id: network.id,
      name: network.name,
      chainType: network.chainType,
      chainId: network.chainId,
      confirmationThreshold: network.confirmationThreshold,
    };
  }

  /**
   * Bir ağda en az bir `(network, asset)` çifti `is_active = true` mi
   * (`docs/01_DOMAIN_MODEL.md` §4 madde 1). Watch-only cüzdan eklenebilmesi için
   * ağın aktif bir varlığı olmalıdır; aksi halde `NETWORK_ASSET_INACTIVE`.
   */
  async hasActiveAsset(networkId: string): Promise<boolean> {
    const rows = await this.repository.findNetworkAssets(networkId, {
      activeOnly: true,
    });
    return rows.length > 0;
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

  /**
   * Admin bir `(network, asset)` çiftini aktif/pasif yapar
   * (`docs/03_API_CONTRACTS.md` §5.3, `mimari-kararlar.md` AP-001/AUTH-003).
   * Çift yoksa `RESOURCE_NOT_FOUND`. Aksi halde tek bir `$transaction` içinde:
   * `network_assets` güncellenir + `audit_logs`'a `NETWORK_ASSET_ACTIVATED` veya
   * `NETWORK_ASSET_DEACTIVATED` yazılır (`docs/04_BACKEND_SPEC.md` §7). Bu, sonraki
   * tüm audit yazımlarının temel kalıbıdır.
   */
  async activateNetworkAsset(
    networkId: string,
    assetId: string,
    isActive: boolean,
    adminUserId: string,
  ): Promise<NetworkAssetActivationView> {
    const existing = await this.repository.findNetworkAsset(networkId, assetId);
    if (!existing) {
      throw new ResourceNotFoundException("Ağ/varlık çifti bulunamadı.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await this.repository.updateActivation(
        tx,
        networkId,
        assetId,
        isActive,
      );
      await this.audit.record(tx, {
        actorType: "admin",
        actorId: adminUserId,
        action: isActive
          ? "NETWORK_ASSET_ACTIVATED"
          : "NETWORK_ASSET_DEACTIVATED",
        entityType: "network_asset",
        entityId: null,
        metadata: { networkId, assetId },
      });
      return row;
    });

    return {
      networkId: updated.networkId,
      assetId: updated.assetId,
      isActive: updated.isActive,
      activatedAt: updated.activatedAt?.toISOString() ?? null,
    };
  }
}
