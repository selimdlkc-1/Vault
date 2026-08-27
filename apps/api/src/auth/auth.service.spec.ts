import type { User } from "@prisma/client";
import {
  AuthInvalidCredentialsException,
  EmailAlreadyExistsException,
} from "../common/exceptions/domain.exception";
import { AuthService } from "./auth.service";
import type { PasswordService } from "./password.service";
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
  let users: jest.Mocked<Pick<UsersRepository, "findByEmail" | "create">>;
  let passwords: jest.Mocked<Pick<PasswordService, "hash" | "verify">>;
  let service: AuthService;

  beforeEach(() => {
    users = { findByEmail: jest.fn(), create: jest.fn() };
    passwords = { hash: jest.fn(), verify: jest.fn() };
    service = new AuthService(
      users as unknown as UsersRepository,
      passwords as unknown as PasswordService,
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
});
