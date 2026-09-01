import type { Transfer } from "@prisma/client";
import type { TransfersRepository } from "./transfers.repository";
import {
  InvalidTransitionError,
  TransferStateMachine,
  type EnterTransferData,
} from "./transfer-state-machine.service";

const TX = Symbol("tx");
const WALLET_ID = "11111111-1111-4111-8111-111111111111";
const NETWORK_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";

function transferRow(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    walletId: WALLET_ID,
    networkId: NETWORK_ID,
    assetId: ASSET_ID,
    toAddress: "0xdead",
    amount: "1000",
    state: "draft",
    txHash: null,
    failureReason: null,
    idempotencyKey: "key-1",
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    ...overrides,
  };
}

function enterData(overrides: Partial<EnterTransferData> = {}): EnterTransferData {
  return {
    walletId: WALLET_ID,
    networkId: NETWORK_ID,
    assetId: ASSET_ID,
    toAddress: "0xdead",
    amount: "1000",
    idempotencyKey: "key-1",
    ...overrides,
  };
}

describe("TransferStateMachine.enter", () => {
  let repository: jest.Mocked<
    Pick<TransfersRepository, "insertTransfer" | "insertStateEvent">
  >;
  let machine: TransferStateMachine;

  beforeEach(() => {
    repository = {
      insertTransfer: jest.fn().mockResolvedValue(transferRow()),
      insertStateEvent: jest.fn().mockResolvedValue(undefined),
    };
    machine = new TransferStateMachine(
      repository as unknown as TransfersRepository,
    );
  });

  it("draft transfer'i çağıranın tx'i içinde yazar, state 'draft' ile", async () => {
    const result = await machine.enter(TX as never, enterData());

    expect(repository.insertTransfer).toHaveBeenCalledWith(TX, {
      walletId: WALLET_ID,
      networkId: NETWORK_ID,
      assetId: ASSET_ID,
      toAddress: "0xdead",
      amount: "1000",
      state: "draft",
      idempotencyKey: "key-1",
    });
    expect(result.state).toBe("draft");
  });

  it("transfer_state_events'e fromState:null, toState:'draft', actor:'user' yazar", async () => {
    const created = transferRow({ id: "abc" });
    repository.insertTransfer.mockResolvedValue(created);

    await machine.enter(TX as never, enterData());

    expect(repository.insertStateEvent).toHaveBeenCalledWith(TX, {
      transferId: "abc",
      fromState: null,
      toState: "draft",
      actor: "user",
    });
  });

  it("insert + state event aynı tx handle'ıyla çağrılır (atomik yazım)", async () => {
    await machine.enter(TX as never, enterData());

    expect(repository.insertTransfer.mock.calls[0][0]).toBe(TX);
    expect(repository.insertStateEvent.mock.calls[0][0]).toBe(TX);
  });

  it("draft oluşturma audit'e yazılmaz — state machine'in audit bağımlılığı yoktur", () => {
    // Yapısal garanti: `TransferStateMachine` yalnızca `TransfersRepository` alır
    // (`docs/03_API_CONTRACTS.md` §5.4 — draft audit'e yazılmaz).
    expect(TransferStateMachine.length).toBe(1);
  });
});

