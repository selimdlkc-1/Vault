/**
 * Domain exception taban sınıfı (`docs/04_BACKEND_SPEC.md` §6).
 *
 * Servis katmanı yalnızca bu sınıftan türeyen hatalar fırlatır; hiçbir servis
 * doğrudan `throw new HttpException(...)` yazmaz. `AllExceptionsFilter` bu
 * hataları `docs/03_API_CONTRACTS.md` §2 response envelope'una çevirir.
 *
 * Her somut alt sınıf, error taxonomy'deki (`docs/03` §3) tam kodu ve sabit
 * HTTP status'ünü taşır — aynı kod asla iki farklı status döndürmez.
 */
export abstract class DomainException extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details: unknown;

  constructor(message: string, details: unknown = null) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

/** `409 EMAIL_ALREADY_EXISTS` — register sırasında e-posta zaten kayıtlı. */
export class EmailAlreadyExistsException extends DomainException {
  readonly code = "EMAIL_ALREADY_EXISTS";
  readonly httpStatus = 409;

  constructor() {
    super("Bu e-posta adresi zaten kayıtlı.");
  }
}

/** `401 AUTH_INVALID_CREDENTIALS` — login sırasında e-posta/şifre eşleşmedi. */
export class AuthInvalidCredentialsException extends DomainException {
  readonly code = "AUTH_INVALID_CREDENTIALS";
  readonly httpStatus = 401;

  constructor() {
    // Hangi alanın yanlış olduğu bilinçli olarak belirtilmez (kullanıcı
    // enumerasyonuna karşı — `docs/06_SCREEN_CATALOG.md` §4.1 S-AUTH-LOGIN).
    super("E-posta veya şifre hatalı.");
  }
}

/**
 * `401 AUTH_TOKEN_EXPIRED` — access token'ın süresi dolduğunda (istemci refresh
 * akışını tetiklemeli) veya `POST /auth/refresh` çağrısında sunulan refresh
 * token'ı bulunamadığında / doğal olarak süresi geçtiğinde.
 *
 * "Kullanılmış (revoke edilmiş) bir token'ın tekrar sunulması" (replay) bu genel
 * koddan ayrıdır — `AuthRefreshReuseDetectedException` (Faz 1 §1.4).
 */
export class AuthTokenExpiredException extends DomainException {
  readonly code = "AUTH_TOKEN_EXPIRED";
  readonly httpStatus = 401;

  constructor() {
    super("Oturum süreniz doldu. Lütfen tekrar giriş yapın.");
  }
}

/**
 * `401 AUTH_REFRESH_REUSE_DETECTED` — `POST /auth/refresh` çağrısında zaten
 * rotate edilmiş (revoke edilmiş) bir refresh token tekrar sunuldu. Bu bir
 * replay saldırısı olarak yorumlanır: hata fırlatılmadan önce o kullanıcıya ait
 * tüm aktif refresh token satırları geçersiz kılınır, kullanıcı tüm cihazlarda
 * yeniden login olmaya zorlanır (`docs/07_SECURITY_IMPLEMENTATION.md` §2,
 * `docs/03_API_CONTRACTS.md` §3/§5.1).
 */
export class AuthRefreshReuseDetectedException extends DomainException {
  readonly code = "AUTH_REFRESH_REUSE_DETECTED";
  readonly httpStatus = 401;

  constructor() {
    super("Oturum güvenliği nedeniyle tüm oturumlarınız sonlandırıldı. Lütfen tekrar giriş yapın.");
  }
}

/**
 * `401 AUTH_TOKEN_INVALID` — `Authorization: Bearer` header'ı yok, biçimsiz veya
 * içindeki JWT imzası/yapısı geçersiz (`docs/03_API_CONTRACTS.md` §3/§4). Doğal
 * süre dolumu bundan ayrıdır (`AUTH_TOKEN_EXPIRED`) — istemci ilkinde refresh
 * denemeli, bunda yeniden login olmalıdır.
 */
export class AuthTokenInvalidException extends DomainException {
  readonly code = "AUTH_TOKEN_INVALID";
  readonly httpStatus = 401;

  constructor() {
    super("Oturum bilginiz geçersiz. Lütfen tekrar giriş yapın.");
  }
}

/**
 * `403 FORBIDDEN_ROLE` — kimliği doğrulanmış bir kullanıcının rolü, endpoint'in
 * `@Roles()` ile istediği rolü karşılamıyor (`docs/03_API_CONTRACTS.md` §3,
 * `docs/04_BACKEND_SPEC.md` §4 adım 5).
 */
export class ForbiddenRoleException extends DomainException {
  readonly code = "FORBIDDEN_ROLE";
  readonly httpStatus = 403;

  constructor() {
    super("Bu işlem için yetkiniz yok.");
  }
}

export interface ValidationIssue {
  field: string;
  reason: string;
}

/** `400 VALIDATION_FAILED` — istek gövdesi/query şeması geçersiz. */
export class ValidationFailedException extends DomainException {
  readonly code = "VALIDATION_FAILED";
  readonly httpStatus = 400;

  constructor(issues: ValidationIssue[]) {
    super("Girdiğiniz bilgilerde hatalar var.", issues);
  }
}
