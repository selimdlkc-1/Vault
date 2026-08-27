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
 * token'ı bulunamadığında / süresi geçtiğinde.
 *
 * Faz 1 §1.4'te eklenecek "kullanılmış token replay" ayrımı bu genel koddan
 * ayrılır (`AUTH_REFRESH_REUSE_DETECTED`); bu iterasyonda revoke edilmiş bir
 * token da bu kodu alır.
 */
export class AuthTokenExpiredException extends DomainException {
  readonly code = "AUTH_TOKEN_EXPIRED";
  readonly httpStatus = 401;

  constructor() {
    super("Oturum süreniz doldu. Lütfen tekrar giriş yapın.");
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
