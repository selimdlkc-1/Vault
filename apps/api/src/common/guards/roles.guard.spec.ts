import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ForbiddenRoleException } from "../exceptions/domain.exception";
import type { AuthenticatedUser } from "../types/authenticated-user";
import { RolesGuard } from "./roles.guard";

function buildContext(user: AuthenticatedUser | undefined): ExecutionContext {
  const request = { user } as unknown as Request;
  return {
    getHandler: () => () => undefined,
    getClass: () => class Anon {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  let reflector: jest.Mocked<Pick<Reflector, "getAllAndOverride">>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it("@Roles metadata yok → rol-agnostik endpoint, geçer", () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(buildContext({ id: "u", role: "user" }))).toBe(true);
  });

  it("boş rol listesi → geçer", () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(buildContext({ id: "u", role: "user" }))).toBe(true);
  });

  it("gerekli rol kullanıcının rolüyle eşleşiyor → geçer", () => {
    reflector.getAllAndOverride.mockReturnValue(["admin"]);
    expect(guard.canActivate(buildContext({ id: "u", role: "admin" }))).toBe(
      true,
    );
  });

  it("rol uyuşmuyor (user, admin gerekiyor) → FORBIDDEN_ROLE", () => {
    reflector.getAllAndOverride.mockReturnValue(["admin"]);
    expect(() =>
      guard.canActivate(buildContext({ id: "u", role: "user" })),
    ).toThrow(ForbiddenRoleException);
  });

  it("request.user yok ama @Roles tanımlı → FORBIDDEN_ROLE", () => {
    reflector.getAllAndOverride.mockReturnValue(["admin"]);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenRoleException,
    );
  });
});
