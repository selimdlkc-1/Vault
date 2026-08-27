import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { RefreshToken, User } from "@prisma/client";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "../common/interceptors/response-envelope.interceptor";
import { testConfigModule } from "../config/testing-config.module";
import { AuthModule } from "./auth.module";
import type { NewRefreshToken } from "./refresh-tokens.repository";
import { RefreshTokensRepository } from "./refresh-tokens.repository";
import { UsersRepository } from "./users.repository";

/**
 * Auth HTTP akışı uçtan uca (controller → pipe → service → repository) —
 * `docs/03_API_CONTRACTS.md` §5.1. Repository'ler bellek-içi fake ile
 * değiştirilir (`.claude/rules/30-testing.md`); geri kalan zincir (global
 * interceptor + filter, `JwtModule`, `cookie-parser`) gerçektir.
 */
class InMemoryUsersRepository {
  readonly rows: User[] = [];

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.rows.find((row) => row.email === email) ?? null);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  create(data: { email: string; passwordHash: string }): Promise<User> {
    const row: User = {
      id: randomUUID(),
      email: data.email,
      passwordHash: data.passwordHash,
      role: "user",
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }
}

class InMemoryRefreshTokensRepository {
  readonly rows: RefreshToken[] = [];

  create(data: NewRefreshToken): Promise<RefreshToken> {
    const row: RefreshToken = {
      id: randomUUID(),
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      revokedAt: null,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return Promise.resolve(
      this.rows.find((row) => row.tokenHash === tokenHash) ?? null,
    );
  }

  async rotate(oldId: string, next: NewRefreshToken): Promise<RefreshToken> {
    const old = this.rows.find((row) => row.id === oldId);
    if (old) {
      old.revokedAt = new Date();
    }
    return this.create(next);
  }

  async revoke(id: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id && r.revokedAt === null);
    if (row) {
      row.revokedAt = new Date();
    }
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    const row = this.rows.find(
      (r) => r.tokenHash === tokenHash && r.revokedAt === null,
    );
    if (row) {
      row.revokedAt = new Date();
    }
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const active = this.rows.filter(
      (r) => r.userId === userId && r.revokedAt === null,
    );
    for (const row of active) {
      row.revokedAt = new Date();
    }
    return active.length;
  }
}

/** `Set-Cookie` başlığından `refresh_token=<değer>` çiftini çıkarır (geri gönderim için). */
function extractRefreshCookie(setCookie: string[] | undefined): string {
  const header = (setCookie ?? []).find((c) => c.startsWith("refresh_token="));
  if (!header) {
    throw new Error("refresh_token cookie bulunamadı");
  }
  return header.split(";")[0];
}

