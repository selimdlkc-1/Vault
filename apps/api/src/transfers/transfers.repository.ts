import { Injectable } from "@nestjs/common";
import type { Prisma, Transfer, TransferState } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * `transfers` insert girdisi (`docs/02_DATABASE_SCHEMA.md` §2.7). `state` alanı
 * bilinçli olarak zorunludur ve yalnızca `TransferStateMachine` tarafından
 * geçirilir — repository state değerini kendi başına seçmez
 * (`.claude/rules/13-critical-modules.md` kesin kural).
 */
export interface InsertTransferData {
  walletId: string;
  networkId: string;
  assetId: string;
  toAddress: string;
  /** En küçük birimde (wei/sun) BigInt string — asla JS `number`. */
  amount: string;
  state: TransferState;
  idempotencyKey: string;
}

/**
 * `transfer_state_events` insert girdisi (`docs/02_DATABASE_SCHEMA.md` §2.8).
 * Append-only; ilk kayıtta `fromState = null`.
 */
export interface InsertStateEventData {
  transferId: string;
  fromState: TransferState | null;
  toState: TransferState;
  /** `'user'` | `'system'` | `'worker:<name>'` — `TransferStateMachine` sınırlar. */
  actor: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * `transfers` / `transfer_state_events` tablolarına erişim
 * (`.claude/rules/15-backend-data.md` — yalnızca Prisma çağrısı, iş kuralı yok).
 * Yalnızca `TransfersModule` içindeki `TransferStateMachine` ve `TransfersService`'e
 * enjekte edilir.
 */
@Injectable()
export class TransfersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * İstemci-tarafı idempotency ön kontrolü (`docs/03_API_CONTRACTS.md` §7):
   * aynı `(kullanıcı, Idempotency-Key)` çiftiyle son 24 saatte oluşturulmuş bir
   * transfer var mı? Sahiplik `wallet.userId` join'iyle zorlanır — `transfers`
   * tablosunda ayrı `user_id` kolonu yoktur (`docs/mimari-kararlar.md` W-004).
   * `notBefore`'dan eski kayıtlar yok sayılır (24 saatlik TTL sorgu anında
   * `created_at`'e göre değerlendirilir, cron yoktur).
   */
  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
    notBefore: Date,
  ): Promise<Transfer | null> {
    return this.prisma.transfer.findFirst({
      where: {
        idempotencyKey,
        createdAt: { gte: notBefore },
        wallet: { userId },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * `(wallet_id, idempotency_key)` UNIQUE anahtarıyla doğrudan lookup — yalnızca
   * eşzamanlı çift gönderim `P2002` ihlaline düştüğünde, kazanan satırı geri
   * döndürmek için kullanılır (`TransfersService.createDraft` catch bloğu). TTL
   * penceresi uygulanmaz: amaç, yarışan isteğe de aynı transfer'i vermektir.
   */
  findByWalletAndIdempotencyKey(
    walletId: string,
    idempotencyKey: string,
  ): Promise<Transfer | null> {
    return this.prisma.transfer.findUnique({
      where: { walletId_idempotencyKey: { walletId, idempotencyKey } },
    });
  }

  /**
   * `transfers` satırını çağıranın `$transaction`'ı içinde yaratır
   * (`docs/04_BACKEND_SPEC.md` §7 — insert + `transfer_state_events` yazımı
   * atomik). Yalnızca `TransferStateMachine.enter()` çağırır.
   */
  insertTransfer(
    tx: Prisma.TransactionClient,
    data: InsertTransferData,
  ): Promise<Transfer> {
    return tx.transfer.create({
      data: {
        walletId: data.walletId,
        networkId: data.networkId,
        assetId: data.assetId,
        toAddress: data.toAddress,
        amount: data.amount,
        state: data.state,
        idempotencyKey: data.idempotencyKey,
      },
    });
  }

  /**
   * `transfer_state_events` satırını çağıranın `$transaction`'ı içinde ekler
   * (append-only — hiçbir zaman `UPDATE`/`DELETE`). Yalnızca `TransferStateMachine`
   * çağırır.
   */
  async insertStateEvent(
    tx: Prisma.TransactionClient,
    data: InsertStateEventData,
  ): Promise<void> {
    await tx.transferStateEvent.create({
      data: {
        transferId: data.transferId,
        fromState: data.fromState,
        toState: data.toState,
        actor: data.actor,
        metadata: data.metadata,
      },
    });
  }
}
