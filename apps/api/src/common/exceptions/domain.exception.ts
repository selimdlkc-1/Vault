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
 * `401 AUTH_STEP_UP_REQUIRED` — transfer onayında (`POST /transfers/:id/confirm`)
 * sunulan `currentPassword` yanlış veya eksik; `draft → pending_signature` geçişi
 * step-up authentication (şifre tekrarı) olmadan gerçekleşemez
 * (`docs/03_API_CONTRACTS.md` §3/§5.4, `docs/07_SECURITY_IMPLEMENTATION.md` §4
 * diyagramı, `docs/mimari-kararlar.md` SEC-008,
 * `.claude/rules/03-security-baseline.md` madde 3). Bu kontrol diğer tüm
 * guard'lardan (cross-network, bakiye) **önce** çalışır — yanlış şifreyle gelen
 * bir istek başka hiçbir kontrolü tetiklemeden reddedilir (bilgi sızıntısı
 * önlemi).
 */
export class AuthStepUpRequiredException extends DomainException {
  readonly code = "AUTH_STEP_UP_REQUIRED";
  readonly httpStatus = 401;

  constructor() {
    super("Şifreniz doğrulanamadı. Transferi onaylamak için şifrenizi tekrar girin.");
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

/**
 * `403 FORBIDDEN_NOT_OWNER` — kaynak (cüzdan/transfer) isteği yapan kullanıcıya
 * ait değil (`docs/03_API_CONTRACTS.md` §3, `docs/04_BACKEND_SPEC.md` §4 adım 6).
 * `Admin` bu kontrolden muaftır (salt-okunur erişim); kontrol servis katmanında
 * yapılır. `docs/08_TESTING_STRATEGY.md` §4 senaryo #5.
 */
export class ForbiddenNotOwnerException extends DomainException {
  readonly code = "FORBIDDEN_NOT_OWNER";
  readonly httpStatus = 403;

  constructor() {
    super("Bu kayıt size ait değil.");
  }
}

/**
 * `404 RESOURCE_NOT_FOUND` — belirtilen id ile eşleşen kayıt yok
 * (`docs/03_API_CONTRACTS.md` §3). Biçimsiz bir path id'si de (ör. UUID
 * olmayan `:networkId`) bu koda indirgenir — istemci açısından "yok" ile
 * "geçersiz id" arasında bir ayrım gerekmez.
 */
export class ResourceNotFoundException extends DomainException {
  readonly code = "RESOURCE_NOT_FOUND";
  readonly httpStatus = 404;

  constructor(message = "İstenen kayıt bulunamadı.") {
    super(message);
  }
}

/**
 * `422 WALLET_ADDRESS_INVALID_FORMAT` — girilen adres, ağın beklediği formatta
 * değil (EVM EIP-55 checksum / Tron base58check hatası). `docs/03_API_CONTRACTS.md`
 * §3/§5.2, `docs/08_TESTING_STRATEGY.md` §4 senaryo #12.
 */
export class WalletAddressInvalidFormatException extends DomainException {
  readonly code = "WALLET_ADDRESS_INVALID_FORMAT";
  readonly httpStatus = 422;

  constructor() {
    super("Girilen adres, seçilen ağın formatına uymuyor.");
  }
}

/**
 * `409 NETWORK_ASSET_INACTIVE` — hedef `(network, asset)` çiftlerinden hiçbiri
 * aktif değil; cüzdan/transfer oluşturulamaz. `docs/01_DOMAIN_MODEL.md` §4 madde
 * 1, `docs/03_API_CONTRACTS.md` §3/§5.2, `docs/08_TESTING_STRATEGY.md` §4 senaryo #2.
 */
export class NetworkAssetInactiveException extends DomainException {
  readonly code = "NETWORK_ASSET_INACTIVE";
  readonly httpStatus = 409;

  constructor() {
    super("Bu ağ için aktif bir varlık bulunmuyor; cüzdan eklenemez.");
  }
}

/**
 * `409 WALLET_ADDRESS_ALREADY_EXISTS` — aynı `(network, address)` çiftiyle bir
 * cüzdan zaten kayıtlı (`docs/03_API_CONTRACTS.md` §3/§5.2). Servis ön kontrolde
 * bu hatayı fırlatır; yarış durumunda Prisma `P2002` de `AllExceptionsFilter`'da
 * bu koda eşlenir (`docs/04_BACKEND_SPEC.md` §6).
 */
export class WalletAddressAlreadyExistsException extends DomainException {
  readonly code = "WALLET_ADDRESS_ALREADY_EXISTS";
  readonly httpStatus = 409;

  constructor() {
    super("Bu adres bu ağda zaten bir cüzdan olarak kayıtlı.");
  }
}

/**
 * `409 WALLET_CROSS_NETWORK_MISMATCH` — gönderen cüzdanın ağı ile hedef adresin
 * beklenen ağı uyuşmuyor; transfer `draft` durumundan ileri geçemez
 * (`docs/01_DOMAIN_MODEL.md` §4 madde 3, `docs/03_API_CONTRACTS.md` §3/§5.4,
 * `docs/mimari-kararlar.md` AUTH-004, `.claude/rules/13-critical-modules.md`).
 * Cross-network guard yalnızca backend'de zorlanır; frontend kontrolü tek başına
 * yeterli sayılmaz. `POST /transfers` girişinde ve `POST /transfers/:id/confirm`'de
 * (network_asset arada pasifleşmiş/adres formatı bozulmuş olabilir) tekrar
 * kontrol edilir. `docs/08_TESTING_STRATEGY.md` §4 senaryo #1.
 */
export class WalletCrossNetworkMismatchException extends DomainException {
  readonly code = "WALLET_CROSS_NETWORK_MISMATCH";
  readonly httpStatus = 409;

  constructor() {
    super("Hedef adres, gönderen cüzdanın ağıyla uyuşmuyor.");
  }
}

/**
 * `409 WALLET_INSUFFICIENT_BALANCE` — cüzdanın DB önbelleğindeki bakiyesi transfer
 * tutarını karşılamıyor (`docs/03_API_CONTRACTS.md` §3/§5.4,
 * `docs/01_DOMAIN_MODEL.md` §5.2 `draft → pending_signature`,
 * `docs/08_TESTING_STRATEGY.md` §4 senaryo). `POST /transfers/:id/confirm`
 * senkron adımında yalnızca `balance_caches`'ten okunur (canlı RPC yok,
 * `docs/mimari-kararlar.md` I-003); worker yeniden kontrolü İterasyon 3'tedir.
 */
export class WalletInsufficientBalanceException extends DomainException {
  readonly code = "WALLET_INSUFFICIENT_BALANCE";
  readonly httpStatus = 409;

  constructor() {
    super("Cüzdan bakiyesi bu transfer için yeterli değil.");
  }
}

/**
 * `409 TRANSFER_INVALID_TRANSITION` — istenen durum geçişi, transferin mevcut
 * durumundan izin verilen bir geçiş değil (`docs/03_API_CONTRACTS.md` §3/§5.4,
 * `docs/01_DOMAIN_MODEL.md` §5.2, `docs/mimari-kararlar.md` W-003,
 * `.claude/rules/13-critical-modules.md`). Terminal durumdaki
 * (`confirmed`/`failed`/`dropped`) bir transfer üzerinde işlem denemesi de
 * (whitelist'te o durumlardan hiçbir hedef olmadığından) bu koda düşer —
 * `TRANSFER_ALREADY_TERMINAL` semantiği bu kod yoluyla kapsanır. `TransferStateMachine`
 * whitelist guard'ı `InvalidTransitionError` fırlatır; servis/state machine bunu
 * bu domain exception'a çevirir.
 */
export class TransferInvalidTransitionException extends DomainException {
  readonly code = "TRANSFER_INVALID_TRANSITION";
  readonly httpStatus = 409;

  constructor() {
    super("Bu transfer bu adımda onaylanamaz.");
  }
}

/**
 * `409 WALLET_NOT_MANAGED` — watch-only bir cüzdandan transfer başlatılmaya
 * çalışıldı (`docs/03_API_CONTRACTS.md` §3/§5.4, `docs/01_DOMAIN_MODEL.md` §4
 * madde 5, `docs/08_TESTING_STRATEGY.md` §4 senaryo). Watch-only cüzdanın private
 * key'i sistemde olmadığından hiçbir `Transfer` kaydında gönderen taraf olamaz.
 */
export class WalletNotManagedException extends DomainException {
  readonly code = "WALLET_NOT_MANAGED";
  readonly httpStatus = 409;

  constructor() {
    super("Bu cüzdandan transfer başlatılamaz; yalnızca yönetilen cüzdanlar transfer yapabilir.");
  }
}

/**
 * `401` — `POST /webhooks/alchemy` çağrısında `X-Alchemy-Signature` HMAC
 * doğrulaması başarısız (`docs/03_API_CONTRACTS.md` §8). İmza doğrulanmadan
 * hiçbir DB yazımı yapılmaz (`.claude/rules/03-security-baseline.md` — state
 * değiştiren her yol korunmalı). Error taxonomy §3 webhook'ları ayrı tuttuğundan
 * bu kod orada listelenmez; status §8'de tanımlıdır.
 */
export class WebhookSignatureInvalidException extends DomainException {
  readonly code = "WEBHOOK_SIGNATURE_INVALID";
  readonly httpStatus = 401;

  constructor() {
    super("Webhook imzası doğrulanamadı.");
  }
}

/**
 * `502 CHAIN_PROVIDER_UNAVAILABLE` — bir RPC / Alchemy / TronGrid çağrısı geçici
 * bir sağlayıcı hatasıyla başarısız oldu (`docs/03_API_CONTRACTS.md` §3/§5.8).
 * `packages/chain-providers`'ın framework-agnostic `ChainProviderUnavailableException`'ı
 * servis katmanında bu domain exception'a çevrilir; ham RPC hatası yalnızca
 * structured log'a yazılır, `message`'a yansımaz (`docs/03` §3 mesaj politikası).
 *
 * Faz 4 §4.4b: mock kontrat `mint()`'inin `onlyOwner` revert'i de (en yakın
 * mevcut hata kodu olduğu için) bu koda eşlenir — yeni bir kod icat edilmez.
 */
export class ChainProviderUnavailableException extends DomainException {
  readonly code = "CHAIN_PROVIDER_UNAVAILABLE";
  readonly httpStatus = 502;

  constructor() {
    super("Zincir sağlayıcıya şu anda ulaşılamıyor, lütfen tekrar deneyin.");
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
