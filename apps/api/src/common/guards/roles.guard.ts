import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@prisma/client";
import type { Request } from "express";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { ForbiddenRoleException } from "../exceptions/domain.exception";

/**
 * Global rol guard'ı (`docs/04_BACKEND_SPEC.md` §4 adım 5, `mimari-kararlar.md`
 * AUTH-001/002). `@Roles()` metadata'sı taşımayan bir route rol-agnostiktir
 * (yalnızca kimlik doğrulaması gerekir). Metadata varsa `JwtAuthGuard`'ın
 * doldurduğu `request.user.role` ile karşılaştırılır; uyuşmazlıkta
 * `403 FORBIDDEN_ROLE`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenRoleException();
    }
    return true;
  }
}
