import { randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { Prisma, Transfer } from "@prisma/client";
import request from "supertest";
import { AuditService } from "../audit/audit.service";
import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { RefreshTokensRepository } from "../auth/refresh-tokens.repository";
import { UsersRepository } from "../auth/users.repository";
import { WalletNotManagedException } from "../common/exceptions/domain.exception";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ResponseEnvelopeInterceptor } from "../common/interceptors/response-envelope.interceptor";
import { testConfigModule } from "../config/testing-config.module";
import { NetworksService } from "../networks/networks.service";
import { TestingPrismaModule } from "../prisma/testing-prisma.module";
import { WalletsService } from "../wallets/wallets.service";
import { TransfersController } from "./transfers.controller";
import { TransfersRepository } from "./transfers.repository";
import { TransfersService } from "./transfers.service";
import { TransfersThrottlerGuard } from "./transfers-throttler.guard";
import { TransferStateMachine } from "./transfer-state-machine.service";
import { SIGNING_QUEUE } from "../workers/signing/signing.queue";

/** `signing` kuyruğu (Faz 5 §5.3) — HTTP testinde iş bırakma no-op'lanır. */
const signingQueueProvider = {
  provide: getQueueToken(SIGNING_QUEUE),
  useValue: { add: jest.fn() },
};

/**
 * `POST /api/v1/transfers` HTTP akışı uçtan uca (controller → global guard
 * zinciri → pipe → service → `TransferStateMachine` → repository) —
 * `docs/03_API_CONTRACTS.md` §5.4, §7. `TransfersRepository` bellek-içi fake,
 * `WalletsService.findOwnedManagedWallet` stub'lı; `PrismaService.$transaction`
 * `TestingPrismaModule`'ün fake'i (`.claude/rules/30-testing.md`).
 */
const USER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MANAGED_WALLET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WATCH_ONLY_WALLET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NETWORK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ASSET_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

class InMemoryTransfersRepository {
  readonly rows: Transfer[] = [];

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

  readonly stateEvents: unknown[] = [];

  insertStateEvent(tx: Prisma.TransactionClient, data: unknown): Promise<void> {
    this.stateEvents.push(data);
    return Promise.resolve();
  }

  // --- İterasyon 2: confirm() yolu ---
  readonly owners = new Map<string, string>();

  // --- İterasyon 7 (§5.6b): getById() denetim izi + deleteDraft() ---
  readonly stateEventRows: {
    id: string;
    transferId: string;
    fromState: Transfer["state"] | null;
    toState: Transfer["state"];
    occurredAt: Date;
    actor: string;
    metadata: unknown;
  }[] = [];

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
  ): Promise<Transfer> {
    const row = this.rows.find((r) => r.id === transferId);
    if (!row) throw new Error("not found");
    row.state = state;
    return Promise.resolve({ ...row });
  }
}

