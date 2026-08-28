import type { User } from "@prisma/client";
import type { AuditService } from "../audit/audit.service";
import {
  AuthInvalidCredentialsException,
  AuthTokenExpiredException,
  EmailAlreadyExistsException,
} from "../common/exceptions/domain.exception";
import type { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import type { PasswordService } from "./password.service";
import type { TokenService } from "./token.service";
import type { UsersRepository } from "./users.repository";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "user@vault.local",
    passwordHash: "$argon2id$hash",
    role: "user",
    createdAt: new Date("2026-08-27T10:00:00.000Z"),
    ...overrides,
  };
}

describe("AuthService", () => {
  let users: jest.Mocked<
    Pick<UsersRepository, "findByEmail" | "findById" | "create">
  >;
  let passwords: jest.Mocked<Pick<PasswordService, "hash" | "verify">>;
  let tokens: jest.Mocked<
    Pick<
      TokenService,
      | "issueAccessToken"
      | "issueRefreshToken"
      | "rotateRefreshToken"
      | "revokeRefreshToken"
    >
  >;
  let audit: jest.Mocked<Pick<AuditService, "record">>;
  const prisma = { $transaction: jest.fn() } as unknown as PrismaService;
  let service: AuthService;

  beforeEach(() => {
    users = { findByEmail: jest.fn(), findById: jest.fn(), create: jest.fn() };
    passwords = { hash: jest.fn(), verify: jest.fn() };
    tokens = {
      issueAccessToken: jest.fn(),
      issueRefreshToken: jest.fn(),
      rotateRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      users as unknown as UsersRepository,
      passwords as unknown as PasswordService,
      tokens as unknown as TokenService,
      audit as unknown as AuditService,
      prisma,
    );
  });

  describe("register", () => {
    it("yeni e-posta için kullanıcıyı hash'leyip oluşturur, PublicUser döner", async () => {
      users.findByEmail.mockResolvedValue(null);
      passwords.hash.mockResolvedValue("$argon2id$new");
      users.create.mockResolvedValue(buildUser({ passwordHash: "$argon2id$new" }));

      const result = await service.register({
        email: "user@vault.local",
        password: "password1",
      });

      expect(passwords.hash).toHaveBeenCalledWith("password1");
      expect(users.create).toHaveBeenCalledWith({
        email: "user@vault.local",
        passwordHash: "$argon2id$new",
      });
      expect(result).toEqual({
        id: "11111111-1111-1111-1111-111111111111",
        email: "user@vault.local",
        role: "user",
        createdAt: new Date("2026-08-27T10:00:00.000Z"),
      });
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("e-posta zaten kayıtlıysa EmailAlreadyExistsException fırlatır", async () => {
      users.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.register({ email: "user@vault.local", password: "password1" }),
      ).rejects.toBeInstanceOf(EmailAlreadyExistsException);
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe("validateCredentials", () => {
    it("e-posta + şifre doğruysa PublicUser döner", async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      passwords.verify.mockResolvedValue(true);

      const result = await service.validateCredentials({
        email: "user@vault.local",
        password: "password1",
      });

      expect(passwords.verify).toHaveBeenCalledWith("$argon2id$hash", "password1");
      expect(result.id).toBe("11111111-1111-1111-1111-111111111111");
    });

    it("kullanıcı bulunamazsa AuthInvalidCredentialsException fırlatır", async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateCredentials({ email: "yok@vault.local", password: "x" }),
      ).rejects.toBeInstanceOf(AuthInvalidCredentialsException);
      expect(passwords.verify).not.toHaveBeenCalled();
    });

    it("şifre yanlışsa AuthInvalidCredentialsException fırlatır", async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      passwords.verify.mockResolvedValue(false);

      await expect(
        service.validateCredentials({
          email: "user@vault.local",
          password: "wrong",
        }),
      ).rejects.toBeInstanceOf(AuthInvalidCredentialsException);
    });
  });

  describe("login", () => {
    it("kimlik doğruysa access + refresh token üretir, user (createdAt'sız) döner", async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      passwords.verify.mockResolvedValue(true);
      tokens.issueAccessToken.mockResolvedValue("access.jwt");
      tokens.issueRefreshToken.mockResolvedValue("raw-refresh");

      const result = await service.login({
        email: "user@vault.local",
        password: "password1",
      });

      expect(tokens.issueAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: "11111111-1111-1111-1111-111111111111" }),
      );
      expect(tokens.issueRefreshToken).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111",
      );
      expect(result).toEqual({
        accessToken: "access.jwt",
        rawRefreshToken: "raw-refresh",
        user: {
          id: "11111111-1111-1111-1111-111111111111",
          email: "user@vault.local",
          role: "user",
        },
      });
    });

    it("başarılı girişte LOGIN audit kaydı yazar (actorId = user.id)", async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      passwords.verify.mockResolvedValue(true);
      tokens.issueAccessToken.mockResolvedValue("access.jwt");
      tokens.issueRefreshToken.mockResolvedValue("raw-refresh");

      await service.login({ email: "user@vault.local", password: "password1" });

      expect(audit.record).toHaveBeenCalledWith(prisma, {
        actorType: "user",
        actorId: "11111111-1111-1111-1111-111111111111",
        action: "LOGIN",
        entityType: "user",
        entityId: "11111111-1111-1111-1111-111111111111",
        metadata: null,
      });
    });

    it("kimlik yanlışsa token üretmeden AuthInvalidCredentialsException fırlatır + LOGIN_FAILED audit (actorId null, email metadata'da)", async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      passwords.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: "user@vault.local", password: "wrong" }),
      ).rejects.toBeInstanceOf(AuthInvalidCredentialsException);
      expect(tokens.issueAccessToken).not.toHaveBeenCalled();
      expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(prisma, {
        actorType: "user",
        actorId: null,
        action: "LOGIN_FAILED",
        entityType: "user",
        entityId: null,
        metadata: { email: "user@vault.local" },
      });
    });
  });

  describe("refresh", () => {
    it("cookie yoksa AuthTokenExpiredException fırlatır", async () => {
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(
        AuthTokenExpiredException,
      );
      expect(tokens.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it("token geçerliyse rotate eder ve yeni access token + rotate edilmiş refresh döner", async () => {
      tokens.rotateRefreshToken.mockResolvedValue({
        userId: "11111111-1111-1111-1111-111111111111",
        rawRefreshToken: "raw-refresh-2",
      });
      users.findById.mockResolvedValue(buildUser());
      tokens.issueAccessToken.mockResolvedValue("access.jwt.2");

      const result = await service.refresh("raw-refresh-1");

      expect(tokens.rotateRefreshToken).toHaveBeenCalledWith("raw-refresh-1");
      expect(result).toEqual({
        accessToken: "access.jwt.2",
        rawRefreshToken: "raw-refresh-2",
      });
    });

    it("token geçerli ama kullanıcı yoksa AuthTokenExpiredException fırlatır", async () => {
      tokens.rotateRefreshToken.mockResolvedValue({
        userId: "dead-user",
        rawRefreshToken: "raw-refresh-2",
      });
      users.findById.mockResolvedValue(null);

      await expect(service.refresh("raw-refresh-1")).rejects.toBeInstanceOf(
        AuthTokenExpiredException,
      );
      expect(tokens.issueAccessToken).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("mevcut refresh token'ı geçersiz kılmak için TokenService'e devreder", async () => {
      await service.logout("raw-refresh");
      expect(tokens.revokeRefreshToken).toHaveBeenCalledWith("raw-refresh");
    });

    it("token yoksa yine de hatasız tamamlanır (no-op)", async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(tokens.revokeRefreshToken).toHaveBeenCalledWith(undefined);
    });
  });
});
