import { randomUUID } from "node:crypto";
import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { Prisma, Transfer } from "@prisma/client";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { RefreshTokensRepository } from "../auth/refresh-tokens.repository";
import { UsersRepository } from "../auth/users.repository";
import { WalletNotManagedException } from "../common/exceptions/domain.exception";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ResponseEnvelopeInterceptor } from "../common/interceptors/response-envelope.interceptor";
import { testConfigModule } from "../config/testing-config.module";
import { TestingPrismaModule } from "../prisma/testing-prisma.module";
import { WalletsService } from "../wallets/wallets.service";
import { TransfersController } from "./transfers.controller";
import { TransfersRepository } from "./transfers.repository";
import { TransfersService } from "./transfers.service";
import { TransfersThrottlerGuard } from "./transfers-throttler.guard";
import { TransferStateMachine } from "./transfer-state-machine.service";

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
