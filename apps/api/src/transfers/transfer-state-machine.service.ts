import { Injectable } from "@nestjs/common";
import type { Prisma, Transfer, TransferState } from "@prisma/client";
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
  new Map([[null, ["draft"] as const]]);

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
 * Bu iterasyonda yalnızca `enter()` (giriş durumu `draft`) vardır. İterasyon 2-5
 * her yeni geçiş için buraya bir metod ekler; her metod önce
 * `assertTransitionAllowed` guard'ından geçer, whitelist ve terminal-durum
 * kuralları tek noktada uygulanır.
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
