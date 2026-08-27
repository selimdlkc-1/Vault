import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { User } from "@prisma/client";
import request from "supertest";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "../common/interceptors/response-envelope.interceptor";
import { AuthModule } from "./auth.module";
import { UsersRepository } from "./users.repository";

/**
 * `POST /auth/register` uçtan uca (controller → pipe → service → repository)
 * — `docs/03_API_CONTRACTS.md` §5.1. Repository, DB'ye ihtiyaç olmadan
 * deterministik çalışsın diye bellek-içi bir fake ile değiştirilir
 * (`.claude/rules/30-testing.md` — repository mock'lanır); geri kalan zincir
 * (global interceptor + filter dahil) gerçektir.
 */
class InMemoryUsersRepository {
  private readonly rows: User[] = [];

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.rows.find((row) => row.email === email) ?? null);
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

describe("AuthController (integration) — POST /api/v1/auth/register", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(UsersRepository)
      .useClass(InMemoryUsersRepository)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

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
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "demo@vault.local", password: "password1" })
      .expect(201);

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
      expect.arrayContaining([
        expect.objectContaining({ field: "password" }),
      ]),
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
