import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { Network, Wallet } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AuditRepository, type AuditLogEntry } from "../audit/audit.repository";
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
import { NetworksRepository } from "../networks/networks.repository";
import type { NetworkAssetWithAsset } from "../networks/networks.repository";
import { MovementsRepository } from "../movements/movements.repository";
import { WalletsRepository } from "./wallets.repository";
import { WalletsModule } from "./wallets.module";

/**
 * `POST /api/v1/wallets/watch-only` HTTP akışı uçtan uca (controller → pipe →
 * service → repository) — `docs/03_API_CONTRACTS.md` §5.2. Repository'ler
 * bellek-içi fake ile değiştirilir (`.claude/rules/30-testing.md`); global guard
 * zinciri, interceptor, filter ve `$transaction` fake'i gerçektir.
 *
 * Zorunlu negatif senaryolar (`docs/08` §4): #12 (geçersiz adres formatı → 422),
 * #2 (pasif `(network, asset)` → 409) burada HTTP seviyesinde de sabitlenir.
 */
const SEPOLIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHASTA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMPTY_NETWORK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UNKNOWN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const VALID_EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const VALID_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const NETWORKS: Network[] = [
  {
    id: SEPOLIA_ID,
    name: "Sepolia",
    chainType: "evm",
    chainId: "11155111",
    confirmationThreshold: 12,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  },
  {
    id: SHASTA_ID,
    name: "Tron Shasta",
    chainType: "tron",
    chainId: "shasta",
    confirmationThreshold: 19,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  },
  {
    id: EMPTY_NETWORK_ID,
    name: "Boş Ağ",
    chainType: "evm",
    chainId: "99999",
    confirmationThreshold: 5,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  },
];

/** Yalnızca SEPOLIA ve SHASTA'nın aktif bir varlığı var; EMPTY_NETWORK_ID'nin yok. */
const ACTIVE_ASSET_NETWORK_IDS = new Set([SEPOLIA_ID, SHASTA_ID]);

class InMemoryNetworksRepository {
  findNetworkById(id: string): Promise<Network | null> {
    return Promise.resolve(NETWORKS.find((n) => n.id === id) ?? null);
  }

  findNetworkAssets(networkId: string): Promise<NetworkAssetWithAsset[]> {
    if (!ACTIVE_ASSET_NETWORK_IDS.has(networkId)) {
      return Promise.resolve([]);
    }
    // Aktiflik kontrolü yalnızca satır sayısına bakar; asset alanları önemsiz.
    return Promise.resolve([
      { networkId, assetId: randomUUID(), isActive: true, activatedAt: new Date() } as
        unknown as NetworkAssetWithAsset,
    ]);
  }
}

type WalletRowWithBalances = Wallet & {
  balanceCaches: {
    walletId: string;
    assetId: string;
    balanceRaw: string;
    updatedAt: Date;
    asset: {
      id: string;
      networkId: string;
      symbol: string;
      decimals: number;
      contractAddress: string | null;
      coingeckoId: string;
      createdAt: Date;
    };
  }[];
};

class InMemoryWalletsRepository {
  readonly rows: WalletRowWithBalances[] = [];

  findByNetworkAndAddress(
    networkId: string,
    address: string,
  ): Promise<Wallet | null> {
    return Promise.resolve(
      this.rows.find(
        (r) => r.networkId === networkId && r.address === address,
      ) ?? null,
    );
  }

