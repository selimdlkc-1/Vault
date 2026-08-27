import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import {
  AuthTokenExpiredException,
  AuthTokenInvalidException,
} from "../exceptions/domain.exception";
import type { AuthenticatedUser } from "../types/authenticated-user";

/** Access token JWT payload (`docs/07_SECURITY_IMPLEMENTATION.md` §3). */
interface AccessTokenClaims {
  sub: string;
  role: AuthenticatedUser["role"];
}

/**
 * Global kimlik doğrulama guard'ı (`docs/04_BACKEND_SPEC.md` §4 adım 4). `@Public()`
 * taşımayan her route için `Authorization: Bearer` header'ındaki JWT'yi doğrular
 * ve `request.user`'ı doldurur.
 *
 * - Header yok/biçimsiz veya imza/yapı geçersiz → `401 AUTH_TOKEN_INVALID`.
 * - Token'ın süresi dolmuş → `401 AUTH_TOKEN_EXPIRED` (istemci refresh tetikler).
 *
 * `APP_GUARD` ile `RolesGuard`'tan **önce** kayıtlıdır; sıra bozulursa rol
 * kontrolü `request.user` set edilmeden çalışır.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new AuthTokenInvalidException();
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
    } catch (error) {
      if (error instanceof Error && error.name === "TokenExpiredError") {
        throw new AuthTokenExpiredException();
      }
      throw new AuthTokenInvalidException();
    }

    request.user = { id: claims.sub, role: claims.role };
    return true;
  }
}

/** `"Bearer <jwt>"` → `<jwt>`; şema eksik/yanlışsa `null`. */
function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, value, ...rest] = header.split(" ");
  if (scheme !== "Bearer" || !value || rest.length > 0) {
    return null;
  }
  return value;
}
