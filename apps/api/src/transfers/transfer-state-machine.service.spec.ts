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
