import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { type ChainType, Prisma, type Transfer } from "@prisma/client";
import { isValidAddress } from "@vault/chain-providers";
import type { CreateTransferInput, TransferStateValue } from "@vault/types";
import type { Queue } from "bullmq";
import { SIGNING_QUEUE } from "../workers/signing/signing.queue";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import {
  AuthStepUpRequiredException,
  ForbiddenNotOwnerException,
  NetworkAssetInactiveException,
  TransferInvalidTransitionException,
  WalletCrossNetworkMismatchException,
  WalletInsufficientBalanceException,
} from "../common/exceptions/domain.exception";
import { NetworksService } from "../networks/networks.service";
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

/** `POST /transfers/:id/confirm` yanıtı (`docs/03_API_CONTRACTS.md` §5.4). */
export interface ConfirmTransferResult {
  state: TransferStateValue;
}

/**
 * `signing` worker'ının (Faz 5 §5.3) ham işlem kurmak için ihtiyaç duyduğu
 * transfer bağlamı — şifreli key materyali hariç (o `WalletsService.getSigningMaterial`'dan
 * gelir). `state !== 'pending_signature'` ise `getSigningContext` `null` döner
 * (worker sessizce çıkar — idempotency, `docs/04_BACKEND_SPEC.md` §8).
 */
