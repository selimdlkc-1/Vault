import { type INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { NetworkAsset } from "@prisma/client";
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
import { TestingPrismaModule } from "../prisma/testing-prisma.module";
import { NetworksModule } from "./networks.module";
import { NetworksRepository } from "./networks.repository";

/**
 * Admin network/asset aktivasyon HTTP akışı uçtan uca (controller → guard →
 * pipe → service → repository + audit) — `docs/03_API_CONTRACTS.md` §5.3.
 * Repository ve `PrismaService.$transaction` bellek-içi fake ile değiştirilir
 * (`.claude/rules/30-testing.md`); global guard zinciri, interceptor ve filter
 * gerçektir.
 */
const SEPOLIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USDT_ID = "d2222222-2222-4222-8222-222222222222";
const UNKNOWN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const PAIRS = new Map<string, NetworkAsset>([
  [
    `${SEPOLIA_ID}:${USDT_ID}`,
    {
      networkId: SEPOLIA_ID,
      assetId: USDT_ID,
      isActive: true,
      activatedAt: new Date("2026-08-01T00:00:00.000Z"),
    },
  ],
]);

class InMemoryNetworksRepository {
  findNetworkAsset(networkId: string, assetId: string): Promise<NetworkAsset | null> {
    return Promise.resolve(PAIRS.get(`${networkId}:${assetId}`) ?? null);
  }

  updateActivation(
    tx: unknown,
    networkId: string,
    assetId: string,
    isActive: boolean,
  ): Promise<NetworkAsset> {
    const row = PAIRS.get(`${networkId}:${assetId}`);
    if (!row) {
      throw new Error("pair yok");
    }
    const next: NetworkAsset = {
      ...row,
      isActive,
      activatedAt: isActive ? new Date("2026-09-01T00:00:00.000Z") : row.activatedAt,
    };
    PAIRS.set(`${networkId}:${assetId}`, next);
    return Promise.resolve(next);
  }
}

class InMemoryAuditRepository {
  readonly rows: AuditLogEntry[] = [];

  create(tx: unknown, entry: AuditLogEntry): Promise<void> {
    this.rows.push(entry);
    return Promise.resolve();
  }
}

describe("AdminNetworkAssetsController (integration) — PATCH /api/v1/admin/network-assets", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let auditRepo: InMemoryAuditRepository;

  beforeEach(async () => {
    // Her testte pasifleştirilmiş satırı aktife geri al (izolasyon).
    PAIRS.set(`${SEPOLIA_ID}:${USDT_ID}`, {
      networkId: SEPOLIA_ID,
      assetId: USDT_ID,
      isActive: true,
      activatedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), TestingPrismaModule, AuthModule, NetworksModule],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(NetworksRepository)
      .useClass(InMemoryNetworksRepository)
      .overrideProvider(AuditRepository)
      .useClass(InMemoryAuditRepository)
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
  });

  afterEach(async () => {
    await app.close();
  });

  function tokenFor(role: AuthenticatedUser["role"], id = `user-${role}`): string {
    return jwt.sign({ sub: id, role });
  }

  it("Admin → 200 + güncellenmiş çift, audit_logs'a NETWORK_ASSET_DEACTIVATED satırı düşer", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/network-assets/${SEPOLIA_ID}/${USDT_ID}`)
      .set("Authorization", `Bearer ${tokenFor("admin", "admin-1")}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      networkId: SEPOLIA_ID,
      assetId: USDT_ID,
      isActive: false,
      activatedAt: "2026-08-01T00:00:00.000Z",
    });

    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]).toEqual({
      actorType: "admin",
      actorId: "admin-1",
      action: "NETWORK_ASSET_DEACTIVATED",
      entityType: "network_asset",
      entityId: null,
      metadata: { networkId: SEPOLIA_ID, assetId: USDT_ID },
    });
  });

  // docs/08_TESTING_STRATEGY.md §4 — zorunlu negatif senaryo #6:
  // User rolü bir Admin endpoint'ine erişmeye çalışırsa 403 FORBIDDEN_ROLE.
  it("User → 403 FORBIDDEN_ROLE, hiçbir güncelleme/audit yazımı olmaz", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/network-assets/${SEPOLIA_ID}/${USDT_ID}`)
      .set("Authorization", `Bearer ${tokenFor("user")}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ROLE");
    expect(auditRepo.rows).toHaveLength(0);
    expect(PAIRS.get(`${SEPOLIA_ID}:${USDT_ID}`)?.isActive).toBe(true);
  });

  it("token yok → 401 AUTH_TOKEN_INVALID", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/network-assets/${SEPOLIA_ID}/${USDT_ID}`)
      .send({ isActive: false });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("Admin + bilinmeyen çift → 404 RESOURCE_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/network-assets/${SEPOLIA_ID}/${UNKNOWN_ID}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(auditRepo.rows).toHaveLength(0);
  });

  it("Admin + biçimsiz assetId → 404 RESOURCE_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/network-assets/${SEPOLIA_ID}/not-a-uuid`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("Admin + şemada olmayan alan → 400 VALIDATION_FAILED (.strict())", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/network-assets/${SEPOLIA_ID}/${USDT_ID}`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ isActive: false, extra: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});
