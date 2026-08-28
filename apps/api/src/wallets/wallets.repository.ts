import { Injectable } from "@nestjs/common";
import type { Prisma, Wallet } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** `wallets` insert girdisi — watch-only akışı (Faz 3 §3.1). */
export interface CreateWalletData {
  userId: string;
  networkId: string;
  type: Wallet["type"];
  address: string;
}

/**
 * `wallets` tablosuna erişim (`docs/04_BACKEND_SPEC.md` §1 repository katmanı —
 * yalnızca Prisma çağrısı, iş kuralı yok). Yalnızca `WalletsModule` içindeki
 * servislere enjekte edilir.
 */
@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `(network, address)` benzersizlik ön kontrolü — deterministik `409`
   * (`WALLET_ADDRESS_ALREADY_EXISTS`) için. Yarış durumunda DB `P2002` yine
   * `AllExceptionsFilter`'da aynı koda eşlenir.
   */
  findByNetworkAndAddress(
    networkId: string,
    address: string,
  ): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: { networkId_address: { networkId, address } },
    });
  }

  /**
   * Cüzdanı çağıranın `$transaction`'ı içinde yaratır (`docs/04_BACKEND_SPEC.md`
   * §7 — `wallets` insert + `audit_logs` yazımı atomik). `type = 'watch_only'`
   * için `derivation_index` / `encrypted_dek` yazılmaz (NULL kalır).
   */
  create(tx: Prisma.TransactionClient, data: CreateWalletData): Promise<Wallet> {
    return tx.wallet.create({
      data: {
        userId: data.userId,
        networkId: data.networkId,
        type: data.type,
        address: data.address,
      },
    });
  }
}
