import { Injectable } from "@nestjs/common";
import type { Prisma, Transfer, TransferState } from "@prisma/client";
import { TransferInvalidTransitionException } from "../common/exceptions/domain.exception";
import { TransfersRepository } from "./transfers.repository";

/**
 * İzin verilen geçiş tablosu (whitelist). Anahtar `null` = giriş durumu (henüz
 * kayıt yok). Bu iterasyonda **tek satır** vardır (`null → draft`); İterasyon 2-5
 * her biri kendi geçişini (`draft → pending_signature`, `pending_signature →
 * signed`, ...) buraya ekler — mevcut yapı bozulmadan genişletilir
 * (`docs/01_DOMAIN_MODEL.md` §5.2, `.claude/rules/13-critical-modules.md`).
 *
 * `Map` kullanılır çünkü `null` bir obje anahtarı olarak string'e (`"null"`)
 * dönüşürdü; `Map` gerçek `null` anahtarını korur.
 */
const ALLOWED_TRANSITIONS: ReadonlyMap<TransferState | null, readonly TransferState[]> =
  new Map<TransferState | null, readonly TransferState[]>([
    [null, ["draft"]],
    // İterasyon 2 (§5.2): `draft → pending_signature` step-up + guard'lar geçince.
    // `draft → failed` hedefi İterasyon 3'ün başarısız imzalama senaryosu için
    // burada tanımlanır ama bu iterasyonda tetiklenmez.
    ["draft", ["pending_signature", "failed"]],
    // İterasyon 3 (§5.3): `signing` worker başarıda `signed`'e, imzalama
    // hatasında doğrudan `failed`'e geçirir (`docs/01_DOMAIN_MODEL.md` §5.2).
    ["pending_signature", ["signed", "failed"]],
  ]);

/**
 * Terminal durumlar — bu durumlardan **hiçbir** geçiş yapılamaz
 * (`docs/mimari-kararlar.md` W-003, `docs/01_DOMAIN_MODEL.md` §5.2). İterasyon
 * 3-5'teki worker'lar ayrı bir terminal-state kontrolü icat etmez, bu sabite ve
 * `assertTransitionAllowed`'a güvenir.
 */
export const TERMINAL_STATES: ReadonlySet<TransferState> = new Set([
  "confirmed",
  "failed",
  "dropped",
]);

/**
 * Tanımsız bir durum geçişi denendiğinde fırlatılır (`.claude/rules/13`). Bu
 * iterasyonda pratikte erişilemez (`enter()` yalnızca `null → draft` yapar);
 * İterasyon 2 bunu `TRANSFER_INVALID_TRANSITION` domain exception'ına bağlar.
 */
export class InvalidTransitionError extends Error {
  constructor(
    readonly fromState: TransferState | null,
    readonly toState: TransferState,
  ) {
    super(
      `Geçersiz transfer durum geçişi: ${fromState ?? "(giriş)"} → ${toState}`,
    );
    this.name = "InvalidTransitionError";
  }
}

/**
 * `transitionTo()` opsiyonel yan-veri girdisi (İterasyon 3+). `failureReason`
 * yalnızca `failed` hedefinde `transfers.failure_reason`'a yazılır
 * (`docs/01_DOMAIN_MODEL.md` §5.2); `metadata` `transfer_state_events` satırına
 * eklenir (ör. worker'ın sadeleştirilmiş hata nedeni). İterasyon 4 `txHash` için
 * bu tipi genişletir.
 */
export interface TransitionOptions {
  failureReason?: string;
  metadata?: Prisma.InputJsonValue;
}

/** `TransferStateMachine.enter()` girdisi — draft transfer'in tüm alanları. */
export interface EnterTransferData {
  walletId: string;
  /** Gönderen cüzdanın ağı — transfer kaydının `network_id`'si (cross-network guard girdisi). */
  networkId: string;
  assetId: string;
  toAddress: string;
  /** En küçük birimde (wei/sun) BigInt string. */
  amount: string;
  idempotencyKey: string;
}

/**
 * **Kritik modül** (`.claude/rules/13-critical-modules.md`). `Transfer.state`
 * alanına yazan **tek** kod yolu budur; hiçbir controller/repository/worker bu
 * alana doğrudan `UPDATE` uygulamaz (`docs/04_BACKEND_SPEC.md` §1 kesin kural).
 *
 * `enter()` giriş durumunu (`null → draft`) yazar; `transitionTo()` sonraki tüm
 * geçişlerin ortak yoludur (İterasyon 2: `draft → pending_signature`). Her ikisi
 * de `assertTransitionAllowed` guard'ından geçer — whitelist ve terminal-durum
 * kuralları tek noktada uygulanır. İterasyon 3-5 whitelist'i genişletir, bu
 * metotları bypass etmez.
 */
