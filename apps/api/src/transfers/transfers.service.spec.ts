import { Prisma, type Transfer } from "@prisma/client";
import {
  ForbiddenNotOwnerException,
  WalletNotManagedException,
} from "../common/exceptions/domain.exception";
import type { PrismaService } from "../prisma/prisma.service";
import type { WalletsService } from "../wallets/wallets.service";
import type { TransferStateMachine } from "./transfer-state-machine.service";
import type { TransfersRepository } from "./transfers.repository";
import { TransfersService } from "./transfers.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WALLET_ID = "22222222-2222-4222-8222-222222222222";
const NETWORK_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";
const KEY = "idem-key-1";

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
    idempotencyKey: KEY,
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
    ...overrides,
  };
}

const DTO = {
  walletId: WALLET_ID,
  toAddress: "0xdead",
  assetId: ASSET_ID,
  amount: "1000",
};

describe("TransfersService.createDraft", () => {
  let repository: jest.Mocked<
    Pick<
      TransfersRepository,
      "findByIdempotencyKey" | "findByWalletAndIdempotencyKey"
    >
  >;
  let stateMachine: jest.Mocked<Pick<TransferStateMachine, "enter">>;
  let walletsService: jest.Mocked<Pick<WalletsService, "findOwnedManagedWallet">>;
  let prisma: { $transaction: jest.Mock };
  let service: TransfersService;

  beforeEach(() => {
    repository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findByWalletAndIdempotencyKey: jest.fn().mockResolvedValue(null),
    };
    stateMachine = {
      enter: jest.fn().mockResolvedValue(transferRow()),
    };
    walletsService = {
      findOwnedManagedWallet: jest
        .fn()
        .mockResolvedValue({ id: WALLET_ID, networkId: NETWORK_ID }),
    };
    // Fake `$transaction`: callback'i sabit bir tx handle ile çalıştırır.
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({ __tx: true })),
    };
    service = new TransfersService(
      repository as unknown as TransfersRepository,
      stateMachine as unknown as TransferStateMachine,
      prisma as unknown as PrismaService,
      walletsService as unknown as WalletsService,
    );
  });

  it("başarılı: state machine enter() çağrılır, isNew:true, view idempotencyKey sızdırmaz", async () => {
    const result = await service.createDraft(USER_ID, DTO, KEY);

    expect(walletsService.findOwnedManagedWallet).toHaveBeenCalledWith(
      USER_ID,
      WALLET_ID,
    );
    expect(stateMachine.enter).toHaveBeenCalledWith(
      { __tx: true },
      {
        walletId: WALLET_ID,
        networkId: NETWORK_ID,
        assetId: ASSET_ID,
        toAddress: "0xdead",
        amount: "1000",
        idempotencyKey: KEY,
      },
    );
    expect(result.isNew).toBe(true);
    expect(result.transfer).not.toHaveProperty("idempotencyKey");
    expect(result.transfer.state).toBe("draft");
  });

  it("sahiplik reddi: WalletsService fırlatırsa transfer oluşturulmaz", async () => {
    walletsService.findOwnedManagedWallet.mockRejectedValue(
      new ForbiddenNotOwnerException(),
    );

    await expect(service.createDraft(USER_ID, DTO, KEY)).rejects.toBeInstanceOf(
      ForbiddenNotOwnerException,
    );
    expect(stateMachine.enter).not.toHaveBeenCalled();
  });

  it("watch-only cüzdan reddi: WALLET_NOT_MANAGED, transfer oluşturulmaz", async () => {
    walletsService.findOwnedManagedWallet.mockRejectedValue(
      new WalletNotManagedException(),
    );

    await expect(service.createDraft(USER_ID, DTO, KEY)).rejects.toMatchObject({
      code: "WALLET_NOT_MANAGED",
    });
    expect(stateMachine.enter).not.toHaveBeenCalled();
  });

  it("idempotency tekrar isteği: mevcut transfer isNew:false ile döner, yeni satır açılmaz", async () => {
    const existing = transferRow({ id: "existing-id" });
    repository.findByIdempotencyKey.mockResolvedValue(existing);

    const result = await service.createDraft(USER_ID, DTO, KEY);

    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith(
      USER_ID,
      KEY,
      expect.any(Date),
    );
    expect(result.isNew).toBe(false);
    expect(result.transfer.id).toBe("existing-id");
    expect(stateMachine.enter).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("eşzamanlı çift gönderim: P2002 idempotency ihlalinde kazanan satır isNew:false ile döner", async () => {
    const raced = transferRow({ id: "raced-id" });
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "5.22.0",
        meta: { target: ["wallet_id", "idempotency_key"] },
      },
    );
    stateMachine.enter.mockRejectedValue(p2002);
    repository.findByWalletAndIdempotencyKey.mockResolvedValue(raced);

    const result = await service.createDraft(USER_ID, DTO, KEY);

    expect(result.isNew).toBe(false);
    expect(result.transfer.id).toBe("raced-id");
    expect(repository.findByWalletAndIdempotencyKey).toHaveBeenCalledWith(
      WALLET_ID,
      KEY,
    );
  });
});
