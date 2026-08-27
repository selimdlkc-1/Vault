import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { EnvConfig } from "../config/env.schema";
import { AuthService, type AuthUser, type PublicUser } from "./auth.service";
import { loginSchema, type LoginDto } from "./dto/login.dto";
import { registerSchema, type RegisterDto } from "./dto/register.dto";
import { LoginThrottlerGuard } from "./login-throttler.guard";
import { durationToMs } from "./token.service";

/**
 * Rate limit eşikleri (`docs/03_API_CONTRACTS.md` §6). `@nestjs/throttler` ttl'i
 * milisaniye alır. Aşımda `ThrottlerException` → `AllExceptionsFilter` →
 * `429 RATE_LIMIT_EXCEEDED` + `Retry-After`.
 */
const LOGIN_RATE_LIMIT = { limit: 5, ttl: 15 * 60_000 } as const;
const REGISTER_RATE_LIMIT = { limit: 3, ttl: 60 * 60_000 } as const;

/** Refresh token cookie adı (`docs/03_API_CONTRACTS.md` §4). */
const REFRESH_COOKIE_NAME = "refresh_token";
/** Cookie yalnızca `/auth/*` yollarına gönderilir (refresh + logout). */
const REFRESH_COOKIE_PATH = "/api/v1/auth";

/**
 * Auth endpoint'leri (`docs/03_API_CONTRACTS.md` §5.1). Base path `/api/v1`
 * `main.ts`'te global prefix ile eklenir → `POST /api/v1/auth/...`.
 *
 * `register`/`login`/`refresh` `@Public()` taşır (global `JwtAuthGuard`/`RolesGuard`
 * zincirinden muaf — `docs/04_BACKEND_SPEC.md` §4). `logout` korumalıdır: geçerli
 * bir access token gerektirir.
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @Post("register")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: REGISTER_RATE_LIMIT })
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.authService.register(dto);
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ default: LOGIN_RATE_LIMIT })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: AuthUser }> {
    const { accessToken, rawRefreshToken, user } =
      await this.authService.login(dto);
    this.setRefreshCookie(res, rawRefreshToken);
    return { accessToken, user };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const { accessToken, rawRefreshToken } = await this.authService.refresh(
      cookies?.[REFRESH_COOKIE_NAME],
    );
    this.setRefreshCookie(res, rawRefreshToken);
    return { accessToken };
  }

  /**
   * `POST /auth/logout` — global guard zinciri geçerlidir (`@Public()` YOK), yani
   * geçerli bir access token zorunludur. Mevcut refresh token'ı geçersiz kılar,
   * cookie'yi temizler, `204` döner (`docs/03_API_CONTRACTS.md` §5.1).
   */
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookies = req.cookies as Record<string, string> | undefined;
    await this.authService.logout(cookies?.[REFRESH_COOKIE_NAME]);
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: this.config.get("COOKIE_SECURE", { infer: true }),
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
    });
  }

  /**
   * `httpOnly` + `SameSite=Strict` refresh cookie. `secure` varsayılanı `true`;
   * yalnızca yerel dev'de `COOKIE_SECURE=false` ile kapatılır
   * (`mimari-kararlar.md` SEC-007). `maxAge` env `JWT_REFRESH_TTL` ile hizalı.
   */
  private setRefreshCookie(res: Response, rawRefreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, rawRefreshToken, {
      httpOnly: true,
      secure: this.config.get("COOKIE_SECURE", { infer: true }),
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: durationToMs(this.config.get("JWT_REFRESH_TTL", { infer: true })),
    });
  }
}
