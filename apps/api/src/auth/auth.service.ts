import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import type { LoginInput, RegisterInput } from "@vault/types";
import {
  AuthInvalidCredentialsException,
  AuthTokenExpiredException,
  EmailAlreadyExistsException,
} from "../common/exceptions/domain.exception";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { UsersRepository } from "./users.repository";

/** API yanıtlarında dönen kullanıcı alt kümesi — `password_hash` asla dışa verilmez. */
export interface PublicUser {
  id: string;
  email: string;
  role: User["role"];
  createdAt: Date;
}

/** `POST /auth/login` yanıtındaki kullanıcı alanı (`docs/03_API_CONTRACTS.md` §5.1 — `createdAt` yok). */
export interface AuthUser {
  id: string;
  email: string;
  role: User["role"];
}

export interface AuthTokens {
  /** Yanıt gövdesinde döner. */
  accessToken: string;
  /** `Set-Cookie: refresh_token` olarak döner — controller'ın sorumluluğu. */
  rawRefreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthUser;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/**
 * Kimlik doğrulama iş mantığı (`docs/04_BACKEND_SPEC.md` §1 service katmanı).
 *
 * Faz 1 §1.2: `register` + `validateCredentials` çekirdeği.
 * Faz 1 §1.3: `login` (credential check + token issuance) ve `refresh` (rotation).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterInput): Promise<PublicUser> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new EmailAlreadyExistsException();
    }

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({ email: input.email, passwordHash });

    return toPublicUser(user);
  }

  /**
   * E-posta + şifreyi doğrular; başarısızsa `AUTH_INVALID_CREDENTIALS` fırlatır
   * (hangi adımda başarısız olduğu bilgisi dışarı sızmaz). Başarılıysa kullanıcıyı
   * döner — token üretimi çağıranın (login route, §1.3) sorumluluğundadır.
   */
  async validateCredentials(input: LoginInput): Promise<PublicUser> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      throw new AuthInvalidCredentialsException();
    }

    const passwordMatches = await this.passwords.verify(
      user.passwordHash,
      input.password,
    );
    if (!passwordMatches) {
      throw new AuthInvalidCredentialsException();
    }

    return toPublicUser(user);
  }

  /**
   * `POST /auth/login` — kimlik doğrular, access token + refresh token üretir.
   * Ham refresh token'ı controller `Set-Cookie` ile taşır (`docs/03` §4/§5.1).
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.validateCredentials(input);
    const accessToken = await this.tokens.issueAccessToken(user);
    const rawRefreshToken = await this.tokens.issueRefreshToken(user.id);

    return {
      accessToken,
      rawRefreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /**
   * `POST /auth/refresh` — cookie'deki ham refresh token'ı rotate eder, yeni bir
   * access token üretir. Cookie yoksa veya token doğal olarak süresi geçmişse
   * `AUTH_TOKEN_EXPIRED`; kullanılmış (revoke edilmiş) bir token tekrar sunulursa
   * `AUTH_REFRESH_REUSE_DETECTED` + kullanıcının tüm oturumları iptal edilir
   * (`docs/03` §5.1, Faz 1 §1.4).
   */
  async refresh(rawRefreshToken: string | undefined): Promise<AuthTokens> {
    if (!rawRefreshToken) {
      throw new AuthTokenExpiredException();
    }

    const rotated = await this.tokens.rotateRefreshToken(rawRefreshToken);

    const user = await this.users.findById(rotated.userId);
    if (!user) {
      // Token geçerliydi ama kullanıcı yok (ör. silinmiş) — güvenli tarafta kal.
      throw new AuthTokenExpiredException();
    }

    const accessToken = await this.tokens.issueAccessToken(toPublicUser(user));
    return { accessToken, rawRefreshToken: rotated.rawRefreshToken };
  }
}
