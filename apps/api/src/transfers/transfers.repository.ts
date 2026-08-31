import { Injectable } from "@nestjs/common";
import type { ChainType, Prisma, Transfer, TransferState } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Transfer + sahiplik için gereken tek alan (`wallet.user_id` — `transfers`'ta
 * ayrı `user_id` yoktur, `docs/mimari-kararlar.md` W-004). `TransfersService.confirm`
 * (Faz 5 §5.2) sahiplik kontrolü + guard girdileri için bunu okur.
 */
export type TransferWithOwner = Transfer & { wallet: { userId: string } };

/**
 * Transfer + `signing` worker'ının ham işlem kurması için gereken ağ/varlık
 * bağlamı (Faz 5 §5.3). `contractAddress === null` → native coin transferi.
 */
export type TransferWithChainContext = Transfer & {
  network: { chainType: ChainType; chainId: string };
  asset: { contractAddress: string | null; decimals: number };
};

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
   * Tek bir transfer, sahiplik kontrolü için `wallet.user_id` ile birlikte
   * (Faz 5 §5.2 `POST /transfers/:id/confirm`). Bulunamazsa `null` — çağıran
   * (`TransfersService`) sahiplikle birleştirip `FORBIDDEN_NOT_OWNER`'a indirger
   * (varlık sızıntısını önlemek için "yok" ile "başkasının" ayrılmaz,
   * `docs/03_API_CONTRACTS.md` §5.4 hata listesi `RESOURCE_NOT_FOUND` içermez).
   */
  findByIdWithOwner(transferId: string): Promise<TransferWithOwner | null> {
    return this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: { wallet: { select: { userId: true } } },
    });
  }

  /**
   * Transfer'i çağıranın `$transaction`'ı içinde okur — `TransferStateMachine.transitionTo`
   * geçiş öncesi güncel `state`'i taze okur (whitelist kontrolü + `from_state`
   * kaydı için), yazımla aynı atomik blokta.
   */
  findByIdInTx(
    tx: Prisma.TransactionClient,
    transferId: string,
  ): Promise<Transfer | null> {
    return tx.transfer.findUnique({ where: { id: transferId } });
  }

  /**
   * `transfers.state`'i (ve `failed` geçişlerinde `failure_reason`'ı) çağıranın
   * `$transaction`'ı içinde günceller. Yalnızca `TransferStateMachine` çağırır
   * (`.claude/rules/13-critical-modules.md` kesin kural — bu alana başka hiçbir
   * kod yolu `UPDATE` uygulamaz). `extra.failureReason` verilmezse `failure_reason`
   * dokunulmaz (mevcut değeri korunur).
   */
  updateState(
    tx: Prisma.TransactionClient,
    transferId: string,
    state: TransferState,
    extra?: { failureReason?: string },
  ): Promise<Transfer> {
    return tx.transfer.update({
      where: { id: transferId },
      data: {
        state,
        ...(extra?.failureReason !== undefined
          ? { failureReason: extra.failureReason }
          : {}),
      },
    });
  }

  /**
   * `signing` worker'ı için transfer + ağ (`chain_type`/`chain_id`) + varlık
   * (`contract_address`/`decimals`) bağlamı tek sorguda (Faz 5 §5.3). Cüzdanın
   * şifreli key materyali burada **okunmaz** — o, `WalletsService.getSigningMaterial`
   * üzerinden `WalletsModule`'den alınır (modül sahipliği, `.claude/rules/10`).
   * Bulunamazsa `null`.
   */
  findByIdForSigning(
    transferId: string,
  ): Promise<TransferWithChainContext | null> {
    return this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        network: { select: { chainType: true, chainId: true } },
        asset: { select: { contractAddress: true, decimals: true } },
      },
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
