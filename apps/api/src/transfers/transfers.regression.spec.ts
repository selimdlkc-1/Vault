import { randomUUID } from "node:crypto";
import { getQueueToken } from "@nestjs/bullmq";
import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { Transfer } from "@prisma/client";
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
import { InMemoryTransfersRepository } from "./testing/in-memory-transfers.repository";
import {
  TEST_ASSET_ID,
  TEST_EVM_ADDRESS,
  TEST_NETWORK_ID,
  TEST_OWNER_ID,
  TEST_TRON_ADDRESS,
  TEST_WALLET_ID,
  createTestTransfer,
} from "./testing/transfer.factory";
import { SIGNING_QUEUE } from "../workers/signing/signing.queue";

/**
 * §5.7 — Faz 5 negatif senaryo regresyon paketi (`docs/08_TESTING_STRATEGY.md`
 * §4). Transfer'e özel 5 "olumsuz yol" senaryosu, **uçtan uca HTTP isteği
 * üzerinden** (controller → global guard zinciri → pipe → `TransfersService` →
 * `TransferStateMachine` → repository) tek yerde toplu ve tekrar doğrulanabilir
 * biçimde:
 *
 * | # | docs/08 §4 | Senaryo                       | Beklenen                          |
 * |---|-----------|------------------------------|-----------------------------------|
 * | 1 | madde 1   | cross-network mismatch       | 409 WALLET_CROSS_NETWORK_MISMATCH  |
 * | 3 | madde 3   | terminal durumdan geçiş      | 409 TRANSFER_INVALID_TRANSITION    |
 * | 4 | madde 4   | step-up başarısız            | 401 AUTH_STEP_UP_REQUIRED          |
 * | 7 | madde 7   | watch-only'den transfer      | 409 WALLET_NOT_MANAGED             |
 * | 8 | madde 8   | yetersiz bakiye              | 409 WALLET_INSUFFICIENT_BALANCE    |
 *
 * Terminal durumun tam geçiş matrisi (3 terminal × tüm hedefler) unit seviyede
 * `transfer-state-machine.service.spec.ts`'tedir; burası aynı kuralın HTTP
 * yüzeyinden reddedildiğini gösterir. Repository/`$transaction` bellek-içi fake
 * (`.claude/rules/30-testing.md`); zincir istemcisi hiç çağrılmaz.
 */
const signingQueueProvider = {
  provide: getQueueToken(SIGNING_QUEUE),
  useValue: { add: jest.fn() },
};

const SEED_TRANSFER_ID = "f7777777-7777-4777-8777-777777777777";

