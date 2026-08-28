import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
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
import { PortfolioModule } from "./portfolio.module";
import {
  PortfolioRepository,
  type CreateSnapshotData,
  type PortfolioWallet,
} from "./portfolio.repository";

/**
 * `GET /api/v1/portfolio/*` HTTP akışı uçtan uca (controller → pipe → service →
 * repository) — `docs/03_API_CONTRACTS.md` §5.6. Repository bellek-içi fake ile
 * değiştirilir (`.claude/rules/30-testing.md`); guard zinciri, interceptor,
 * filter gerçektir. Fiyat cache'i `price-sync` worker'ının yazdığı Redis'i
 * taklit eder (ETH/USDT sabit → deterministik `totalValueUsdt`).
 */
const USER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SEPOLIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function evmCache(
  assetId: string,
  symbol: string,
  decimals: number,
  balanceRaw: string,
): PortfolioWallet["balanceCaches"][number] {
  return {
    walletId: "w1",
    assetId,
    balanceRaw,
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    asset: {
      id: assetId,
      networkId: SEPOLIA_ID,
      symbol,
      decimals,
      contractAddress: null,
      coingeckoId: symbol.toLowerCase(),
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    },
  } as PortfolioWallet["balanceCaches"][number];
}

class InMemoryPortfolioRepository {
  readonly snapshots: CreateSnapshotData[] = [];

  findWalletsWithBalancesByUser(userId: string): Promise<PortfolioWallet[]> {
    if (userId !== USER_ID) {
      return Promise.resolve([]);
    }
    return Promise.resolve([
      {
        id: "w1",
        userId: USER_ID,
        networkId: SEPOLIA_ID,
        type: "watch_only",
        address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        derivationIndex: null,
        encryptedDek: null,
        createdAt: new Date("2026-08-28T00:00:00.000Z"),
        updatedAt: new Date("2026-08-28T00:00:00.000Z"),
        balanceCaches: [
          evmCache("a-eth", "ETH", 18, "1000000000000000000"),
          evmCache("a-usdt", "USDT", 6, "500000000"),
        ],
      } as PortfolioWallet,
    ]);
  }

  findUserIdsWithWallets(): Promise<string[]> {
    return Promise.resolve([USER_ID]);
  }

  createSnapshot(data: CreateSnapshotData): Promise<void> {
    this.snapshots.push(data);
    return Promise.resolve();
  }

  findSnapshotsByUserAndRange(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

describe("PortfolioController (integration) — GET /api/v1/portfolio", () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule, PortfolioModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PortfolioRepository)
      .useClass(InMemoryPortfolioRepository)
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
    const res = await request(app.getHttpServer()).get("/api/v1/portfolio/summary");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("GET /portfolio/summary → 200, toplam + cüzdan bazlı varlık listesi", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/portfolio/summary")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    // 1 ETH · 2000 + 500 USDT · 1 = 2500
    expect(res.body.data.totalValueUsdt).toBe("2500.000000000000000000");
    expect(res.body.data.wallets).toEqual([
      {
        walletId: "w1",
        networkId: SEPOLIA_ID,
        assets: [
          {
            assetId: "a-eth",
            symbol: "ETH",
            balanceRaw: "1000000000000000000",
            valueUsdt: "2000.000000000000000000",
          },
          {
            assetId: "a-usdt",
            symbol: "USDT",
            balanceRaw: "500000000",
            valueUsdt: "500.000000000000000000",
          },
        ],
      },
    ]);
  });

  it("GET /portfolio/summary → cüzdanı olmayan kullanıcı 200 + boş liste, toplam 0", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/portfolio/summary")
      .set("Authorization", `Bearer ${token("ffffffff-ffff-4fff-8fff-ffffffffffff")}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalValueUsdt: "0.000000000000000000",
      wallets: [],
    });
  });

  it("GET /portfolio/history → 200 + { data: [] } (snapshot yok)", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/portfolio/history?dateFrom=2026-08-01&dateTo=2026-08-28")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("GET /portfolio/history → dateTo < dateFrom → 400 VALIDATION_FAILED", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/portfolio/history?dateFrom=2026-08-28&dateTo=2026-08-01")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /portfolio/history → eksik dateTo → 400 VALIDATION_FAILED", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/portfolio/history?dateFrom=2026-08-01")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});