export interface SigningContext {
  transferId: string;
  walletId: string;
  toAddress: string;
  /** En küçük birimde (wei/sun) BigInt string. */
  amount: string;
  chain: { chainType: ChainType; chainId: string };
  asset: { contractAddress: string | null; decimals: number };
}

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
    // Step-up authentication (`docs/mimari-kararlar.md` SEC-008) — `AuthModule`'den
    // enjekte edilir; `draft → pending_signature` öncesi şifre tekrarı doğrulaması.
    private readonly authService: AuthService,
    // Cross-network guard'ın ağ `chainType`'ı + `(network, asset)` aktiflik
    // tekrar kontrolü için (`docs/mimari-kararlar.md` AUTH-003/AUTH-004).
    private readonly networksService: NetworksService,
    // `TRANSFER_STATE_CHANGED` audit kaydı, geçişle aynı `$transaction` içinde
    // (`docs/04_BACKEND_SPEC.md` §7).
    private readonly audit: AuditService,
    // İterasyon 3 (§5.3): `confirm()` `pending_signature`'a geçtikten sonra
    // `signing` kuyruğuna iş bırakır (`docs/04_BACKEND_SPEC.md` §8). Kuyruk
    // `TransfersModule`'de `BullModule.registerQueue({ name: 'signing' })` ile
    // kayıtlı; processor ayrı `SigningQueueModule`'de yaşar.
    @InjectQueue(SIGNING_QUEUE) private readonly signingQueue: Queue,
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

  /**
   * `POST /transfers/:id/confirm` (`docs/03_API_CONTRACTS.md` §5.4,
   * `docs/01_DOMAIN_MODEL.md` §5.2 `draft → pending_signature`). Kontrol sırası
   * **önemlidir** (`.claude/rules/03-security-baseline.md` madde 3-4, iterasyon
   * "Risk / dikkat"): step-up EN ÖNCE — yanlış şifreyle gelen bir istek
   * cross-network/bakiye guard'larının hiçbirini tetiklemeden reddedilir (hata
   * mesajı üzerinden bilgi sızıntısı önlemi). Sırasıyla:
   * 1. Transfer + sahiplik (`wallet.user_id`) — yok **veya** başkasının →
   *    `FORBIDDEN_NOT_OWNER` (ayrılmaz, §5.4 hata listesi `RESOURCE_NOT_FOUND`
   *    içermez).
   * 2. Mevcut durum `draft` değil → `TRANSFER_INVALID_TRANSITION` (terminal
   *    durum da bu koda düşer).
   * 3. **Step-up**: `AuthService.verifyPassword` başarısız → `AUTH_STEP_UP_REQUIRED`.
   * 4. Cross-network guard: hedef adres, gönderen cüzdanın ağının formatına
   *    uymuyorsa → `WALLET_CROSS_NETWORK_MISMATCH` (yalnızca backend,
   *    `docs/mimari-kararlar.md` AUTH-004).
   * 5. `(network, asset)` aktiflik tekrar kontrolü (arada pasifleşmiş olabilir)
   *    → `NETWORK_ASSET_INACTIVE`.
   * 6. Bakiye yeterliliği — DB önbelleğinden (`balance_caches`), canlı RPC yok
   *    (`docs/mimari-kararlar.md` I-003); worker yeniden kontrolü İterasyon 3 →
   *    `WALLET_INSUFFICIENT_BALANCE`.
   *
   * Tüm kontroller geçerse tek `$transaction`:
   * `TransferStateMachine.transitionTo(draft → pending_signature, actor: 'user')`
   * + `AuditService.record` `TRANSFER_STATE_CHANGED`. Bu iterasyonda bir kuyruğa
   * iş bırakılmaz (signing kuyruğu İterasyon 3).
   */
  async confirm(
    userId: string,
    transferId: string,
    currentPassword: string,
  ): Promise<ConfirmTransferResult> {
    const transfer = await this.repository.findByIdWithOwner(transferId);
    if (!transfer || transfer.wallet.userId !== userId) {
      throw new ForbiddenNotOwnerException();
    }

    if (transfer.state !== "draft") {
      throw new TransferInvalidTransitionException();
    }

    // (3) Step-up EN ÖNCE — diğer guard'lardan önce.
    const passwordValid = await this.authService.verifyPassword(
      userId,
      currentPassword,
    );
    if (!passwordValid) {
      throw new AuthStepUpRequiredException();
    }

    // (4) Cross-network guard — gönderen cüzdanın ağının `chainType`'ına göre
    // hedef adres format doğrulaması (EIP-55 / base58check).
    const network = await this.networksService.findNetworkById(
      transfer.networkId,
    );
    if (!network || !isValidAddress(network.chainType, transfer.toAddress)) {
      throw new WalletCrossNetworkMismatchException();
    }

    // (5) `(network, asset)` aktiflik tekrar kontrolü.
    const assetActive = await this.networksService.isNetworkAssetActive(
      transfer.networkId,
      transfer.assetId,
    );
    if (!assetActive) {
      throw new NetworkAssetInactiveException();
    }

    // (6) Bakiye yeterliliği — `BigInt` karşılaştırması, asla JS `number`.
    const cachedBalance = await this.walletsService.getCachedBalanceRaw(
      transfer.walletId,
      transfer.assetId,
    );
    if (cachedBalance < BigInt(transfer.amount)) {
      throw new WalletInsufficientBalanceException();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await this.stateMachine.transitionTo(
        tx,
        transferId,
        "pending_signature",
        "user",
      );
      await this.audit.record(tx, {
        actorType: "user",
        actorId: userId,
        action: "TRANSFER_STATE_CHANGED",
        entityType: "transfer",
        entityId: transferId,
        metadata: { fromState: "draft", toState: "pending_signature" },
      });
      return result;
    });

    // Geçiş commit oldu → `signing` kuyruğuna iş bırak (`docs/04_BACKEND_SPEC.md`
    // §8 akış diyagramı: `$transaction` → `signing` job → HTTP 200). Job id
    // `${transferId}:signed` bileşik anahtarı (`docs/mimari-kararlar.md` I-005) —
    // aynı anahtarla ikinci job BullMQ deduplication ile yok sayılır (istemci
    // retry / eşzamanlı confirm çift imzalama tetikleyemez).
    await this.signingQueue.add(
      "sign",
      { transferId },
      { jobId: `${transferId}:signed` },
    );

    return { state: updated.state };
  }

  /**
   * `signing` worker'ı (Faz 5 §5.3) için transfer + ağ/varlık bağlamı. Transfer
   * yok **veya** `state !== 'pending_signature'` ise `null` — worker bunu "zaten
   * işlenmiş / terminal" olarak yorumlar ve hiçbir yan etki üretmeden çıkar
   * (`docs/04_BACKEND_SPEC.md` §8 idempotency). Şifreli key materyali burada
   * dönmez (`WalletsService.getSigningMaterial`).
   */
  async getSigningContext(transferId: string): Promise<SigningContext | null> {
    const transfer = await this.repository.findByIdForSigning(transferId);
    if (!transfer || transfer.state !== "pending_signature") {
      return null;
    }
    return {
      transferId: transfer.id,
      walletId: transfer.walletId,
      toAddress: transfer.toAddress,
      amount: transfer.amount,
      chain: {
        chainType: transfer.network.chainType,
        chainId: transfer.network.chainId,
      },
      asset: {
        contractAddress: transfer.asset.contractAddress,
        decimals: transfer.asset.decimals,
      },
    };
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
