import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import {
  AuthTokenExpiredException,
  AuthTokenInvalidException,
} from "../exceptions/domain.exception";
import { JwtAuthGuard } from "./jwt-auth.guard";

const SECRET = "x".repeat(32);

function buildContext(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  request: Request;
} {
  const request = { headers } as unknown as Request;
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class Anon {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe("JwtAuthGuard", () => {
  let jwt: JwtService;
  let reflector: jest.Mocked<Pick<Reflector, "getAllAndOverride">>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = new JwtService({ secret: SECRET });
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    guard = new JwtAuthGuard(reflector as unknown as Reflector, jwt);
  });

  it("@Public() route → token olmadan geçer, request.user set edilmez", async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context, request } = buildContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it("geçerli token → true ve request.user = { id, role }", async () => {
    const token = await jwt.signAsync({ sub: "user-1", role: "admin" });
    const { context, request } = buildContext({
      authorization: `Bearer ${token}`,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: "user-1", role: "admin" });
  });

  it("Authorization header yok → AUTH_TOKEN_INVALID", async () => {
    const { context } = buildContext({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      AuthTokenInvalidException,
    );
  });

  it("Bearer şeması eksik → AUTH_TOKEN_INVALID", async () => {
    const token = await jwt.signAsync({ sub: "u", role: "user" });
    const { context } = buildContext({ authorization: token });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      AuthTokenInvalidException,
    );
  });

  it("imza başka bir secret ile atılmış → AUTH_TOKEN_INVALID", async () => {
    const foreign = new JwtService({ secret: "y".repeat(32) });
    const token = await foreign.signAsync({ sub: "u", role: "user" });
    const { context } = buildContext({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      AuthTokenInvalidException,
    );
  });

  it("süresi dolmuş token → AUTH_TOKEN_EXPIRED (istemci refresh tetikler)", async () => {
    const token = await jwt.signAsync(
      { sub: "u", role: "user" },
      { expiresIn: -10 },
    );
    const { context } = buildContext({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      AuthTokenExpiredException,
    );
  });
});
