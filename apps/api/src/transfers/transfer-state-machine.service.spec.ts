import { TransferState } from "@prisma/client";
import type { TransfersRepository } from "./transfers.repository";
import {
  ALLOWED_TRANSITIONS,
  InvalidTransitionError,
  TERMINAL_STATES,
  TransferStateMachine,
  type EnterTransferData,
} from "./transfer-state-machine.service";
import {
  TEST_ASSET_ID as ASSET_ID,
  TEST_NETWORK_ID as NETWORK_ID,
  TEST_WALLET_ID as WALLET_ID,
  createTestTransfer,
} from "./testing/transfer.factory";

const TX = Symbol("tx");

/** Ortak factory'ye taşındı (`docs/08` §5) — bu dosya artık kendi kopyasını tutmaz. */
const transferRow = createTestTransfer;

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

  // --- İterasyon 5 (§5.5): broadcast → confirming/failed/dropped,
  //     confirming → confirmed/dropped/failed ---

  it.each([
    ["confirming", "worker:confirmation"],
    ["failed", "worker:confirmation"],
    ["dropped", "worker:confirmation"],
  ] as const)(
    "broadcast → %s: worker:confirmation aktörüyle geçişe izin verilir",
    async (toState, actor) => {
      repository.findByIdInTx.mockResolvedValue(
        transferRow({ state: "broadcast" }),
      );
      repository.updateState.mockResolvedValue(transferRow({ state: toState }));

      const result = await machine.transitionTo(TX as never, "abc", toState, actor);

      expect(result.state).toBe(toState);
      expect(repository.insertStateEvent).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ fromState: "broadcast", toState, actor }),
      );
    },
  );

  it.each(["confirmed", "dropped", "failed"] as const)(
    "confirming → %s: geçişe izin verilir",
    async (toState) => {
      repository.findByIdInTx.mockResolvedValue(
        transferRow({ state: "confirming" }),
      );
      repository.updateState.mockResolvedValue(transferRow({ state: toState }));

      const result = await machine.transitionTo(
        TX as never,
        "abc",
        toState,
        "worker:confirmation",
      );

      expect(result.state).toBe(toState);
    },
  );

  it("confirming → confirmed metadata state event'e eklenir (depth/blockNumber izi)", async () => {
    repository.findByIdInTx.mockResolvedValue(
      transferRow({ state: "confirming" }),
    );
    repository.updateState.mockResolvedValue(transferRow({ state: "confirmed" }));

    await machine.transitionTo(TX as never, "abc", "confirmed", "worker:confirmation", {
      metadata: { step: "confirmation", blockNumber: 1000, depth: 12 },
    });

    expect(repository.insertStateEvent).toHaveBeenCalledWith(TX, {
      transferId: "abc",
      fromState: "confirming",
      toState: "confirmed",
      actor: "worker:confirmation",
      metadata: { step: "confirmation", blockNumber: 1000, depth: 12 },
    });
    // `confirmed`/`dropped` failure_reason taşımaz → updateState 3 argümanla.
    expect(repository.updateState).toHaveBeenCalledWith(TX, "abc", "confirmed");
  });

  it("terminal durumdan (confirmed) confirmation geçişi denenirse → TRANSFER_INVALID_TRANSITION", async () => {
    repository.findByIdInTx.mockResolvedValue(
      transferRow({ state: "confirmed" }),
    );

    await expect(
      machine.transitionTo(TX as never, "abc", "confirmed", "worker:confirmation"),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
    expect(repository.updateState).not.toHaveBeenCalled();
  });

  it("confirming → broadcast (geriye) whitelist'te yok → TRANSFER_INVALID_TRANSITION", async () => {
    repository.findByIdInTx.mockResolvedValue(
      transferRow({ state: "confirming" }),
    );

    await expect(
      machine.transitionTo(TX as never, "abc", "broadcast", "worker:confirmation"),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
  });
});

/**
 * §5.7 — Terminal durum matrisi (`docs/08_TESTING_STRATEGY.md` §4 madde 3,
 * `docs/01_DOMAIN_MODEL.md` §5.2 "Genel kural", `docs/mimari-kararlar.md` W-003).
 *
 * İterasyon 1-5'te her whitelist genişlemesinde terminal-reddi tek tek
 * doğrulandı; burası o senaryonun **tam matris** hâlidir: üç terminal durumun
 * (`confirmed`/`failed`/`dropped`) her birinden, sistemdeki *her* duruma geçiş
 * denemesi reddedilmeli.
 *
 * Hedef listesi elle yazılmaz — `@prisma/client`'ın `TransferState` enum'ından
 * (`docs/02_DATABASE_SCHEMA.md` §2.7, whitelist'in tip kaynağı) türetilir;
 * kaynak listesi `TERMINAL_STATES` sabitinden gelir. Whitelist'e ileride yeni
 * bir durum eklenirse matris onu otomatik kapsar
 * (İterasyon "Risk / dikkat" notu).
 */
describe("TransferStateMachine — terminal durum matrisi (§5.7)", () => {
  const ALL_STATES = Object.values(TransferState);
  const TERMINAL = [...TERMINAL_STATES];

  let repository: jest.Mocked<
    Pick<TransfersRepository, "findByIdInTx" | "updateState" | "insertStateEvent">
  >;
  let machine: TransferStateMachine;

  beforeEach(() => {
    repository = {
      findByIdInTx: jest.fn(),
      updateState: jest.fn(),
      insertStateEvent: jest.fn(),
    };
    machine = new TransferStateMachine(
      repository as unknown as TransfersRepository,
    );
  });

  it("kapsam: TERMINAL_STATES tam olarak whitelist'te giden geçişi olmayan durumlar", () => {
    const withOutgoing = new Set(
      [...ALLOWED_TRANSITIONS.entries()]
        .filter(([from, targets]) => from !== null && targets.length > 0)
        .map(([from]) => from as TransferState),
    );
    const noOutgoing = ALL_STATES.filter((state) => !withOutgoing.has(state));
    expect(new Set(noOutgoing)).toEqual(TERMINAL_STATES);
  });

  it.each(
    TERMINAL.flatMap((fromState) =>
      ALL_STATES.map((toState) => [fromState, toState] as const),
    ),
  )(
    "terminal %s → %s: TRANSFER_INVALID_TRANSITION, hiçbir yazım yapılmaz",
    async (fromState, toState) => {
      repository.findByIdInTx.mockResolvedValue(transferRow({ state: fromState }));

      await expect(
        machine.transitionTo(TX as never, "abc", toState, "worker:confirmation"),
      ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
      expect(repository.updateState).not.toHaveBeenCalled();
      expect(repository.insertStateEvent).not.toHaveBeenCalled();
    },
  );
});
