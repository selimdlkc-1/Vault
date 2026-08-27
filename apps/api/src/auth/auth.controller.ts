import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UsePipes,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { EnvConfig } from "../config/env.schema";
import { AuthService, type AuthUser, type PublicUser } from "./auth.service";
import { loginSchema, type LoginDto } from "./dto/login.dto";
import { registerSchema, type RegisterDto } from "./dto/register.dto";
import { durationToMs } from "./token.service";

/** Refresh token cookie adı (`docs/03_API_CONTRACTS.md` §4). */
const REFRESH_COOKIE_NAME = "refresh_token";
/** Cookie yalnızca `/auth/*` yollarına gönderilir (refresh + logout). */
const REFRESH_COOKIE_PATH = "/api/v1/auth";

/**
 * Auth endpoint'leri (`docs/03_API_CONTRACTS.md` §5.1). Base path `/api/v1`
 * `main.ts`'te global prefix ile eklenir → `POST /api/v1/auth/...`.
 *
 * Bu route'lar public'tir. `@Public()` dekoratörü ve global `JwtAuthGuard`
 * Faz 1 §1.5'te eklenir; o ana kadar hiçbir guard olmadığından tüm route'lar
 * zaten korumasızdır.
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Post("register")
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.authService.register(dto);
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: AuthUser }> {
    const { accessToken, rawRefreshToken, user } =
      await this.authService.login(dto);
    this.setRefreshCookie(res, rawRefreshToken);
    return { accessToken, user };
  }

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
