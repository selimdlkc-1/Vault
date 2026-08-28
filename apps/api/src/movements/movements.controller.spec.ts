import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { MovementDirection } from "@prisma/client";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { RefreshTokensRepository } from "../auth/refresh-tokens.repository";
import { UsersRepository } from "../auth/users.repository";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ResponseEnvelopeInterceptor } from "../common/interceptors/response-envelope.interceptor";
import { PRICE_CACHE_REDIS, PriceCacheService } from "../common/price-cache.service";
import { testConfigModule } from "../config/testing-config.module";
import { TestingPrismaModule } from "../prisma/testing-prisma.module";
import { MovementsModule } from "./movements.module";
import {
  MovementsRepository,
  type ChainMovementRow,
  type MovementFilters,
} from "./movements.repository";

/**
 * `GET /api/v1/movements` HTTP akışı uçtan uca (controller → pipe → service →
 * repository) — `docs/03_API_CONTRACTS.md` §5.5. Repository bellek-içi fake ile
 * değiştirilir (`.claude/rules/30-testing.md`); guard zinciri, interceptor,
 * filter gerçektir. Bu fazda tüm satırlar `source: 'chain'`.
 */
const USER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SEPOLIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WALLET_ID = "99999999-9999-4999-8999-999999999999";

function row(
  txHash: string,
  direction: MovementDirection,
  occurredAt: string,
): ChainMovementRow {
  return {
    id: txHash,
    walletId: WALLET_ID,
    assetId: "a-eth",
    txHash,
    direction,
    amount: "1000000000000000000",
    occurredAt: new Date(occurredAt),
    createdAt: new Date(occurredAt),
    asset: {
      id: "a-eth",
      networkId: SEPOLIA_ID,
      symbol: "ETH",
      decimals: 18,
      contractAddress: null,
      coingeckoId: "ethereum",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    },
    wallet: { networkId: SEPOLIA_ID, userId: USER_ID },
  } as ChainMovementRow;
}

const ALL_ROWS = [
  row("0xin", "incoming", "2026-08-20T10:00:00.000Z"),
  row("0xout", "outgoing", "2026-08-19T10:00:00.000Z"),
];

class InMemoryMovementsRepository {
  findByFilters(
    userId: string,
    filters: MovementFilters,
  ): Promise<{ items: ChainMovementRow[]; totalItems: number }> {
    if (userId !== USER_ID) {
      return Promise.resolve({ items: [], totalItems: 0 });
    }
    let items = ALL_ROWS;
    if (filters.direction) {
      items = items.filter((r) => r.direction === filters.direction);
    }
    if (filters.walletId) {
      items = items.filter((r) => r.walletId === filters.walletId);
    }
    return Promise.resolve({ items, totalItems: items.length });
  }

  findRecentByWallet(): Promise<ChainMovementRow[]> {
    return Promise.resolve([]);
  }
}

describe("MovementsController (integration) — GET /api/v1/movements", () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule, MovementsModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(MovementsRepository)
      .useClass(InMemoryMovementsRepository)
      .overrideProvider(PriceCacheService)
      .useValue({
        get: (symbol: string) =>
          Promise.resolve({ ETH: "2000", USDT: "1" }[symbol] ?? null),
      })
      .overrideProvider(PRICE_CACHE_REDIS)
      .useValue({ get: async () => null, set: async () => undefined })
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
  });

  afterEach(async () => {
    await app.close();
  });

  function token(sub = USER_ID): string {
    return jwt.sign({ sub, role: "user" });
  }

  it("token yoksa → 401 AUTH_TOKEN_INVALID", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/movements");
    expect(res.status).toBe(401);
  });

  it("GET /movements → 200, tüm satırlar source:'chain' + pagination", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/movements")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((m: { source: string }) => m.source === "chain")).toBe(true);
    expect(res.body.data[0]).toMatchObject({
      txHash: "0xin",
      direction: "incoming",
      valueUsdtAtTime: "2000.000000000000000000",
    });
    expect(res.body.data[0]).not.toHaveProperty("state");
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 2,
      totalPages: 1,
    });
  });

  it("GET /movements?direction=incoming → yalnızca gelen hareketler", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/movements?direction=incoming")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ txHash: "0xin", direction: "incoming" }),
    ]);
  });

  it("GET /movements?dateFrom>dateTo → 400 VALIDATION_FAILED", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/movements?dateFrom=2026-08-31&dateTo=2026-08-01")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /movements?pageSize=999 → 400 VALIDATION_FAILED (üst sınır 100)", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/movements?pageSize=999")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /movements?direction=sideways → 400 VALIDATION_FAILED (geçersiz enum)", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/movements?direction=sideways")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});