describe("TransferStateMachine — geçiş guard'ı (İterasyon 2-5 genişletir)", () => {
  it("InvalidTransitionError from/to state'leri taşır", () => {
    const err = new InvalidTransitionError("confirmed", "draft");
    expect(err.fromState).toBe("confirmed");
    expect(err.toState).toBe("draft");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("TransferStateMachine.transitionTo (İterasyon 2 — §5.2)", () => {
  const TX = Symbol("tx");
  let repository: jest.Mocked<
    Pick<
      TransfersRepository,
      "findByIdInTx" | "updateState" | "insertStateEvent"
    >
  >;
  let machine: TransferStateMachine;

  beforeEach(() => {
    repository = {
      findByIdInTx: jest.fn().mockResolvedValue(transferRow({ state: "draft" })),
      updateState: jest
        .fn()
        .mockResolvedValue(transferRow({ state: "pending_signature" })),
      insertStateEvent: jest.fn().mockResolvedValue(undefined),
    };
    machine = new TransferStateMachine(
      repository as unknown as TransfersRepository,
    );
  });

  it("draft → pending_signature: state günceller + state_events'e fromState:'draft' yazar (aynı tx)", async () => {
    const result = await machine.transitionTo(
      TX as never,
      "abc",
      "pending_signature",
      "user",
    );

    expect(repository.findByIdInTx).toHaveBeenCalledWith(TX, "abc");
    expect(repository.updateState).toHaveBeenCalledWith(
      TX,
      "abc",
      "pending_signature",
    );
    expect(repository.insertStateEvent).toHaveBeenCalledWith(TX, {
      transferId: "abc",
      fromState: "draft",
      toState: "pending_signature",
      actor: "user",
    });
    expect(result.state).toBe("pending_signature");
  });

  it("draft dışı durumdan pending_signature denemesi → TRANSFER_INVALID_TRANSITION", async () => {
    repository.findByIdInTx.mockResolvedValue(
      transferRow({ state: "pending_signature" }),
    );

    await expect(
      machine.transitionTo(TX as never, "abc", "pending_signature", "user"),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
    expect(repository.updateState).not.toHaveBeenCalled();
    expect(repository.insertStateEvent).not.toHaveBeenCalled();
  });

  it("terminal durumdan (confirmed) hiçbir geçiş kabul edilmez → TRANSFER_INVALID_TRANSITION", async () => {
    repository.findByIdInTx.mockResolvedValue(
      transferRow({ state: "confirmed" }),
    );

    await expect(
      machine.transitionTo(TX as never, "abc", "pending_signature", "user"),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
  });

  it("transfer eşzamanlı silinmişse (findByIdInTx null) → TRANSFER_INVALID_TRANSITION", async () => {
    repository.findByIdInTx.mockResolvedValue(null);

    await expect(
      machine.transitionTo(TX as never, "abc", "pending_signature", "user"),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
  });

  // --- İterasyon 3 (§5.3): pending_signature → signed / failed ---

  it("pending_signature → signed: worker:signing aktörüyle geçiş, failure_reason'a dokunulmaz", async () => {
    repository.findByIdInTx.mockResolvedValue(
      transferRow({ state: "pending_signature" }),
    );
    repository.updateState.mockResolvedValue(transferRow({ state: "signed" }));

    const result = await machine.transitionTo(
      TX as never,
      "abc",
      "signed",
      "worker:signing",
    );

    // failureReason verilmedi → updateState 3 argümanla çağrılır (kolon korunur).
    expect(repository.updateState).toHaveBeenCalledWith(TX, "abc", "signed");
    expect(repository.insertStateEvent).toHaveBeenCalledWith(TX, {
      transferId: "abc",
      fromState: "pending_signature",
      toState: "signed",
      actor: "worker:signing",
    });
    expect(result.state).toBe("signed");
  });

  it("pending_signature → failed: failureReason kolona yazılır, metadata state event'e eklenir", async () => {
    repository.findByIdInTx.mockResolvedValue(
      transferRow({ state: "pending_signature" }),
    );
    repository.updateState.mockResolvedValue(
      transferRow({ state: "failed", failureReason: "İmzalama başarısız oldu." }),
    );

    await machine.transitionTo(TX as never, "abc", "failed", "worker:signing", {
      failureReason: "İmzalama başarısız oldu.",
      metadata: { step: "signing" },
    });

    expect(repository.updateState).toHaveBeenCalledWith(TX, "abc", "failed", {
      failureReason: "İmzalama başarısız oldu.",
    });
    expect(repository.insertStateEvent).toHaveBeenCalledWith(TX, {
      transferId: "abc",
      fromState: "pending_signature",
      toState: "failed",
      actor: "worker:signing",
      metadata: { step: "signing" },
    });
  });

  it("signed durumundan signing geçişi tekrar denenirse → TRANSFER_INVALID_TRANSITION (worker idempotency guard'a güvenir)", async () => {
    repository.findByIdInTx.mockResolvedValue(transferRow({ state: "signed" }));

    await expect(
      machine.transitionTo(TX as never, "abc", "signed", "worker:signing"),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
    expect(repository.updateState).not.toHaveBeenCalled();
  });

  // --- İterasyon 4 (§5.4): signed → broadcast / failed ---

  it("signed → broadcast: tx_hash aynı updateState çağrısında yazılır, actor worker:broadcast", async () => {
    repository.findByIdInTx.mockResolvedValue(transferRow({ state: "signed" }));
    repository.updateState.mockResolvedValue(
      transferRow({ state: "broadcast", txHash: "0xfeed" }),
    );

    const result = await machine.transitionTo(
      TX as never,
      "abc",
      "broadcast",
      "worker:broadcast",
      { txHash: "0xfeed" },
    );

    expect(repository.updateState).toHaveBeenCalledWith(TX, "abc", "broadcast", {
      txHash: "0xfeed",
    });
    expect(repository.insertStateEvent).toHaveBeenCalledWith(TX, {
      transferId: "abc",
      fromState: "signed",
      toState: "broadcast",
      actor: "worker:broadcast",
    });
    expect(result.state).toBe("broadcast");
  });

  it("signed → failed: kalıcı/geçici tükenmiş broadcast hatası failureReason ile", async () => {
    repository.findByIdInTx.mockResolvedValue(transferRow({ state: "signed" }));
    repository.updateState.mockResolvedValue(
      transferRow({ state: "failed", failureReason: "Ağ zaman aşımı." }),
    );

    await machine.transitionTo(TX as never, "abc", "failed", "worker:broadcast", {
      failureReason: "Ağ zaman aşımı.",
      metadata: { step: "broadcast", reason: "BROADCAST_FAILED" },
    });

    expect(repository.updateState).toHaveBeenCalledWith(TX, "abc", "failed", {
      failureReason: "Ağ zaman aşımı.",
    });
  });

  it("broadcast (terminal olmayan) durumundan broadcast tekrar denenirse → TRANSFER_INVALID_TRANSITION (idempotency)", async () => {
    repository.findByIdInTx.mockResolvedValue(
      transferRow({ state: "broadcast" }),
    );

    await expect(
      machine.transitionTo(TX as never, "abc", "broadcast", "worker:broadcast"),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
    expect(repository.updateState).not.toHaveBeenCalled();
  });
});
