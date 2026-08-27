import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../types/authenticated-user";

/**
 * `@CurrentUser()` — `JwtAuthGuard`'ın `request.user`'a yazdığı kimliği controller
 * parametresine enjekte eder. `@CurrentUser('id')` gibi tek bir alanı da alabilir.
 *
 * `@Public()` route'larda `request.user` tanımsızdır; bu dekoratör yalnızca
 * korumalı endpoint'lerde kullanılır.
 */
export const CurrentUser = createParamDecorator(
  (
    field: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;
    return field ? user?.[field] : user;
  },
);