  create(
    tx: unknown,
    data: { userId: string; networkId: string; type: Wallet["type"]; address: string },
  ): Promise<Wallet> {
    const row: WalletRowWithBalances = {
      id: randomUUID(),
      userId: data.userId,
      networkId: data.networkId,
      type: data.type,
      address: data.address,
      derivationIndex: null,
      encryptedDek: null,
      createdAt: new Date("2026-08-28T00:00:00.000Z"),
      updatedAt: new Date("2026-08-28T00:00:00.000Z"),
      balanceCaches: [
        {
          walletId: "",
          assetId: "asset-eth",
          balanceRaw: "1000000000000000000",
          updatedAt: new Date("2026-08-28T00:00:00.000Z"),
          asset: {
            id: "asset-eth",
            networkId: data.networkId,
            symbol: "ETH",
            decimals: 18,
            contractAddress: null,
            coingeckoId: "ethereum",
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
      ],
    };
    row.balanceCaches[0].walletId = row.id;
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findByUserId(
    userId: string,
    options: { page: number; pageSize: number; networkId?: string; type?: Wallet["type"] },
  ): Promise<{ items: WalletRowWithBalances[]; totalItems: number }> {
    const filtered = this.rows.filter(
      (r) =>
        r.userId === userId &&
        (options.networkId ? r.networkId === options.networkId : true) &&
        (options.type ? r.type === options.type : true),
    );
    const start = (options.page - 1) * options.pageSize;
    return Promise.resolve({
      items: filtered.slice(start, start + options.pageSize),
      totalItems: filtered.length,
    });
  }

  findById(walletId: string): Promise<WalletRowWithBalances | null> {
    return Promise.resolve(this.rows.find((r) => r.id === walletId) ?? null);
  }
}

class InMemoryAuditRepository {
  readonly rows: AuditLogEntry[] = [];

  create(tx: unknown, entry: AuditLogEntry): Promise<void> {
    this.rows.push(entry);
    return Promise.resolve();
  }
}

describe("WalletsController (integration) — POST /api/v1/wallets/watch-only", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let auditRepo: InMemoryAuditRepository;
  let walletsRepo: InMemoryWalletsRepository;
  const userId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule, WalletsModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(NetworksRepository)
      .useClass(InMemoryNetworksRepository)
      .overrideProvider(WalletsRepository)
      .useClass(InMemoryWalletsRepository)
      // `GET /wallets/:id`'in son 5 zincir hareketi `MovementsService` üzerinden
      // gelir (Faz 3 §3.6a); bu spec hareket akışını test etmez → boş dizi.
      .overrideProvider(MovementsRepository)
      .useValue({ findRecentByWallet: () => Promise.resolve([]) })
      .overrideProvider(AuditRepository)
      .useClass(InMemoryAuditRepository)
      // Fiyat cache'i: `price-sync` worker'ının yazdığı Redis'i taklit eder;
      // ETH ve USDT fiyatları sabit → deterministik `valueUsdt`.
      .overrideProvider(PriceCacheService)
      .useValue({
        get: (symbol: string) =>
          Promise.resolve({ ETH: "2000", USDT: "1" }[symbol] ?? null),
      })
      // Gerçek ioredis bağlantısı açılmasın (testte açık handle bırakır).
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
    auditRepo = app.get(AuditRepository);
    walletsRepo = app.get(WalletsRepository);
  });

  afterEach(async () => {
    await app.close();
  });

  function userToken(): string {
    return jwt.sign({ sub: userId, role: "user" });
  }

  function post(body: Record<string, unknown>, token = userToken()) {
    return request(app.getHttpServer())
      .post("/api/v1/wallets/watch-only")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  it("token yoksa → 401 AUTH_TOKEN_INVALID", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/wallets/watch-only")
      .send({ networkId: SEPOLIA_ID, address: VALID_EVM });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("happy path → 201 + oluşturulan cüzdan + WALLET_CREATED audit", async () => {
    const res = await post({ networkId: SEPOLIA_ID, address: VALID_EVM });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      userId,
      networkId: SEPOLIA_ID,
      type: "watch_only",
      address: VALID_EVM,
      createdAt: expect.any(String),
    });
    expect(res.body.data).not.toHaveProperty("encryptedDek");

    expect(auditRepo.rows).toEqual([
      {
        actorType: "user",
        actorId: userId,
        action: "WALLET_CREATED",
        entityType: "wallet",
        entityId: res.body.data.id,
        metadata: { type: "watch_only" },
      },
    ]);
  });

  it("Tron ağı + geçerli base58check adres → 201", async () => {
    const res = await post({ networkId: SHASTA_ID, address: VALID_TRON });
    expect(res.status).toBe(201);
    expect(res.body.data.address).toBe(VALID_TRON);
  });

  // docs/08 §4 senaryo #12.
  it("geçersiz adres formatı (EVM ağına Tron adresi) → 422 WALLET_ADDRESS_INVALID_FORMAT", async () => {
    const res = await post({ networkId: SEPOLIA_ID, address: VALID_TRON });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("WALLET_ADDRESS_INVALID_FORMAT");
    expect(auditRepo.rows).toHaveLength(0);
  });

  // docs/08 §4 senaryo #2.
  it("pasif (network, asset) — aktif varlığı olmayan ağ → 409 NETWORK_ASSET_INACTIVE", async () => {
    const res = await post({ networkId: EMPTY_NETWORK_ID, address: VALID_EVM });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NETWORK_ASSET_INACTIVE");
  });

  it("bilinmeyen networkId → 409 NETWORK_ASSET_INACTIVE (§5.2 hata listesi RESOURCE_NOT_FOUND içermez)", async () => {
    const res = await post({ networkId: UNKNOWN_ID, address: VALID_EVM });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NETWORK_ASSET_INACTIVE");
  });

  it("aynı (network, address) ikinci kez → 409 WALLET_ADDRESS_ALREADY_EXISTS", async () => {
    await post({ networkId: SEPOLIA_ID, address: VALID_EVM }).expect(201);
    const res = await post({ networkId: SEPOLIA_ID, address: VALID_EVM });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("WALLET_ADDRESS_ALREADY_EXISTS");
    expect(walletsRepo.rows).toHaveLength(1);
  });

  it("şemada olmayan alan → 400 VALIDATION_FAILED", async () => {
    const res = await post({
      networkId: SEPOLIA_ID,
      address: VALID_EVM,
      type: "managed",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("networkId UUID değil → 400 VALIDATION_FAILED", async () => {
    const res = await post({ networkId: "not-a-uuid", address: VALID_EVM });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  // --- Faz 3 §3.4a: GET /wallets, GET /wallets/:id ---

  const OTHER_USER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

  function otherUserToken(): string {
    return jwt.sign({ sub: OTHER_USER_ID, role: "user" });
  }

  function adminToken(): string {
    return jwt.sign({ sub: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", role: "admin" });
  }

  async function createWallet(): Promise<string> {
    const res = await post({ networkId: SEPOLIA_ID, address: VALID_EVM });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  it("GET /wallets → 200, yalnızca kendi cüzdanları + USDT değerlemesi + pagination", async () => {
    await createWallet();

    const res = await request(app.getHttpServer())
      .get("/api/v1/wallets")
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    expect(res.body.data[0]).toMatchObject({
      networkId: SEPOLIA_ID,
      type: "watch_only",
      address: VALID_EVM,
      balances: [
        {
          assetId: "asset-eth",
          symbol: "ETH",
          balanceRaw: "1000000000000000000",
          valueUsdt: "2000.000000000000000000",
        },
      ],
    });
  });

  it("GET /wallets → başka kullanıcının cüzdanı görünmez", async () => {
    await createWallet();

    const res = await request(app.getHttpServer())
      .get("/api/v1/wallets")
      .set("Authorization", `Bearer ${otherUserToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("GET /wallets?userId= → User başkasını denerse 403 FORBIDDEN_ROLE", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/wallets?userId=${OTHER_USER_ID}`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ROLE");
  });

  it("GET /wallets?userId= → Admin başka kullanıcının cüzdanlarını görebilir", async () => {
    await createWallet();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/wallets?userId=${userId}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("GET /wallets?pageSize=999 → 400 VALIDATION_FAILED (üst sınır 100)", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/wallets?pageSize=999")
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /wallets/:id → 200, sahip olan kullanıcı, boş chainMovements", async () => {
    const walletId = await createWallet();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/wallets/${walletId}`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: walletId, chainMovements: [] });
    expect(res.body.data.balances[0].valueUsdt).toBe("2000.000000000000000000");
  });

  // docs/08 §4 senaryo #5.
  it("GET /wallets/:id → sahiplik olmayan kullanıcı 403 FORBIDDEN_NOT_OWNER", async () => {
    const walletId = await createWallet();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/wallets/${walletId}`)
      .set("Authorization", `Bearer ${otherUserToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_NOT_OWNER");
  });

  it("GET /wallets/:id → Admin başkasının cüzdanını görebilir (salt-okunur)", async () => {
    const walletId = await createWallet();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/wallets/${walletId}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(walletId);
  });

  it("GET /wallets/:id → bilinmeyen id 404 RESOURCE_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/wallets/${UNKNOWN_ID}`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("GET /wallets/:id → biçimsiz id 404 RESOURCE_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/wallets/not-a-uuid")
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});
