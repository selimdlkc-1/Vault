import { randomUUID } from "node:crypto";
import type { Prisma, Transfer } from "@prisma/client";

/**
 * `TransfersRepository`'nin bellek-içi fake'i — integration/regresyon HTTP
 * testlerinde gerçek DB'ye bağlanmadan `TransfersService` + `TransferStateMachine`
 * akışını uçtan uca koşturmak için (`.claude/rules/30-testing.md`,
 * `docs/08_TESTING_STRATEGY.md` §5). `transfers.controller.spec.ts` ve
 * `transfers.regression.spec.ts` bunu paylaşır — her iki dosyada ayrı kopya
 * tutulmaz.
 *
 * `seed(row, ownerId, events?)` bir transfer'i (ve en az bir `null → draft`
 * denetim izi kaydını) yerleştirir; `rows` / `stateEvents` / `stateEventRows`
 * doğrudan assert edilebilir.
 */
export class InMemoryTransfersRepository {
  readonly rows: Transfer[] = [];
  /** `TransferStateMachine.enter()` / `transitionTo()`'nun yazdığı ham state-event girdileri. */
  readonly stateEvents: unknown[] = [];
  readonly owners = new Map<string, string>();
  readonly stateEventRows: {
    id: string;
    transferId: string;
    fromState: Transfer["state"] | null;
    toState: Transfer["state"];
    occurredAt: Date;
    actor: string;
    metadata: unknown;
  }[] = [];

  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
    notBefore: Date,
  ): Promise<Transfer | null> {
    const hit = this.rows.find(
      (r) =>
        r.idempotencyKey === idempotencyKey &&
        r.createdAt.getTime() >= notBefore.getTime(),
    );
    return Promise.resolve(hit ?? null);
  }

  findByWalletAndIdempotencyKey(
    walletId: string,
    idempotencyKey: string,
  ): Promise<Transfer | null> {
    return Promise.resolve(
      this.rows.find(
        (r) => r.walletId === walletId && r.idempotencyKey === idempotencyKey,
      ) ?? null,
    );
  }

  insertTransfer(
    tx: Prisma.TransactionClient,
    data: {
      walletId: string;
      networkId: string;
      assetId: string;
      toAddress: string;
      amount: string;
      state: Transfer["state"];
      idempotencyKey: string;
    },
  ): Promise<Transfer> {
    const now = new Date();
    const row: Transfer = {
      id: randomUUID(),
      walletId: data.walletId,
      networkId: data.networkId,
      assetId: data.assetId,
      toAddress: data.toAddress,
      amount: data.amount,
      state: data.state,
      txHash: null,
      failureReason: null,
      idempotencyKey: data.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  insertStateEvent(tx: Prisma.TransactionClient, data: unknown): Promise<void> {
    this.stateEvents.push(data);
    const typed = data as {
      transferId: string;
      fromState: Transfer["state"] | null;
      toState: Transfer["state"];
      actor: string;
      metadata?: unknown;
    };
    this.stateEventRows.push({
      id: randomUUID(),
      transferId: typed.transferId,
      fromState: typed.fromState,
      toState: typed.toState,
      occurredAt: new Date(),
      actor: typed.actor,
      metadata: typed.metadata ?? null,
    });
    return Promise.resolve();
  }

  seed(row: Transfer, ownerId: string): void {
    this.rows.push(row);
    this.owners.set(row.id, ownerId);
    // Her transfer en az `null → draft` denetim izi kaydıyla doğar.
    this.stateEventRows.push({
      id: randomUUID(),
      transferId: row.id,
      fromState: null,
      toState: "draft",
      occurredAt: new Date(),
      actor: "user",
      metadata: null,
    });
  }

  findByIdWithOwner(
    transferId: string,
  ): Promise<(Transfer & { wallet: { userId: string } }) | null> {
    const row = this.rows.find((r) => r.id === transferId);
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      ...row,
      wallet: { userId: this.owners.get(row.id) ?? "" },
    });
  }

  findByIdWithOwnerAndEvents(transferId: string): Promise<
    | (Transfer & {
        wallet: { userId: string };
        stateEvents: unknown[];
      })
    | null
  > {
    const row = this.rows.find((r) => r.id === transferId);
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      ...row,
      wallet: { userId: this.owners.get(row.id) ?? "" },
      stateEvents: this.stateEventRows
        .filter((e) => e.transferId === transferId)
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
    });
  }

  deleteDraftCascade(
    tx: Prisma.TransactionClient,
    transferId: string,
  ): Promise<void> {
    for (let i = this.stateEventRows.length - 1; i >= 0; i -= 1) {
      if (this.stateEventRows[i].transferId === transferId) {
        this.stateEventRows.splice(i, 1);
      }
    }
    const idx = this.rows.findIndex((r) => r.id === transferId);
    if (idx >= 0) this.rows.splice(idx, 1);
    return Promise.resolve();
  }

  findByIdInTx(
    tx: Prisma.TransactionClient,
    transferId: string,
  ): Promise<Transfer | null> {
    const row = this.rows.find((r) => r.id === transferId);
    // Prisma taze bir obje döndürür — kopyala ki sonraki `updateState` mutasyonu
    // çağıranın elindeki `current`'ı bozmasın.
    return Promise.resolve(row ? { ...row } : null);
  }

  updateState(
    tx: Prisma.TransactionClient,
    transferId: string,
    state: Transfer["state"],
    extra?: { failureReason?: string; txHash?: string },
  ): Promise<Transfer> {
    const row = this.rows.find((r) => r.id === transferId);
    if (!row) throw new Error("not found");
    row.state = state;
    if (extra?.failureReason !== undefined) row.failureReason = extra.failureReason;
    if (extra?.txHash !== undefined) row.txHash = extra.txHash;
    return Promise.resolve({ ...row });
  }
}