describe("TransfersController (integration) — POST /api/v1/transfers", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let repo: InMemoryTransfersRepository;

  const findOwnedManagedWallet = jest.fn();

  beforeEach(async () => {
    findOwnedManagedWallet.mockImplementation((userId: string, walletId: string) => {
      if (walletId === MANAGED_WALLET_ID) {
        return Promise.resolve({ id: MANAGED_WALLET_ID, networkId: NETWORK_ID });
      }
      // watch-only veya sahibi olmayan cüzdan — servis bunu domain hatasına çevirir.
      return Promise.reject(new WalletNotManagedException());
    });

    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule],
      controllers: [TransfersController],
      providers: [
        TransfersService,
        TransferStateMachine,
        TransfersThrottlerGuard,
        { provide: TransfersRepository, useClass: InMemoryTransfersRepository },
        { provide: WalletsService, useValue: { findOwnedManagedWallet } },
        {
          provide: NetworksService,
          useValue: {
            findNetworkById: jest.fn(),
            isNetworkAssetActive: jest.fn(),
          },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
        signingQueueProvider,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(UsersRepository)
      .useValue({})
      .overrideProvider(RefreshTokensRepository)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwt = app.get(JwtService);
    repo = app.get(TransfersRepository);
  });

  afterEach(async () => {
    await app.close();
  });

  function token(sub = USER_ID): string {
    return jwt.sign({ sub, role: "user" });
  }

  const body = {
    walletId: MANAGED_WALLET_ID,
    toAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    assetId: ASSET_ID,
    amount: "1000000000000000000",
  };

  it("token yoksa → 401", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(res.status).toBe(401);
  });

  it("Idempotency-Key header'ı yoksa → 400 VALIDATION_FAILED", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${token()}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(repo.rows).toHaveLength(0);
  });

  it("happy path → 201, state 'draft', tek transfer_state_events (fromState:null)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      walletId: MANAGED_WALLET_ID,
      networkId: NETWORK_ID,
      assetId: ASSET_ID,
      toAddress: body.toAddress,
      amount: body.amount,
      state: "draft",
      txHash: null,
    });
    expect(res.body.data).not.toHaveProperty("idempotencyKey");
    expect(repo.rows).toHaveLength(1);
    expect(repo.stateEvents).toEqual([
      {
        transferId: res.body.data.id,
        fromState: null,
        toState: "draft",
        actor: "user",
      },
    ]);
  });

  it("aynı Idempotency-Key ile ikinci istek → 200, aynı id, yeni satır yok", async () => {
    const key = randomUUID();
    const first = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", key)
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", key)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(repo.rows).toHaveLength(1);
  });

  it("watch-only cüzdan → 409 WALLET_NOT_MANAGED, transfer oluşturulmaz", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", randomUUID())
      .send({ ...body, walletId: WATCH_ONLY_WALLET_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("WALLET_NOT_MANAGED");
    expect(repo.rows).toHaveLength(0);
  });

  it("amount ondalıklı/geçersiz formatta → 400 VALIDATION_FAILED", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", randomUUID())
      .send({ ...body, amount: "1.5" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("şemada olmayan alan → 400 VALIDATION_FAILED (.strict())", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${token()}`)
      .set("Idempotency-Key", randomUUID())
      .send({ ...body, extra: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

/**
 * `POST /api/v1/transfers/:id/confirm` HTTP akışı (`docs/03_API_CONTRACTS.md`
 * §5.4) — step-up + guard'lar + `draft → pending_signature`. `AuthService`,
 * `NetworksService`, `WalletsService`, `AuditService` stub'lı; `TransferStateMachine`
 * gerçek, `TransfersRepository` bellek-içi fake.
 */
describe("TransfersController (integration) — POST /api/v1/transfers/:id/confirm", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let repo: InMemoryTransfersRepository;

  const verifyPassword = jest.fn();
  const findNetworkById = jest.fn();
  const isNetworkAssetActive = jest.fn();
  const getCachedBalanceRaw = jest.fn();
  const auditRecord = jest.fn();

  const DRAFT_ID = "f1111111-1111-4111-8111-111111111111";
  const EVM_TO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

  function draftRow(overrides: Partial<Transfer> = {}): Transfer {
    const now = new Date();
    return {
      id: DRAFT_ID,
      walletId: MANAGED_WALLET_ID,
      networkId: NETWORK_ID,
      assetId: ASSET_ID,
      toAddress: EVM_TO,
      amount: "1000",
      state: "draft",
      txHash: null,
      failureReason: null,
      idempotencyKey: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  beforeEach(async () => {
    verifyPassword.mockResolvedValue(true);
    findNetworkById.mockResolvedValue({
      id: NETWORK_ID,
      name: "Sepolia",
      chainType: "evm",
      chainId: "11155111",
      confirmationThreshold: 3,
    });
    isNetworkAssetActive.mockResolvedValue(true);
    getCachedBalanceRaw.mockResolvedValue(10_000n);
    auditRecord.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule],
      controllers: [TransfersController],
      providers: [
        TransfersService,
        TransferStateMachine,
        TransfersThrottlerGuard,
        { provide: TransfersRepository, useClass: InMemoryTransfersRepository },
        { provide: WalletsService, useValue: { getCachedBalanceRaw } },
        {
          provide: NetworksService,
          useValue: { findNetworkById, isNetworkAssetActive },
        },
        { provide: AuditService, useValue: { record: auditRecord } },
        signingQueueProvider,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(AuthService)
      .useValue({ verifyPassword })
      .overrideProvider(UsersRepository)
      .useValue({})
      .overrideProvider(RefreshTokensRepository)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwt = app.get(JwtService);
    repo = app.get(TransfersRepository);
  });

  afterEach(async () => {
    await app.close();
  });

  function token(sub = USER_ID): string {
    return jwt.sign({ sub, role: "user" });
  }

  it("happy path → 200, state pending_signature, state_event + audit yazıldı", async () => {
    repo.seed(draftRow(), USER_ID);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/transfers/${DRAFT_ID}/confirm`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ currentPassword: "correct-horse" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ state: "pending_signature" });
    expect(repo.rows[0].state).toBe("pending_signature");
    expect(repo.stateEvents).toEqual([
      {
        transferId: DRAFT_ID,
        fromState: "draft",
        toState: "pending_signature",
        actor: "user",
      },
    ]);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "TRANSFER_STATE_CHANGED",
        entityId: DRAFT_ID,
        metadata: { fromState: "draft", toState: "pending_signature" },
      }),
    );
  });

  it("yanlış şifre → 401 AUTH_STEP_UP_REQUIRED, geçiş yok", async () => {
    repo.seed(draftRow(), USER_ID);
    verifyPassword.mockResolvedValue(false);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/transfers/${DRAFT_ID}/confirm`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ currentPassword: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_STEP_UP_REQUIRED");
    expect(repo.rows[0].state).toBe("draft");
  });

  it("başkasının transferi → 403 FORBIDDEN_NOT_OWNER", async () => {
    repo.seed(draftRow(), "99999999-9999-4999-8999-999999999999");

    const res = await request(app.getHttpServer())
      .post(`/api/v1/transfers/${DRAFT_ID}/confirm`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ currentPassword: "correct-horse" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_NOT_OWNER");
  });

  it("biçimsiz :id → 404 RESOURCE_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transfers/not-a-uuid/confirm")
      .set("Authorization", `Bearer ${token()}`)
      .send({ currentPassword: "correct-horse" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("currentPassword eksik → 400 VALIDATION_FAILED", async () => {
    repo.seed(draftRow(), USER_ID);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/transfers/${DRAFT_ID}/confirm`)
      .set("Authorization", `Bearer ${token()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("token yoksa → 401", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/transfers/${DRAFT_ID}/confirm`)
      .send({ currentPassword: "correct-horse" });

    expect(res.status).toBe(401);
  });
});

