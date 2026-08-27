import { Injectable } from "@nestjs/common";
import type { Asset, Network, NetworkAsset } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** `network_assets` satırı + bağlı `asset` — asset okuma endpoint'inin ham kaynağı. */
export type NetworkAssetWithAsset = NetworkAsset & { asset: Asset };

/**
 * `networks` / `assets` / `network_assets` tablolarına erişim
 * (`docs/04_BACKEND_SPEC.md` §1 repository katmanı — yalnızca sorgu, iş kuralı
 * yok). Yalnızca `NetworksModule` içindeki servislere enjekte edilir.
 */
@Injectable()
export class NetworksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Tüm ağlar — ağın kendisi aktif/pasif olmaz (`docs/03_API_CONTRACTS.md` §5.3). */
  findAllNetworks(): Promise<Network[]> {
    return this.prisma.network.findMany({ orderBy: { name: "asc" } });
  }

  findNetworkById(id: string): Promise<Network | null> {
    return this.prisma.network.findUnique({ where: { id } });
  }

  /**
   * Bir ağa tanımlı `(network, asset)` çiftleri, aktivasyon durumuyla. `activeOnly`
   * true iken yalnızca `is_active = true` satırlar döner; Admin paneli `false`
   * geçerek pasif çiftleri de listeler (`docs/03_API_CONTRACTS.md` §5.3).
   */
  findNetworkAssets(
    networkId: string,
    options: { activeOnly: boolean },
  ): Promise<NetworkAssetWithAsset[]> {
    return this.prisma.networkAsset.findMany({
      where: {
        networkId,
        ...(options.activeOnly ? { isActive: true } : {}),
      },
      include: { asset: true },
      orderBy: { asset: { symbol: "asc" } },
    });
  }
}
