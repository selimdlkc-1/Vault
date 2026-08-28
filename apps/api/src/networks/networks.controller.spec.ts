import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { Asset, Network } from "@prisma/client";
import request from "supertest";
import { AuthModule } from "../auth/auth.module";
import { RefreshTokensRepository } from "../auth/refresh-tokens.repository";
import { UsersRepository } from "../auth/users.repository";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ResponseEnvelopeInterceptor } from "../common/interceptors/response-envelope.interceptor";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { testConfigModule } from "../config/testing-config.module";
import { TestingPrismaModule } from "../prisma/testing-prisma.module";
import { NetworksModule } from "./networks.module";
import type { NetworkAssetWithAsset } from "./networks.repository";
import { NetworksRepository } from "./networks.repository";

/**
 * Network/Asset okuma HTTP akışı uçtan uca (controller → pipe → service →
 * repository) — `docs/03_API_CONTRACTS.md` §5.3. Repository bellek-içi fake ile
 * değiştirilir (`.claude/rules/30-testing.md`); global guard zinciri, interceptor
 * ve filter gerçektir. `AuthModule` yalnızca `JwtModule` (token doğrulama) için
 * import edilir; auth repository'leri kullanılmadığından boş obje ile geçilir.
 */
const SEPOLIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHASTA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNKNOWN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function network(overrides: Partial<Network> & Pick<Network, "id">): Network {
  return {
    name: "Sepolia",
    chainType: "evm",
    chainId: "11155111",
    confirmationThreshold: 12,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function asset(overrides: Partial<Asset> & Pick<Asset, "id" | "networkId">): Asset {
  return {
    symbol: "ETH",
    decimals: 18,
    contractAddress: null,
    coingeckoId: "ethereum",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

const NETWORKS: Network[] = [
  network({ id: SHASTA_ID, name: "Tron Shasta", chainType: "tron", chainId: "shasta", confirmationThreshold: 19 }),
  network({ id: SEPOLIA_ID, name: "Sepolia", chainType: "evm", chainId: "11155111", confirmationThreshold: 12 }),
];

const SEPOLIA_ETH = asset({ id: "d1111111-1111-4111-8111-111111111111", networkId: SEPOLIA_ID, symbol: "ETH", decimals: 18 });
const SEPOLIA_USDT = asset({
  id: "d2222222-2222-4222-8222-222222222222",
  networkId: SEPOLIA_ID,
  symbol: "USDT",
  decimals: 6,
  coingeckoId: "tether",
});

const NETWORK_ASSETS: NetworkAssetWithAsset[] = [
  {
    networkId: SEPOLIA_ID,
    assetId: SEPOLIA_ETH.id,
    isActive: true,
    activatedAt: new Date("2026-08-01T00:00:00.000Z"),
    asset: SEPOLIA_ETH,
  },
  {
    networkId: SEPOLIA_ID,
    assetId: SEPOLIA_USDT.id,
    isActive: false,
    activatedAt: null,
    asset: SEPOLIA_USDT,
  },
];

class InMemoryNetworksRepository {
  findAllNetworks(): Promise<Network[]> {
    return Promise.resolve(
      [...NETWORKS].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  findNetworkById(id: string): Promise<Network | null> {
    return Promise.resolve(NETWORKS.find((n) => n.id === id) ?? null);
  }

  findNetworkAssets(
    networkId: string,
    options: { activeOnly: boolean },
  ): Promise<NetworkAssetWithAsset[]> {
    return Promise.resolve(
      NETWORK_ASSETS.filter(
        (row) =>
          row.networkId === networkId &&
          (options.activeOnly ? row.isActive : true),
      ).sort((a, b) => a.asset.symbol.localeCompare(b.asset.symbol)),
    );
  }
}

describe("NetworksController (integration) — /api/v1/networks", () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule, NetworksModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(NetworksRepository)
      .useClass(InMemoryNetworksRepository)
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

  function tokenFor(role: AuthenticatedUser["role"]): string {
    return jwt.sign({ sub: `user-${role}`, role });
  }

  describe("GET /networks", () => {
    it("token yoksa → 401 AUTH_TOKEN_INVALID", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/networks");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
    });

    it("User token ile → 200 + tüm ağlar §5.3 şeklinde", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/networks")
        .set("Authorization", `Bearer ${tokenFor("user")}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        {
          id: SEPOLIA_ID,
          name: "Sepolia",
          chainType: "evm",
          chainId: "11155111",
          confirmationThreshold: 12,
        },
        {
          id: SHASTA_ID,
          name: "Tron Shasta",
          chainType: "tron",
          chainId: "shasta",
          confirmationThreshold: 19,
        },
      ]);
      expect(res.body.meta.timestamp).toEqual(expect.any(String));
    });
  });

  describe("GET /networks/:networkId/assets", () => {
    it("varsayılan (activeOnly=true) → yalnızca aktif çiftler", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/networks/${SEPOLIA_ID}/assets`)
        .set("Authorization", `Bearer ${tokenFor("user")}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        {
          id: SEPOLIA_ETH.id,
          symbol: "ETH",
          decimals: 18,
          contractAddress: null,
          isActive: true,
        },
      ]);
    });

    it("activeOnly=false → User rolüne de açık, pasif çiftler de döner (docs/03 §5.3 bilinçli tasarım)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/networks/${SEPOLIA_ID}/assets?activeOnly=false`)
        .set("Authorization", `Bearer ${tokenFor("user")}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({ symbol: "ETH", isActive: true }),
        expect.objectContaining({ symbol: "USDT", isActive: false }),
      ]);
    });

    it("bilinmeyen networkId → 404 RESOURCE_NOT_FOUND", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/networks/${UNKNOWN_ID}/assets`)
        .set("Authorization", `Bearer ${tokenFor("user")}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
    });

    it("biçimsiz networkId (UUID değil) → 404 RESOURCE_NOT_FOUND", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/networks/not-a-uuid/assets")
        .set("Authorization", `Bearer ${tokenFor("user")}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
    });

    it("activeOnly geçersiz değer → 400 VALIDATION_FAILED", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/networks/${SEPOLIA_ID}/assets?activeOnly=maybe`)
        .set("Authorization", `Bearer ${tokenFor("user")}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });
  });
});
