import { Body, Controller, Post, UsePipes } from "@nestjs/common";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthService, type PublicUser } from "./auth.service";
import { registerSchema, type RegisterDto } from "./dto/register.dto";

/**
 * Auth endpoint'leri (`docs/03_API_CONTRACTS.md` §5.1). Base path `/api/v1`
 * `main.ts`'te global prefix ile eklenir → `POST /api/v1/auth/register`.
 *
 * Bu route'lar public'tir. `@Public()` dekoratörü ve global `JwtAuthGuard`
 * Faz 1 §1.5'te eklenir; o ana kadar hiçbir guard olmadığından tüm route'lar
 * zaten korumasızdır.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.authService.register(dto);
  }
}
