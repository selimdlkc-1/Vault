import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuditRepository, type AuditLogEntry } from "../audit/audit.repository";
import { AuthModule } from "../auth/auth.module";
import { RefreshTokensRepository } from "../auth/refresh-tokens.repository";
import { UsersRepository } from "../auth/users.repository";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ResponseEnvelopeInterceptor } from "../common/interceptors/response-envelope.interceptor";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { testConfigModule } from "../config/testing-config.module";
import { ChainProviderFactory } from "../networks/chain-provider.factory";
import { NetworksRepository } from "../networks/networks.repository";
import { TestingPrismaModule } from "../prisma/testing-prisma.module";
import { AdminModule } from "./admin.module";
import { AdminUsersRepository } from "./admin-users.repository";
import { MintRepository, type MintTargetAsset, type MintTargetWallet } from "./mint.repository";

/**
 * `POST /api/v1/admin/mint` + `GET /api/v1/admin/users` HTTP akışı uçtan uca
 * (controller → global guard zinciri → pipe → service → repository + audit) —
 * `docs/03_API_CONTRACTS.md` §5.8. Repository'ler ve `PrismaService.$transaction`
 * bellek-içi fake ile değiştirilir; `ChainProviderFactory` mock kontrat çağrısını
 * stub'lar (`.claude/rules/30-testing.md` — gerçek RPC yok).
 */
const NETWORK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WALLET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSET_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UNKNOWN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const WALLET: MintTargetWallet = {
  id: WALLET_ID,
  networkId: NETWORK_ID,
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  network: { chainType: "evm", chainId: "11155111" },
};
const ASSET: MintTargetAsset = {
  id: ASSET_ID,
  networkId: NETWORK_ID,
  symbol: "USDT",
  decimals: 6,
  contractAddress: "0x1234567890123456789012345678901234567890",
};

class InMemoryMintRepository {
  readonly rows: unknown[] = [];

  findWallet(id: string): Promise<MintTargetWallet | null> {
    return Promise.resolve(id === WALLET_ID ? WALLET : null);
  }

  findAsset(id: string): Promise<MintTargetAsset | null> {
    return Promise.resolve(id === ASSET_ID ? ASSET : null);
  }

  create(
    tx: unknown,
    data: { adminId: string; walletId: string; assetId: string; amount: string; txHash: string },
  ): Promise<unknown> {
    const row = {
      id: "mint-op-1",
      ...data,
      createdAt: new Date("2026-08-31T10:00:00.000Z"),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

class InMemoryAdminUsersRepository {
  search(options: { email?: string; page: number; pageSize: number }): Promise<{
    items: { id: string; email: string; role: string; createdAt: Date }[];
    totalItems: number;
  }> {
    const all = [
      {
        id: "u1",
        email: "demo@vault.local",
        role: "user",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ];
    const items = options.email
      ? all.filter((u) => u.email.includes(options.email as string))
      : all;
    return Promise.resolve({ items, totalItems: items.length });
  }
}

class InMemoryAuditRepository {
  readonly rows: AuditLogEntry[] = [];

  create(tx: unknown, entry: AuditLogEntry): Promise<void> {
    this.rows.push(entry);
    return Promise.resolve();
  }
}

describe("AdminController (integration) — /api/v1/admin", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let auditRepo: InMemoryAuditRepository;
  let mintRepo: InMemoryMintRepository;
  const mintToken = jest.fn().mockResolvedValue({ txHash: "0xminttx" });

  beforeEach(async () => {
    mintToken.mockClear();

    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule, AdminModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(MintRepository)
      .useClass(InMemoryMintRepository)
      .overrideProvider(AdminUsersRepository)
      .useClass(InMemoryAdminUsersRepository)
      .overrideProvider(AuditRepository)
      .useClass(InMemoryAuditRepository)
      .overrideProvider(ChainProviderFactory)
      .useValue({ getProvider: () => ({ mintToken }) })
      .overrideProvider(NetworksRepository)
      .useValue({})
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
    auditRepo = app.get(AuditRepository);
    mintRepo = app.get(MintRepository);
  });

  afterEach(async () => {
    await app.close();
  });

  function tokenFor(role: AuthenticatedUser["role"], id = `user-${role}`): string {
    return jwt.sign({ sub: id, role });
  }

  const mintBody = { walletId: WALLET_ID, assetId: ASSET_ID, amount: "1000000" };

  it("Admin → 201 + MintOperation, kontrat mint()'i çağrılır, MINT_EXECUTED audit'i düşer", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/admin/mint")
      .set("Authorization", `Bearer ${tokenFor("admin", "admin-1")}`)
      .send(mintBody);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: "mint-op-1",
      adminId: "admin-1",
      walletId: WALLET_ID,
      assetId: ASSET_ID,
      amount: "1000000",
      txHash: "0xminttx",
    });
    expect(mintToken).toHaveBeenCalledWith(
      ASSET.contractAddress,
      WALLET.address,
      "1000000",
      expect.stringMatching(/^0x[0-9a-fA-F]{64}$/),
    );
    expect(mintRepo.rows).toHaveLength(1);
    expect(auditRepo.rows).toEqual([
      {
        actorType: "admin",
        actorId: "admin-1",
        action: "MINT_EXECUTED",
        entityType: "mint_operation",
        entityId: "mint-op-1",
        metadata: { walletId: WALLET_ID, assetId: ASSET_ID, amount: "1000000" },
      },
    ]);
  });

  it("User → 403 FORBIDDEN_ROLE, hiçbir mint/audit yazımı olmaz", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/admin/mint")
      .set("Authorization", `Bearer ${tokenFor("user")}`)
      .send(mintBody);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ROLE");
    expect(mintToken).not.toHaveBeenCalled();
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("token yok → 401 AUTH_TOKEN_INVALID", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/admin/mint")
      .send(mintBody);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("Admin + bilinmeyen cüzdan → 404 RESOURCE_NOT_FOUND, zincire çağrı yapılmaz", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/admin/mint")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ ...mintBody, walletId: UNKNOWN_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(mintToken).not.toHaveBeenCalled();
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("Admin + şemada olmayan alan → 400 VALIDATION_FAILED (.strict())", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/admin/mint")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ ...mintBody, extra: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /admin/users → Admin 200, sayfalama + email filtresi", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/admin/users?email=demo")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: "u1",
        email: "demo@vault.local",
        role: "user",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it("GET /admin/users → User 403 FORBIDDEN_ROLE", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${tokenFor("user")}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ROLE");
  });
});
