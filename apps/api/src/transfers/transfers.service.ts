import { Injectable } from "@nestjs/common";
import { Prisma, type Transfer } from "@prisma/client";
import type { CreateTransferInput, TransferStateValue } from "@vault/types";
import { PrismaService } from "../prisma/prisma.service";
import { WalletsService } from "../wallets/wallets.service";
import { TransfersRepository } from "./transfers.repository";
import { TransferStateMachine } from "./transfer-state-machine.service";

/**
 * `POST /transfers` yanıtındaki transfer görünümü (`docs/03_API_CONTRACTS.md`
 * §5.4). `idempotencyKey` bilinçli olarak dışarı sızdırılmaz.
 */
export interface TransferView {
  id: string;
  walletId: string;
  networkId: string;
  assetId: string;
  toAddress: string;
  /** En küçük birimde (wei/sun) BigInt string. */
  amount: string;
  state: TransferStateValue;
  txHash: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `createDraft` çıktısı — controller `isNew`'e göre `201` (yeni) veya `200`
 * (idempotency tekrar isteği) döner (`docs/03_API_CONTRACTS.md` §7).
 */
export interface CreateDraftResult {
  transfer: TransferView;
  isNew: boolean;
}

/** İstemci-tarafı idempotency penceresi — 24 saat (`docs/03_API_CONTRACTS.md` §7). */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Transfer iş mantığı (`.claude/rules/10` service katmanı). Bu iterasyonda
 * yalnızca draft oluşturma yolu var: sahiplik + managed tip kontrolü
 * (`WalletsService`), istemci-tarafı idempotency, ve `TransferStateMachine.enter()`.
 *
 * Cross-network guard, `(network, asset)` aktiflik ve bakiye yeterliliği
 * kontrolleri **bu iterasyonda yoktur** — `POST /transfers/:id/confirm`'ün
 * (İterasyon 2) kapsamıdır.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly repository: TransfersRepository,
    private readonly stateMachine: TransferStateMachine,
    // `$transaction` orkestrasyonu servis katmanında — `transfers` insert ile
    // `transfer_state_events` insert tek atomik blokta (`docs/04_BACKEND_SPEC.md` §7).
    private readonly prisma: PrismaService,
    // Sahiplik + managed tip kontrolü için `WalletsModule`'den enjekte edilir
    // (`docs/04_BACKEND_SPEC.md` §3 — `TransfersModule` sahiplik kontrolü için
    // `WalletsModule`'ü import eder).
    private readonly walletsService: WalletsService,
  ) {}

  /**
   * `POST /transfers` (`docs/03_API_CONTRACTS.md` §5.4), sırasıyla:
   * 1. Gönderen cüzdan sahiplik + managed tip kontrolü → `FORBIDDEN_NOT_OWNER` /
   *    `WALLET_NOT_MANAGED` (`WalletsService.findOwnedManagedWallet`).
   * 2. `(userId, Idempotency-Key)` ile son 24 saatte bir transfer varsa onu
   *    `isNew: false` ile döner (yeni satır açılmaz) → controller `200`.
   * 3. Yoksa `TransferStateMachine.enter()` ile draft oluşturur → `isNew: true`
   *    → controller `201`.
   *
   * Eşzamanlı çift gönderim `(wallet_id, idempotency_key)` UNIQUE'i ihlal ederse
   * (`P2002`), kazanan satır geri döndürülür (`isNew: false`) — istemci retry'ı
   * asla iki transfer oluşturamaz.
   */
  async createDraft(
    userId: string,
    dto: CreateTransferInput,
    idempotencyKey: string,
  ): Promise<CreateDraftResult> {
    const wallet = await this.walletsService.findOwnedManagedWallet(
      userId,
      dto.walletId,
    );

    const notBefore = new Date(Date.now() - IDEMPOTENCY_TTL_MS);
    const existing = await this.repository.findByIdempotencyKey(
      userId,
      idempotencyKey,
      notBefore,
    );
    if (existing) {
      return { transfer: this.toView(existing), isNew: false };
    }

    try {
      const created = await this.prisma.$transaction((tx) =>
        this.stateMachine.enter(tx, {
          walletId: wallet.id,
          networkId: wallet.networkId,
          assetId: dto.assetId,
          toAddress: dto.toAddress,
          amount: dto.amount,
          idempotencyKey,
        }),
      );
      return { transfer: this.toView(created), isNew: true };
    } catch (error) {
      if (isIdempotencyKeyConflict(error)) {
        const raced = await this.repository.findByWalletAndIdempotencyKey(
          wallet.id,
          idempotencyKey,
        );
        if (raced) {
          return { transfer: this.toView(raced), isNew: false };
        }
      }
      throw error;
    }
  }

  private toView(transfer: Transfer): TransferView {
    return {
      id: transfer.id,
      walletId: transfer.walletId,
      networkId: transfer.networkId,
      assetId: transfer.assetId,
      toAddress: transfer.toAddress,
      amount: transfer.amount,
      state: transfer.state,
      txHash: transfer.txHash,
      failureReason: transfer.failureReason,
      createdAt: transfer.createdAt.toISOString(),
      updatedAt: transfer.updatedAt.toISOString(),
    };
  }
}

/**
 * `P2002` ihlali `transfers_wallet_id_idempotency_key_key` kısıtındaysa `true`.
 * Bu ihlal servis katmanında yakalanıp `200`'e çevrilir — `AllExceptionsFilter`'a
 * ulaşmasına izin verilmez (orada yanlışlıkla `EMAIL_ALREADY_EXISTS`'e eşlenirdi).
 */
function isIdempotencyKeyConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = Array.isArray(error.meta?.target)
    ? (error.meta.target as string[]).join(",")
    : String(error.meta?.target ?? "");
  return target.includes("idempotency_key");
}
