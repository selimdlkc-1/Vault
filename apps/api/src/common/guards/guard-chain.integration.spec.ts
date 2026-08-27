import { Controller, Get, type INestApplication, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthModule } from "../../auth/auth.module";
import { testConfigModule } from "../../config/testing-config.module";
import { RefreshTokensRepository } from "../../auth/refresh-tokens.repository";
import { UsersRepository } from "../../auth/users.repository";
import { CurrentUser } from "../decorators/current-user.decorator";
import { Public } from "../decorators/public.decorator";
import { Roles } from "../decorators/roles.decorator";
import { AllExceptionsFilter } from "../filters/all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "../interceptors/response-envelope.interceptor";
import type { AuthenticatedUser } from "../types/authenticated-user";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";

/**
 * `APP_GUARD` ile global kaydedilen `JwtAuthGuard` + `RolesGuard` zincirinin
 * `AppModule`'deki gerçek wiring'ini doğrular (`docs/04_BACKEND_SPEC.md` §4 adım
 * 4-5). `AppModule` yerine aynı guard kaydını tekrarlayan bir prova modülü
 * kullanılır (gerçek `AppModule` `PrismaModule` üzerinden canlı DB'ye bağlanır).
 */
@Controller("probe")
class ProbeController {
  @Get("open")
  @Public()
  open(): { ok: true } {
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get("admin")
  @Roles("admin")
  adminOnly(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [testConfigModule(), AuthModule],
  controllers: [ProbeController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
class ProbeModule {}

describe("Global guard zinciri (JwtAuthGuard → RolesGuard)", () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] })
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

  it("@Public() route → token olmadan erişilir", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/probe/open")
      .expect(200)
      .expect((res) => expect(res.body.data).toEqual({ ok: true }));
  });

  it("korumalı route → token yoksa 401 AUTH_TOKEN_INVALID", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/probe/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("korumalı route → geçerli token ile @CurrentUser dolu döner", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/probe/me")
      .set("Authorization", `Bearer ${tokenFor("user")}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: "user-user", role: "user" });
  });

  it("@Roles('admin') route → user rolü ile 403 FORBIDDEN_ROLE (RolesGuard auth'tan sonra çalışır)", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/probe/admin")
      .set("Authorization", `Bearer ${tokenFor("user")}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ROLE");
  });

  it("@Roles('admin') route → admin rolü ile geçer", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/probe/admin")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .expect(200);
  });
});
