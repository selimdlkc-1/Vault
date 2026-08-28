import { Injectable } from "@nestjs/common";
import type { WalletType } from "@prisma/client";
import { isValidAddress } from "@vault/chain-providers";
import {
  NetworkAssetInactiveException,
  WalletAddressAlreadyExistsException,
  WalletAddressInvalidFormatException,
} from "../common/exceptions/domain.exception";
import { NetworksService } from "../networks/networks.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { WalletsRepository } from "./wallets.repository";

/** `POST /wallets/watch-only` yanıtı — oluşturulan cüzdan (`docs/03_API_CONTRACTS.md` §5.2). */
export interface WalletView {
  id: string;
  userId: string;
  networkId: string;
  type: WalletType;
  address: string;
  createdAt: string;
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
}
