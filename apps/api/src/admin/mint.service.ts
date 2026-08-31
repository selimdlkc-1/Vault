import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChainProviderUnavailableException as ChainProviderUnavailableError } from "@vault/chain-providers";
import type { MintInput } from "@vault/types";
import { AuditService } from "../audit/audit.service";
import {
  ChainProviderUnavailableException,
  ResourceNotFoundException,
} from "../common/exceptions/domain.exception";
import type { EnvConfig } from "../config/env.schema";
import { ChainProviderFactory } from "../networks/chain-provider.factory";
import { PrismaService } from "../prisma/prisma.service";
import { MintRepository } from "./mint.repository";

/** `POST /admin/mint` yanıtı — oluşturulan `MintOperation` (`docs/03_API_CONTRACTS.md` §5.8). */
export interface MintOperationView {
  id: string;
  adminId: string;
  walletId: string;
  assetId: string;
  /** En küçük birimde mint edilen tutar (BigInt string). */
  amount: string;
  txHash: string;
  createdAt: string;
}

/**
 * Admin mint iş mantığı (`.claude/rules/10` service katmanı, `docs/01_DOMAIN_MODEL.md`
 * §2.10). Sırasıyla: cüzdan/varlık doğrulama → provider seçimi → mock kontrat
 * `mint()` çağrısı (senkron, `tx.wait()`) → tek `$transaction` içinde
 * `mint_operations` insert + `MINT_EXECUTED` audit (`docs/04_BACKEND_SPEC.md` §7).
 *
 * `mint`, bir `Transfer` kaydı değildir — `transfers` / `TransferStateMachine`'e
 * hiç dokunmaz (`docs/01` §2.10).
 */
@Injectable()
export class MintService {
  private readonly logger = new Logger(MintService.name);

  constructor(
    private readonly repository: MintRepository,
    private readonly chainProviderFactory: ChainProviderFactory,
    // `$transaction` orkestrasyonu servis katmanında — `mint_operations` insert
    // ile `audit_logs` yazımı tek atomik blokta (`docs/04_BACKEND_SPEC.md` §7).
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async mint(adminId: string, input: MintInput): Promise<MintOperationView> {
    const { walletId, assetId, amount } = input;

    const wallet = await this.repository.findWallet(walletId);
    if (!wallet) {
      throw new ResourceNotFoundException("Cüzdan bulunamadı.");
    }

    const asset = await this.repository.findAsset(assetId);
    if (!asset) {
      throw new ResourceNotFoundException("Varlık bulunamadı.");
    }

    // Mint yalnızca mock kontrat tabanlı bir varlık için anlamlıdır (native
    // ETH/BNB/TRX mint edilemez) ve varlık, cüzdanın ağında tanımlı olmalıdır —
    // aksi halde yanlış zincirde yanlış kontrat çağrılırdı.
    if (asset.contractAddress === null || asset.networkId !== wallet.networkId) {
      throw new ResourceNotFoundException(
        "Seçilen cüzdan ve varlık aynı ağda eşleşen bir mint hedefi değil.",
      );
    }

    const provider = this.chainProviderFactory.getProvider({
      chainType: wallet.network.chainType,
      chainId: wallet.network.chainId,
    });

    let txHash: string;
    try {
      const result = await provider.mintToken(
        asset.contractAddress,
        wallet.address,
        amount,
        this.config.get("MINT_OPERATOR_PRIVATE_KEY"),
      );
      txHash = result.txHash;
    } catch (error) {
      if (error instanceof ChainProviderUnavailableError) {
        // Ham RPC hatası yalnızca structured log'a; istemciye Türkçe mesaj döner
        // (`docs/03_API_CONTRACTS.md` §3 mesaj politikası).
        this.logger.error(
          `mint() zincir çağrısı başarısız (${error.operation}): ${String(error.cause ?? error)}`,
        );
        throw new ChainProviderUnavailableException();
      }
      throw error;
    }

    const operation = await this.prisma.$transaction(async (tx) => {
      const created = await this.repository.create(tx, {
        adminId,
        walletId,
        assetId,
        amount,
        txHash,
      });
      await this.audit.record(tx, {
        actorType: "admin",
        actorId: adminId,
        action: "MINT_EXECUTED",
        entityType: "mint_operation",
        entityId: created.id,
        metadata: { walletId, assetId, amount },
      });
      return created;
    });

    return {
      id: operation.id,
      adminId: operation.adminId,
      walletId: operation.walletId,
      assetId: operation.assetId,
      amount: operation.amount,
      // `txHash` insert'te her zaman dolu geçer (mint başarılı olmadan buraya gelinmez).
      txHash: operation.txHash ?? txHash,
      createdAt: operation.createdAt.toISOString(),
    };
  }
}