@Injectable()
export class TransferStateMachine {
  constructor(private readonly repository: TransfersRepository) {}

  /**
   * Giriş geçişi `null → draft`: `transfers` insert + `transfer_state_events`
   * insert (`fromState: null, toState: 'draft', actor: 'user'`) tek
   * `$transaction` içinde (`docs/04_BACKEND_SPEC.md` §7). Draft oluşturma
   * **audit'e yazılmaz** (`docs/03_API_CONTRACTS.md` §5.4 — henüz zincire hiçbir
   * şey gönderilmedi); ilk audit kaydı `draft → pending_signature` geçişinde
   * yazılır (İterasyon 2).
   */
  async enter(
    tx: Prisma.TransactionClient,
    data: EnterTransferData,
  ): Promise<Transfer> {
    this.assertTransitionAllowed(null, "draft");

    const transfer = await this.repository.insertTransfer(tx, {
      walletId: data.walletId,
      networkId: data.networkId,
      assetId: data.assetId,
      toAddress: data.toAddress,
      amount: data.amount,
      state: "draft",
      idempotencyKey: data.idempotencyKey,
    });

    await this.repository.insertStateEvent(tx, {
      transferId: transfer.id,
      fromState: null,
      toState: "draft",
      actor: "user",
    });

    return transfer;
  }

  /**
   * Genel durum geçişi (İterasyon 2-5 ortak yolu). Çağıranın `$transaction`'ı
   * içinde: (1) transfer'in güncel `state`'ini taze okur, (2) `fromState → toState`
   * whitelist + terminal-durum guard'ından geçirir — izin verilmeyen geçiş
   * `TransferInvalidTransitionException` (`docs/03_API_CONTRACTS.md` §3
   * `TRANSFER_INVALID_TRANSITION`; terminal durumlar da bu koda düşer), (3)
   * `transfers.state`'i günceller + `transfer_state_events`'e append eder — ikisi
   * aynı atomik blokta (`docs/04_BACKEND_SPEC.md` §7).
   *
   * Bu iterasyonda audit yazımı **burada değil** çağıran serviste yapılır
   * (`TransfersService.confirm` aynı `$transaction` içinde `TRANSFER_STATE_CHANGED`
   * kaydını düşer, `docs/04` §7 kalıbı) — state machine'in `AuditService`
   * bağımlılığı yoktur.
   */
  async transitionTo(
    tx: Prisma.TransactionClient,
    transferId: string,
    toState: TransferState,
    actor: string,
    options?: TransitionOptions,
  ): Promise<Transfer> {
    const current = await this.repository.findByIdInTx(tx, transferId);
    if (!current) {
      // Geçiş öncesi servis katmanı transfer'i zaten çekti; buraya düşmesi
      // eşzamanlı silme demektir — geçersiz geçiş olarak ele alınır.
      throw new TransferInvalidTransitionException();
    }

    try {
      this.assertTransitionAllowed(current.state, toState);
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        throw new TransferInvalidTransitionException();
      }
      throw error;
    }

    const updated =
      options?.failureReason === undefined
        ? await this.repository.updateState(tx, transferId, toState)
        : await this.repository.updateState(tx, transferId, toState, {
            failureReason: options.failureReason,
          });
    await this.repository.insertStateEvent(tx, {
      transferId,
      fromState: current.state,
      toState,
      actor,
      ...(options?.metadata === undefined ? {} : { metadata: options.metadata }),
    });
    return updated;
  }

  /**
   * Whitelist + terminal-durum guard'ı — her geçiş metodu bununla başlar.
   * `fromState` terminalse veya `fromState → toState` whitelist'te yoksa
   * `InvalidTransitionError`.
   */
  private assertTransitionAllowed(
    fromState: TransferState | null,
    toState: TransferState,
  ): void {
    if (fromState !== null && TERMINAL_STATES.has(fromState)) {
      throw new InvalidTransitionError(fromState, toState);
    }
    const allowed = ALLOWED_TRANSITIONS.get(fromState) ?? [];
    if (!allowed.includes(toState)) {
      throw new InvalidTransitionError(fromState, toState);
    }
  }
}
