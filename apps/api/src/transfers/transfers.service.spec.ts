import { Prisma, type Transfer } from "@prisma/client";
import type { AuditService } from "../audit/audit.service";
import type { AuthService } from "../auth/auth.service";
import {
  AuthStepUpRequiredException,
  ForbiddenNotOwnerException,
  NetworkAssetInactiveException,
  TransferInvalidTransitionException,
  WalletCrossNetworkMismatchException,
  WalletInsufficientBalanceException,
  WalletNotManagedException,
} from "../common/exceptions/domain.exception";
import type { NetworksService } from "../networks/networks.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { WalletsService } from "../wallets/wallets.service";
import type { TransferStateMachine } from "./transfer-state-machine.service";
import type {
  TransfersRepository,
  TransferWithOwner,
} from "./transfers.repository";
import { TransfersService } from "./transfers.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "10101010-1010-4101-8101-101010101010";
const WALLET_ID = "22222222-2222-4222-8222-222222222222";
const NETWORK_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";
const TRANSFER_ID = "99999999-9999-4999-8999-999999999999";
const KEY = "idem-key-1";
// Sepolia — geçerli EIP-55 checksum'lı EVM adresi.
const EVM_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

function transferRow(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: TRANSFER_ID,
    walletId: WALLET_ID,
    networkId: NETWORK_ID,
    assetId: ASSET_ID,
    toAddress: EVM_ADDRESS,
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

function transferWithOwner(
  overrides: Partial<Transfer> = {},
  ownerId = USER_ID,
): TransferWithOwner {
  return { ...transferRow(overrides), wallet: { userId: ownerId } };
}

const DTO = {
  walletId: WALLET_ID,
  toAddress: EVM_ADDRESS,
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
      {} as unknown as AuthService,
      {} as unknown as NetworksService,
      {} as unknown as AuditService,
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
        toAddress: EVM_ADDRESS,
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

describe("TransfersService.confirm — step-up + cross-network guard (§5.2)", () => {
  let repository: jest.Mocked<Pick<TransfersRepository, "findByIdWithOwner">>;
  let stateMachine: jest.Mocked<Pick<TransferStateMachine, "transitionTo">>;
  let walletsService: jest.Mocked<Pick<WalletsService, "getCachedBalanceRaw">>;
  let authService: jest.Mocked<Pick<AuthService, "verifyPassword">>;
  let networksService: jest.Mocked<
    Pick<NetworksService, "findNetworkById" | "isNetworkAssetActive">
  >;
  let audit: jest.Mocked<Pick<AuditService, "record">>;
  let prisma: { $transaction: jest.Mock };
  let service: TransfersService;

  const TX = { __tx: true };

  beforeEach(() => {
    repository = {
      findByIdWithOwner: jest.fn().mockResolvedValue(transferWithOwner()),
    };
    stateMachine = {
      transitionTo: jest
        .fn()
        .mockResolvedValue(transferRow({ state: "pending_signature" })),
    };
    walletsService = {
      getCachedBalanceRaw: jest.fn().mockResolvedValue(5000n),
    };
    authService = {
      verifyPassword: jest.fn().mockResolvedValue(true),
    };
    networksService = {
      findNetworkById: jest.fn().mockResolvedValue({
        id: NETWORK_ID,
        name: "Sepolia",
        chainType: "evm",
        chainId: "11155111",
        confirmationThreshold: 3,
      }),
      isNetworkAssetActive: jest.fn().mockResolvedValue(true),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX)),
    };
    service = new TransfersService(
      repository as unknown as TransfersRepository,
      stateMachine as unknown as TransferStateMachine,
      prisma as unknown as PrismaService,
      walletsService as unknown as WalletsService,
      authService as unknown as AuthService,
      networksService as unknown as NetworksService,
      audit as unknown as AuditService,
    );
  });

  it("happy path: draft → pending_signature, transitionTo + audit aynı $transaction'da", async () => {
    const result = await service.confirm(USER_ID, TRANSFER_ID, "correct-horse");

    expect(authService.verifyPassword).toHaveBeenCalledWith(
      USER_ID,
      "correct-horse",
    );
    expect(stateMachine.transitionTo).toHaveBeenCalledWith(
      TX,
      TRANSFER_ID,
      "pending_signature",
      "user",
    );
    expect(audit.record).toHaveBeenCalledWith(TX, {
      actorType: "user",
      actorId: USER_ID,
      action: "TRANSFER_STATE_CHANGED",
      entityType: "transfer",
      entityId: TRANSFER_ID,
      metadata: { fromState: "draft", toState: "pending_signature" },
    });
    expect(result).toEqual({ state: "pending_signature" });
  });

  it("sahiplik: transfer başka kullanıcıya aitse FORBIDDEN_NOT_OWNER, hiçbir guard çalışmaz", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({}, OTHER_USER_ID),
    );

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "correct-horse"),
    ).rejects.toBeInstanceOf(ForbiddenNotOwnerException);
    expect(authService.verifyPassword).not.toHaveBeenCalled();
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("transfer bulunamazsa FORBIDDEN_NOT_OWNER (varlık sızıntısı önlemi)", async () => {
    repository.findByIdWithOwner.mockResolvedValue(null);

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "correct-horse"),
    ).rejects.toBeInstanceOf(ForbiddenNotOwnerException);
  });

  it("draft dışı durum: TRANSFER_INVALID_TRANSITION, step-up bile denenmez", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({ state: "pending_signature" }),
    );

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "correct-horse"),
    ).rejects.toBeInstanceOf(TransferInvalidTransitionException);
    expect(authService.verifyPassword).not.toHaveBeenCalled();
  });

  it("terminal durum (confirmed): TRANSFER_INVALID_TRANSITION", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({ state: "confirmed" }),
    );

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "correct-horse"),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID_TRANSITION" });
  });

  // --- 4 deny senaryosu (kalite kapısı) ---

  it("DENY step-up başarısız: yanlış şifre → AUTH_STEP_UP_REQUIRED, hiçbir guard/geçiş çalışmaz", async () => {
    authService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "wrong-password"),
    ).rejects.toBeInstanceOf(AuthStepUpRequiredException);

    // Kontrol sırası: step-up EN ÖNCE — sonraki guard'lar tetiklenmemeli.
    expect(networksService.findNetworkById).not.toHaveBeenCalled();
    expect(networksService.isNetworkAssetActive).not.toHaveBeenCalled();
    expect(walletsService.getCachedBalanceRaw).not.toHaveBeenCalled();
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("DENY cross-network mismatch: EVM cüzdana Tron adresi → WALLET_CROSS_NETWORK_MISMATCH", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({ toAddress: "TQ5NqPY1Eqe4B4hV1hVFCJmZ9dRmM6C7Gr" }),
    );

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "correct-horse"),
    ).rejects.toBeInstanceOf(WalletCrossNetworkMismatchException);
    expect(walletsService.getCachedBalanceRaw).not.toHaveBeenCalled();
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("DENY pasif network-asset: transfer sonrası pasifleşmiş → NETWORK_ASSET_INACTIVE", async () => {
    networksService.isNetworkAssetActive.mockResolvedValue(false);

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "correct-horse"),
    ).rejects.toBeInstanceOf(NetworkAssetInactiveException);
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("DENY yetersiz bakiye: cache bakiyesi tutarı karşılamıyor → WALLET_INSUFFICIENT_BALANCE", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({ amount: "9000" }),
    );
    walletsService.getCachedBalanceRaw.mockResolvedValue(5000n);

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "correct-horse"),
    ).rejects.toBeInstanceOf(WalletInsufficientBalanceException);
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("bakiye tam tutara eşitse geçiş yapılır (< değil <=)", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({ amount: "5000" }),
    );
    walletsService.getCachedBalanceRaw.mockResolvedValue(5000n);

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "correct-horse"),
    ).resolves.toEqual({ state: "pending_signature" });
  });
});