/**
 * `GET /api/v1/transfers/:id` + `DELETE /api/v1/transfers/:id` HTTP akışı
 * (`docs/03_API_CONTRACTS.md` §5.4) — İterasyon 7 (§5.6b). Sahiplik + Admin
 * salt-okunur (GET) / Admin muaf değil (DELETE); `draft` dışı silme reddi.
 */
describe("TransfersController (integration) — GET + DELETE /api/v1/transfers/:id", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let repo: InMemoryTransfersRepository;

  const ADMIN_ID = "abababab-abab-4bab-8bab-abababababab";
  const TARGET_ID = "f2222222-2222-4222-8222-222222222222";

  function transferRow(overrides: Partial<Transfer> = {}): Transfer {
    const now = new Date();
    return {
      id: TARGET_ID,
      walletId: MANAGED_WALLET_ID,
      networkId: NETWORK_ID,
      assetId: ASSET_ID,
      toAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      amount: "1000",
      state: "draft",
      txHash: null,
      failureReason: null,
      idempotencyKey: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule],
      controllers: [TransfersController],
      providers: [
        TransfersService,
        TransferStateMachine,
        TransfersThrottlerGuard,
        { provide: TransfersRepository, useClass: InMemoryTransfersRepository },
        { provide: WalletsService, useValue: {} },
        { provide: NetworksService, useValue: {} },
        { provide: AuditService, useValue: { record: jest.fn() } },
        signingQueueProvider,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(AuthService)
      .useValue({ verifyPassword: jest.fn() })
      .overrideProvider(UsersRepository)
      .useValue({})
      .overrideProvider(RefreshTokensRepository)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwt = app.get(JwtService);
    repo = app.get(TransfersRepository);
  });

  afterEach(async () => {
    await app.close();
  });

  const userToken = (sub = USER_ID) => jwt.sign({ sub, role: "user" });
  const adminToken = () => jwt.sign({ sub: ADMIN_ID, role: "admin" });

  it("GET — sahibi: transfer detay + denetim izi döner", async () => {
    repo.seed(transferRow(), USER_ID);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/transfers/${TARGET_ID}`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: TARGET_ID, state: "draft" });
    expect(res.body.data.stateEvents).toEqual([
      { fromState: null, toState: "draft", actor: "user", occurredAt: expect.any(String), metadata: null },
    ]);
    expect(res.body.data).not.toHaveProperty("idempotencyKey");
  });

  it("GET — Admin başkasının transfer'ini görebilir (salt-okunur)", async () => {
    repo.seed(transferRow(), USER_ID);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/transfers/${TARGET_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });

  it("GET — başkasının transfer'i + User → 403 FORBIDDEN_NOT_OWNER", async () => {
    repo.seed(transferRow(), "99999999-9999-4999-8999-999999999999");

    const res = await request(app.getHttpServer())
      .get(`/api/v1/transfers/${TARGET_ID}`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_NOT_OWNER");
  });

  it("GET — kayıt yok → 404 RESOURCE_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/transfers/${TARGET_ID}`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("GET — biçimsiz :id → 404 RESOURCE_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/transfers/not-a-uuid")
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("DELETE — sahibinin draft'ı → 204, transfer + denetim izi silinir", async () => {
    repo.seed(transferRow(), USER_ID);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/transfers/${TARGET_ID}`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(204);
    expect(repo.rows).toHaveLength(0);
    expect(repo.stateEventRows).toHaveLength(0);
  });

  it("DELETE — draft değil (signed) → 409 TRANSFER_INVALID_TRANSITION, silinmez", async () => {
    repo.seed(transferRow({ state: "signed" }), USER_ID);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/transfers/${TARGET_ID}`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TRANSFER_INVALID_TRANSITION");
    expect(repo.rows).toHaveLength(1);
  });

  it("DELETE — Admin başkasının draft'ını silemez → 403 FORBIDDEN_NOT_OWNER", async () => {
    repo.seed(transferRow(), USER_ID);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/transfers/${TARGET_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_NOT_OWNER");
    expect(repo.rows).toHaveLength(1);
  });

  it("DELETE — token yoksa → 401", async () => {
    const res = await request(app.getHttpServer()).delete(
      `/api/v1/transfers/${TARGET_ID}`,
    );
    expect(res.status).toBe(401);
  });
});
