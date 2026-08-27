import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import type { LoginInput, RegisterInput } from "@vault/types";
import {
  AuthInvalidCredentialsException,
  EmailAlreadyExistsException,
} from "../common/exceptions/domain.exception";
import { PasswordService } from "./password.service";
import { UsersRepository } from "./users.repository";

/** API yanıtlarında dönen kullanıcı alt kümesi — `password_hash` asla dışa verilmez. */
export interface PublicUser {
  id: string;
  email: string;
  role: User["role"];
  createdAt: Date;
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
 * Bu iterasyon (Faz 1 §1.2): `register` uçtan uca + `validateCredentials`
 * çekirdeği. `POST /auth/login` HTTP route'u ve token üretimi §1.3'te eklenir —
 * `login()` metodu o iterasyonda `validateCredentials` + `TokenService`'i birleştirir.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
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
}
