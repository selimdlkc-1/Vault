import { Injectable } from "@nestjs/common";
import type { ChainType, MintOperation, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** `mint_operations` insert girdisi (`docs/02_DATABASE_SCHEMA.md` §2.11). */
export interface CreateMintOperationData {
  adminId: string;
  walletId: string;
  assetId: string;
  /** En küçük birimde BigInt string — asla JS `number`. */
  amount: string;
  /** Mock kontratın `mint()` çağrısının onaylanmış işlem hash'i. */
  txHash: string;
}

/** Mint hedefi cüzdan + kendi ağı — provider seçimi için `chainType`/`chainId`. */
export interface MintTargetWallet {
  id: string;
  networkId: string;
  address: string;
  network: { chainType: ChainType; chainId: string };
}

/** Mint edilecek varlık — mock kontrat adresi + hangi ağda tanımlı olduğu. */
export interface MintTargetAsset {
  id: string;
  networkId: string;
  symbol: string;
  decimals: number;
  contractAddress: string | null;
}

/**
 * `admin/` modülünün veri erişimi (`.claude/rules/15-backend-data.md` — yalnızca
 * Prisma çağrısı, iş kuralı yok). `wallets` / `assets` okumaları için başka bir
 * modülün repository'si import edilmez; `MovementsModule` ile aynı gerekçeyle
 * (modüller arası repository sızıntısını önlemek, `docs/04_BACKEND_SPEC.md` §3)
 * doğrudan sorgu yapılır. Yalnızca `AdminModule` içindeki `MintService`'e
 * enjekte edilir.
 */
@Injectable()
export class MintRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Mint hedefi cüzdanı ağıyla birlikte döner; yoksa `null`. */
  findWallet(walletId: string): Promise<MintTargetWallet | null> {
    return this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: {
        id: true,
        networkId: true,
        address: true,
        network: { select: { chainType: true, chainId: true } },
      },
    });
  }

  /** Mint edilecek varlığı döner; yoksa `null`. */
  findAsset(assetId: string): Promise<MintTargetAsset | null> {
    return this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        networkId: true,
        symbol: true,
        decimals: true,
        contractAddress: true,
      },
    });
  }

  /**
   * `mint_operations` satırını çağıranın `$transaction`'ı içinde yazar
   * (`docs/04_BACKEND_SPEC.md` §7 — insert + `audit_logs` yazımı atomik).
   */
  create(
    tx: Prisma.TransactionClient,
    data: CreateMintOperationData,
  ): Promise<MintOperation> {
    return tx.mintOperation.create({
      data: {
        adminId: data.adminId,
        walletId: data.walletId,
        assetId: data.assetId,
        amount: data.amount,
        txHash: data.txHash,
      },
    });
  }
}