describe("Transfer negatif senaryo regresyonu (§5.7) — /api/v1/transfers", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let repo: InMemoryTransfersRepository;

  const findOwnedManagedWallet = jest.fn();
  const getCachedBalanceRaw = jest.fn();
  const verifyPassword = jest.fn();
  const findNetworkById = jest.fn();
  const isNetworkAssetActive = jest.fn();
  const auditRecord = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    findOwnedManagedWallet.mockImplementation(
      (userId: string, walletId: string) => {
        if (walletId === TEST_WALLET_ID) {
          return Promise.resolve({ id: TEST_WALLET_ID, networkId: TEST_NETWORK_ID });
        }
        // watch-only / sahibi olmayan cüzdan → servis domain hatasına çevirir.
        return Promise.reject(new WalletNotManagedException());
      },
    );
    getCachedBalanceRaw.mockResolvedValue(10_000n);
    verifyPassword.mockResolvedValue(true);
    findNetworkById.mockResolvedValue({
      id: TEST_NETWORK_ID,
      name: "Sepolia",
      chainType: "evm",
      chainId: "11155111",
      confirmationThreshold: 12,
    });
    isNetworkAssetActive.mockResolvedValue(true);
    auditRecord.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule],
      controllers: [TransfersController],
      providers: [
        TransfersService,
        TransferStateMachine,
        TransfersThrottlerGuard,
        { provide: TransfersRepository, useClass: InMemoryTransfersRepository },
        {
          provide: WalletsService,
          useValue: { findOwnedManagedWallet, getCachedBalanceRaw },
        },
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

  const ownerToken = () => jwt.sign({ sub: TEST_OWNER_ID, role: "user" });

  /** Sahibi `TEST_OWNER_ID` olan, `TEST_NETWORK_ID` (EVM) üzerinde bir draft. */
  function seedDraft(overrides: Partial<Transfer> = {}): void {
    repo.seed(
      createTestTransfer({ id: SEED_TRANSFER_ID, state: "draft", ...overrides }),
      TEST_OWNER_ID,
    );
  }

  const confirm = (id = SEED_TRANSFER_ID, currentPassword = "correct-horse") =>
    request(app.getHttpServer())
      .post(`/api/v1/transfers/${id}/confirm`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ currentPassword });

  it("Senaryo 1 (docs/08 §4.1) — cross-network mismatch: EVM cüzdana Tron adresli draft'ın confirm'i → 409 WALLET_CROSS_NETWORK_MISMATCH, draft'ta kalır", async () => {
    seedDraft({ toAddress: TEST_TRON_ADDRESS });

    const res = await confirm();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("WALLET_CROSS_NETWORK_MISMATCH");
    expect(repo.rows[0].state).toBe("draft");
    // Yalnızca seed'in `null → draft` kaydı; ileri geçiş yazılmadı.
    expect(repo.stateEvents).toHaveLength(0);
  });

  it("Senaryo 3 (docs/08 §4.3) — terminal durum: confirmed transfer'in confirm'i → 409 TRANSFER_INVALID_TRANSITION", async () => {
    seedDraft({ state: "confirmed" });

    const res = await confirm();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TRANSFER_INVALID_TRANSITION");
    expect(repo.rows[0].state).toBe("confirmed");
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("Senaryo 4 (docs/08 §4.4) — step-up başarısız: yanlış şifre → 401 AUTH_STEP_UP_REQUIRED, draft'ta kalır", async () => {
    seedDraft();
    verifyPassword.mockResolvedValue(false);

    const res = await confirm(SEED_TRANSFER_ID, "wrong-password");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_STEP_UP_REQUIRED");
    expect(repo.rows[0].state).toBe("draft");
    expect(repo.stateEvents).toHaveLength(0);
    // Step-up EN ÖNCE — sonraki guard'lar tetiklenmez.
    expect(findNetworkById).not.toHaveBeenCalled();
    expect(getCachedBalanceRaw).not.toHaveBeenCalled();
  });

  it("Senaryo 7 (docs/08 §4.7) — watch-only'den transfer: POST /transfers watch-only walletId → 409 WALLET_NOT_MANAGED, kayıt oluşmaz", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${ownerToken()}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        walletId: "c0000000-0000-4000-8000-000000000000",
        toAddress: TEST_EVM_ADDRESS,
        assetId: TEST_ASSET_ID,
        amount: "1000",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("WALLET_NOT_MANAGED");
    expect(repo.rows).toHaveLength(0);
  });

  it("Senaryo 8 (docs/08 §4.8) — yetersiz bakiye: cache bakiyesi tutarın altında → 409 WALLET_INSUFFICIENT_BALANCE, draft'ta kalır", async () => {
    seedDraft({ amount: "5000" });
    getCachedBalanceRaw.mockResolvedValue(4_999n);

    const res = await confirm();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("WALLET_INSUFFICIENT_BALANCE");
    expect(repo.rows[0].state).toBe("draft");
    expect(repo.stateEvents).toHaveLength(0);
  });

  it("Idempotency regresyonu (docs/03 §7) — aynı Idempotency-Key ile iki POST /transfers → 201 sonra 200, tek satır", async () => {
    const key = randomUUID();
    const body = {
      walletId: TEST_WALLET_ID,
      toAddress: TEST_EVM_ADDRESS,
      assetId: TEST_ASSET_ID,
      amount: "1000",
    };

    const first = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${ownerToken()}`)
      .set("Idempotency-Key", key)
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${ownerToken()}`)
      .set("Idempotency-Key", key)
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(repo.rows).toHaveLength(1);
  });
});
