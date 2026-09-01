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
import type { TransfersRepository } from "./transfers.repository";
import { TransfersService } from "./transfers.service";
import {
  TEST_ASSET_ID as ASSET_ID,
  TEST_EVM_ADDRESS as EVM_ADDRESS,
  TEST_IDEMPOTENCY_KEY as KEY,
  TEST_NETWORK_ID as NETWORK_ID,
  TEST_OTHER_USER_ID as OTHER_USER_ID,
  TEST_OWNER_ID as USER_ID,
  TEST_TRANSFER_ID as TRANSFER_ID,
  TEST_WALLET_ID as WALLET_ID,
  createTestTransfer as transferRow,
  createTestTransferWithOwner as transferWithOwner,
} from "./testing/transfer.factory";

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
  let signingQueue: { add: jest.Mock };
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
    signingQueue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new TransfersService(
      repository as unknown as TransfersRepository,
      stateMachine as unknown as TransferStateMachine,
      prisma as unknown as PrismaService,
      walletsService as unknown as WalletsService,
      {} as unknown as AuthService,
      {} as unknown as NetworksService,
      {} as unknown as AuditService,
      signingQueue as never,
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
  let signingQueue: { add: jest.Mock };
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
    signingQueue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new TransfersService(
      repository as unknown as TransfersRepository,
      stateMachine as unknown as TransferStateMachine,
      prisma as unknown as PrismaService,
      walletsService as unknown as WalletsService,
      authService as unknown as AuthService,
      networksService as unknown as NetworksService,
      audit as unknown as AuditService,
      signingQueue as never,
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

  it("geçiş commit olunca signing kuyruğuna {transferId} job'u eklenir (jobId = ${id}:signed)", async () => {
    await service.confirm(USER_ID, TRANSFER_ID, "correct-horse");

    expect(signingQueue.add).toHaveBeenCalledWith(
      "sign",
      { transferId: TRANSFER_ID },
      { jobId: `${TRANSFER_ID}:signed` },
    );
  });

  it("guard reddinde signing kuyruğuna hiçbir şey eklenmez", async () => {
    authService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.confirm(USER_ID, TRANSFER_ID, "wrong"),
    ).rejects.toBeInstanceOf(AuthStepUpRequiredException);
    expect(signingQueue.add).not.toHaveBeenCalled();
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

describe("TransfersService.getSigningContext (§5.3 — signing worker)", () => {
  let repository: jest.Mocked<
    Pick<TransfersRepository, "findByIdWithChainContext">
  >;
  let service: TransfersService;

  function chainRow(overrides: Partial<Transfer> = {}) {
    return {
      ...transferRow({ state: "pending_signature", ...overrides }),
      network: { chainType: "evm" as const, chainId: "11155111" },
      asset: { contractAddress: null, decimals: 18 },
    };
  }

  beforeEach(() => {
    repository = {
      findByIdWithChainContext: jest.fn().mockResolvedValue(chainRow()),
    };
    service = new TransfersService(
      repository as unknown as TransfersRepository,
      {} as unknown as TransferStateMachine,
      {} as unknown as PrismaService,
      {} as unknown as WalletsService,
      {} as unknown as AuthService,
      {} as unknown as NetworksService,
      {} as unknown as AuditService,
      { add: jest.fn() } as never,
    );
  });

  it("pending_signature: transfer + ağ/varlık bağlamını döner (key materyali hariç)", async () => {
    const ctx = await service.getSigningContext(TRANSFER_ID);

    expect(ctx).toEqual({
      transferId: TRANSFER_ID,
      walletId: WALLET_ID,
      toAddress: EVM_ADDRESS,
      amount: "1000",
      chain: { chainType: "evm", chainId: "11155111" },
      asset: { contractAddress: null, decimals: 18 },
    });
  });

  it("state pending_signature değilse null (worker idempotent no-op)", async () => {
    repository.findByIdWithChainContext.mockResolvedValue(
      chainRow({ state: "signed" }),
    );
    await expect(service.getSigningContext(TRANSFER_ID)).resolves.toBeNull();
  });

  it("terminal durumda null", async () => {
    repository.findByIdWithChainContext.mockResolvedValue(
      chainRow({ state: "failed" }),
    );
    await expect(service.getSigningContext(TRANSFER_ID)).resolves.toBeNull();
  });

  it("transfer yoksa null", async () => {
    repository.findByIdWithChainContext.mockResolvedValue(null);
    await expect(service.getSigningContext(TRANSFER_ID)).resolves.toBeNull();
  });
});

describe("TransfersService.getBroadcastContext (§5.4 — broadcast worker)", () => {
  let repository: jest.Mocked<
    Pick<TransfersRepository, "findByIdWithChainContext">
  >;
  let service: TransfersService;

  function chainRow(overrides: Partial<Transfer> = {}) {
    return {
      ...transferRow({ state: "signed", ...overrides }),
      network: { chainType: "tron" as const, chainId: "shasta" },
      asset: { contractAddress: null, decimals: 6 },
    };
  }

  beforeEach(() => {
    repository = {
      findByIdWithChainContext: jest.fn().mockResolvedValue(chainRow()),
    };
    service = new TransfersService(
      repository as unknown as TransfersRepository,
      {} as unknown as TransferStateMachine,
      {} as unknown as PrismaService,
      {} as unknown as WalletsService,
      {} as unknown as AuthService,
      {} as unknown as NetworksService,
      {} as unknown as AuditService,
      { add: jest.fn() } as never,
    );
  });

  it("signed: yalnızca ağ bağlamını döner (imzalı işlem job payload'ında)", async () => {
    await expect(service.getBroadcastContext(TRANSFER_ID)).resolves.toEqual({
      transferId: TRANSFER_ID,
      chain: { chainType: "tron", chainId: "shasta" },
    });
  });

  it("state signed değilse null — zaten broadcast (idempotent no-op)", async () => {
    repository.findByIdWithChainContext.mockResolvedValue(
      chainRow({ state: "broadcast" }),
    );
    await expect(service.getBroadcastContext(TRANSFER_ID)).resolves.toBeNull();
  });

  it("terminal durumda null", async () => {
    repository.findByIdWithChainContext.mockResolvedValue(
      chainRow({ state: "failed" }),
    );
    await expect(service.getBroadcastContext(TRANSFER_ID)).resolves.toBeNull();
  });

  it("transfer yoksa null", async () => {
    repository.findByIdWithChainContext.mockResolvedValue(null);
    await expect(service.getBroadcastContext(TRANSFER_ID)).resolves.toBeNull();
  });
});

describe("TransfersService.getById (§5.6b — GET /transfers/:id)", () => {
  let repository: jest.Mocked<
    Pick<TransfersRepository, "findByIdWithOwnerAndEvents">
  >;
  let service: TransfersService;

  function withEvents(overrides: Partial<Transfer> = {}, ownerId = USER_ID) {
    return {
      ...transferWithOwner(overrides, ownerId),
      stateEvents: [
        {
          id: "e1",
          transferId: TRANSFER_ID,
          fromState: null,
          toState: "draft" as const,
          occurredAt: new Date("2026-08-31T00:00:00.000Z"),
          actor: "user",
          metadata: null,
        },
        {
          id: "e2",
          transferId: TRANSFER_ID,
          fromState: "draft" as const,
          toState: "pending_signature" as const,
          occurredAt: new Date("2026-08-31T00:01:00.000Z"),
          actor: "user",
          metadata: { note: "x" },
        },
      ],
    };
  }

  beforeEach(() => {
    repository = {
      findByIdWithOwnerAndEvents: jest.fn().mockResolvedValue(withEvents()),
    };
    service = new TransfersService(
      repository as unknown as TransfersRepository,
      {} as unknown as TransferStateMachine,
      {} as unknown as PrismaService,
      {} as unknown as WalletsService,
      {} as unknown as AuthService,
      {} as unknown as NetworksService,
      {} as unknown as AuditService,
      { add: jest.fn() } as never,
    );
  });

  it("sahibi: transfer görünümü + zaman sıralı denetim izi döner", async () => {
    const result = await service.getById(USER_ID, "user", TRANSFER_ID);
    expect(result).toMatchObject({ id: TRANSFER_ID, state: "draft" });
    expect(result.stateEvents).toEqual([
      {
        fromState: null,
        toState: "draft",
        actor: "user",
        occurredAt: "2026-08-31T00:00:00.000Z",
        metadata: null,
      },
      {
        fromState: "draft",
        toState: "pending_signature",
        actor: "user",
        occurredAt: "2026-08-31T00:01:00.000Z",
        metadata: { note: "x" },
      },
    ]);
    expect(result).not.toHaveProperty("idempotencyKey");
  });

  it("Admin: başkasının transfer'ini salt-okunur görebilir", async () => {
    repository.findByIdWithOwnerAndEvents.mockResolvedValue(
      withEvents({}, OTHER_USER_ID),
    );
    await expect(
      service.getById(USER_ID, "admin", TRANSFER_ID),
    ).resolves.toMatchObject({ id: TRANSFER_ID });
  });

  it("başkasının transfer'i + User rolü → FORBIDDEN_NOT_OWNER", async () => {
    repository.findByIdWithOwnerAndEvents.mockResolvedValue(
      withEvents({}, OTHER_USER_ID),
    );
    await expect(
      service.getById(USER_ID, "user", TRANSFER_ID),
    ).rejects.toBeInstanceOf(ForbiddenNotOwnerException);
  });

  it("kayıt yok → RESOURCE_NOT_FOUND (GET, 'yok' ile 'başkasının' ayrılır)", async () => {
    repository.findByIdWithOwnerAndEvents.mockResolvedValue(null);
    await expect(
      service.getById(USER_ID, "user", TRANSFER_ID),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

describe("TransfersService.deleteDraft (§5.6b — DELETE /transfers/:id)", () => {
  let repository: jest.Mocked<
    Pick<TransfersRepository, "findByIdWithOwner" | "deleteDraftCascade">
  >;
  let prisma: { $transaction: jest.Mock };
  let service: TransfersService;
  const TX = { __tx: true };

  beforeEach(() => {
    repository = {
      findByIdWithOwner: jest.fn().mockResolvedValue(transferWithOwner()),
      deleteDraftCascade: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX)),
    };
    service = new TransfersService(
      repository as unknown as TransfersRepository,
      {} as unknown as TransferStateMachine,
      prisma as unknown as PrismaService,
      {} as unknown as WalletsService,
      {} as unknown as AuthService,
      {} as unknown as NetworksService,
      {} as unknown as AuditService,
      { add: jest.fn() } as never,
    );
  });

  it("sahibinin draft'ı → denetim izi + transfer tek $transaction'da silinir", async () => {
    await service.deleteDraft(USER_ID, TRANSFER_ID);
    expect(repository.deleteDraftCascade).toHaveBeenCalledWith(TX, TRANSFER_ID);
  });

  it("terminal-olmayan ama draft değil (pending_signature) → TRANSFER_INVALID_TRANSITION, silme yok", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({ state: "pending_signature" }),
    );
    await expect(
      service.deleteDraft(USER_ID, TRANSFER_ID),
    ).rejects.toBeInstanceOf(TransferInvalidTransitionException);
    expect(repository.deleteDraftCascade).not.toHaveBeenCalled();
  });

  it("terminal durum (confirmed) → TRANSFER_INVALID_TRANSITION", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({ state: "confirmed" }),
    );
    await expect(
      service.deleteDraft(USER_ID, TRANSFER_ID),
    ).rejects.toBeInstanceOf(TransferInvalidTransitionException);
  });

  it("başkasının transfer'i → FORBIDDEN_NOT_OWNER (Admin dahil muaf değil)", async () => {
    repository.findByIdWithOwner.mockResolvedValue(
      transferWithOwner({}, OTHER_USER_ID),
    );
    await expect(
      service.deleteDraft(USER_ID, TRANSFER_ID),
    ).rejects.toBeInstanceOf(ForbiddenNotOwnerException);
    expect(repository.deleteDraftCascade).not.toHaveBeenCalled();
  });

  it("kayıt yok → FORBIDDEN_NOT_OWNER (DELETE hata listesi RESOURCE_NOT_FOUND içermez)", async () => {
    repository.findByIdWithOwner.mockResolvedValue(null);
    await expect(
      service.deleteDraft(USER_ID, TRANSFER_ID),
    ).rejects.toBeInstanceOf(ForbiddenNotOwnerException);
  });
});