describe("AuthController (integration) — /api/v1/auth", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule(), AuthModule],
    })
      .overrideProvider(UsersRepository)
      .useClass(InMemoryUsersRepository)
      .overrideProvider(RefreshTokensRepository)
      .useClass(InMemoryRefreshTokensRepository)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function registerUser(
    email = "demo@vault.local",
    password = "password1",
  ): Promise<void> {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password })
      .expect(201);
  }

  describe("POST /auth/register", () => {
    it("geçerli kayıt → 201 + response envelope içinde PublicUser", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: "demo@vault.local", password: "password1" });

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual({
        id: expect.any(String),
        email: "demo@vault.local",
        role: "user",
        createdAt: expect.any(String),
      });
      expect(response.body.data).not.toHaveProperty("passwordHash");
      expect(response.body.meta.timestamp).toEqual(expect.any(String));
    });

    it("e-posta normalize edilir (trim + lowercase) ve büyük/küçük harf çakışması 409 verir", async () => {
      await registerUser();

      const dup = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: "  DEMO@Vault.LOCAL  ", password: "password1" });

      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
      expect(dup.body.error.details).toBeNull();
    });

    it("zayıf şifre → 400 VALIDATION_FAILED + alan bazlı details", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: "demo@vault.local", password: "short" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "password" })]),
      );
      expect(response.body.meta.path).toBe("/api/v1/auth/register");
    });

    it("şemada olmayan alan → 400 VALIDATION_FAILED", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: "demo@vault.local", password: "password1", role: "admin" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("eksik alan → 400 VALIDATION_FAILED", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: "demo@vault.local" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("POST /auth/login", () => {
    it("doğru kimlik → 200 + accessToken/user gövdede + httpOnly refresh cookie", async () => {
      await registerUser();

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "demo@vault.local", password: "password1" });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.user).toEqual({
        id: expect.any(String),
        email: "demo@vault.local",
        role: "user",
      });
      expect(response.body.data.user).not.toHaveProperty("passwordHash");

      const setCookie = response.headers["set-cookie"] as unknown as string[];
      const refreshHeader = setCookie.find((c) => c.startsWith("refresh_token="));
      expect(refreshHeader).toBeDefined();
      expect(refreshHeader).toContain("HttpOnly");
      expect(refreshHeader).toMatch(/SameSite=Strict/i);
      expect(refreshHeader).toContain("Path=/api/v1/auth");
    });

    it("yanlış şifre → 401 AUTH_INVALID_CREDENTIALS, cookie yok", async () => {
      await registerUser();

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "demo@vault.local", password: "wrong-pass-1" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("boş şifre → 400 VALIDATION_FAILED", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "demo@vault.local", password: "" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("POST /auth/refresh", () => {
    async function loginAndGetCookie(): Promise<string> {
      await registerUser();
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "demo@vault.local", password: "password1" })
        .expect(200);
      return extractRefreshCookie(
        login.headers["set-cookie"] as unknown as string[],
      );
    }

    it("geçerli cookie → 200 + yeni accessToken + rotate edilmiş cookie", async () => {
      const cookie = await loginAndGetCookie();

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie);

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toEqual(expect.any(String));

      const rotated = extractRefreshCookie(
        response.headers["set-cookie"] as unknown as string[],
      );
      expect(rotated).not.toBe(cookie);
    });

    it("cookie yok → 401 AUTH_TOKEN_EXPIRED", async () => {
      const response = await request(app.getHttpServer()).post(
        "/api/v1/auth/refresh",
      );

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTH_TOKEN_EXPIRED");
    });

    // docs/08_TESTING_STRATEGY.md §4 madde 9 — zorunlu negatif senaryo (regresyon):
    // kullanılmış bir refresh token tekrar sunulursa replay tespiti + kullanıcının
    // TÜM aktif oturumları geçersiz kılınır.
    it("replay: rotate edilmiş eski cookie tekrar sunulursa → 401 AUTH_REFRESH_REUSE_DETECTED ve kullanıcının tüm oturumları iptal edilir", async () => {
      const cookieA = await loginAndGetCookie();

      // Ayrı bir cihazdan ikinci bir oturum (aynı kullanıcı).
      const secondLogin = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "demo@vault.local", password: "password1" })
        .expect(200);
      const cookieC = extractRefreshCookie(
        secondLogin.headers["set-cookie"] as unknown as string[],
      );

      // cookieA normal şekilde rotate edilir → cookieB geçerli, cookieA revoke.
      const rotated = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookieA)
        .expect(200);
      const cookieB = extractRefreshCookie(
        rotated.headers["set-cookie"] as unknown as string[],
      );

      // Kullanılmış cookieA tekrar sunulur → replay.
      const replay = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookieA);

      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe("AUTH_REFRESH_REUSE_DETECTED");

      // Cascade: rotate ile yeni basılan cookieB de artık geçersiz — revoke
      // edilmiş bir satır olduğundan tekrar sunumu da replay olarak ele alınır.
      const afterB = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookieB);
      expect(afterB.status).toBe(401);
      expect(afterB.body.error.code).toBe("AUTH_REFRESH_REUSE_DETECTED");

      // Cascade: diğer cihazın oturumu (cookieC) da geçersiz.
      const afterC = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookieC);
      expect(afterC.status).toBe(401);
      expect(afterC.body.error.code).toBe("AUTH_REFRESH_REUSE_DETECTED");
    });
  });

  describe("POST /auth/logout", () => {
    it("geçerli refresh cookie → 204, cookie temizlenir, sonraki refresh reddedilir", async () => {
      await registerUser();
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "demo@vault.local", password: "password1" })
        .expect(200);
      const cookie = extractRefreshCookie(
        login.headers["set-cookie"] as unknown as string[],
      );

      const logout = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Cookie", cookie);

      expect(logout.status).toBe(204);
      expect(logout.body).toEqual({});
      const cleared = (
        logout.headers["set-cookie"] as unknown as string[]
      ).find((c) => c.startsWith("refresh_token="));
      expect(cleared).toMatch(/^refresh_token=;/);
      expect(cleared).toContain("Path=/api/v1/auth");

      // Logout, satırı revoke ettiğinden aynı cookie ile refresh artık geçmez —
      // revoke edilmiş bir satırın tekrar sunumu §1.4 replay dalına düşer.
      const afterLogout = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie);
      expect(afterLogout.status).toBe(401);
      expect(afterLogout.body.error.code).toBe("AUTH_REFRESH_REUSE_DETECTED");
    });

    it("cookie yok → yine 204 (sessiz no-op)", async () => {
      const response = await request(app.getHttpServer()).post(
        "/api/v1/auth/logout",
      );
      expect(response.status).toBe(204);
    });
  });

  // docs/08_TESTING_STRATEGY.md §4 madde 10 — zorunlu negatif senaryo (regresyon):
  // rate limit eşiği aşıldığında (özellikle login) istek 429 ile reddedilir.
  describe("Rate limiting (docs/03 §6)", () => {
    it("login: aynı IP+email ile 6. deneme → 429 RATE_LIMIT_EXCEEDED + Retry-After", async () => {
      await registerUser();
      const server = app.getHttpServer();
      const attempt = () =>
        request(server)
          .post("/api/v1/auth/login")
          .send({ email: "demo@vault.local", password: "wrong-pass-1" });

      // İlk 5 deneme limit içinde → kimlik hatası (401), rate limit değil.
      for (let i = 0; i < 5; i++) {
        const res = await attempt();
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
      }

      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(blocked.headers["retry-after"]).toBeDefined();
    });

    it("login: aynı IP farklı email → ayrı bucket, kilitlenmez", async () => {
      const server = app.getHttpServer();

      for (let i = 0; i < 6; i++) {
        const res = await request(server)
          .post("/api/v1/auth/login")
          .send({ email: `user${i}@vault.local`, password: "wrong-pass-1" });
        expect(res.status).toBe(401);
      }
    });

    it("register: aynı IP ile 4. istek → 429 RATE_LIMIT_EXCEEDED", async () => {
      const server = app.getHttpServer();

      for (let i = 0; i < 3; i++) {
        await request(server)
          .post("/api/v1/auth/register")
          .send({ email: `reg${i}@vault.local`, password: "password1" })
          .expect(201);
      }

      const blocked = await request(server)
        .post("/api/v1/auth/register")
        .send({ email: "reg-blocked@vault.local", password: "password1" });

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });
});
