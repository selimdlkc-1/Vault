---
name: phase-01-auth-roles
description: '[Faz 1] Kimlik Doğrulama ve Roller — 7 iterasyon/chat (argon2id şifre hash'leme → register/login + ortak backend altyapısı → JWT access token/refresh cookie → refresh replay tespiti → auth/role guard + logout → login rate limiting → frontend auth akışı). Use when the user says "Faz 1", "Faz 1 — İterasyon N", veya auth/login/register/JWT/refresh/rol guard eklemekten bahseder. Do NOT use for network/asset master data veya admin paneli (Faz 2), cüzdan/portföy (Faz 3+).'
---

# Faz 1: Kimlik Doğrulama ve Roller

## Goal

Bir kullanıcı email+şifre ile kayıt olup giriş yapabiliyor; access token (15dk JWT) yalnızca bellekte tutuluyor, süresi dolduğunda `httpOnly`/`SameSite=Strict` refresh cookie ile otomatik yenileniyor; kullanılmış bir refresh token'ın tekrar sunulması (replay) kullanıcının tüm oturumlarını geçersiz kılıyor; login IP+email bazlı rate limit'e tabi; `JwtAuthGuard`/`RolesGuard` her korumalı endpoint'te zorunlu (`docs/10_IMPLEMENTATION_ROADMAP.md` Faz 1 İnsan onay noktası).

## Ön koşul: Bu skill üretilirken kapatılan docs/ boşlukları

Bu skill yazılırken `docs/`'ta Faz 1'i doğrudan engelleyen üç boşluk bulundu ve **önce docs/ güncellendi** (CLAUDE.md doküman yaşam döngüsü kuralı gereği kod/skill kuralı, karşılığı olmayan bir davranış içeremez):

1. **`refresh_tokens` tablosu yoktu** — `docs/07_SECURITY_IMPLEMENTATION.md`/SEC-007 refresh token'ın DB'de tutulup anında iptal edilebildiğini varsayıyordu ama `docs/02_DATABASE_SCHEMA.md`'nin 12 tablosunda böyle bir tablo yoktu. Eklenen: `mimari-kararlar.md` **SEC-013** + `docs/02_DATABASE_SCHEMA.md` §2.13 `refresh_tokens` (id, userId, tokenHash — `JWT_REFRESH_SECRET` ile HMAC-SHA256, expiresAt, createdAt, revokedAt nullable/tombstone) + ERD/index/ilişki güncellemeleri.
2. **`secure` refresh cookie, projenin tek ortamı olan düz HTTP localhost'ta çalışmazdı** — tarayıcılar `secure` cookie'yi HTTP üzerinden geri göndermez. Eklenen: `COOKIE_SECURE` env değişkeni (`docs/09_DEV_WORKFLOW.md` §7, `mimari-kararlar.md` SEC-007 addendum, `.claude/rules/03-security-baseline.md`) — varsayılan/güvenli davranış `true`, yalnızca yerel `.env`'de açıkça `false` yapılabilir.
3. **`audit_logs` tablosu Faz 2 §2.3'te ilk kez oluşuyor** ama `docs/03_API_CONTRACTS.md` §5.1 login/rate-limit için Faz 1'de audit yazımı tanımlıyordu. Eklenen: §5.1 ve §6'ya sıralama notu — Faz 1'de bu endpoint'ler audit yazmadan çalışır, entegrasyon Faz 2'de tabloyla birlikte gelir.

Bu üç madde aşağıdaki iterasyonlarda (3, 6) referans verilir; tekrar tartışılmaz.

## Bu fazın çalışma modeli

- Tek sohbet fazı bitirmez; her chat başında **「Faz 1 — İterasyon M」** belirt.
- Agent yalnızca o iterasyonun **Docs okuma sırasını** okur, tüm spec'i değil.
- Backend modülü tek klasördür: `apps/api/src/auth/` (`docs/04_BACKEND_SPEC.md` §2) — register, login, refresh, replay, guard, logout, rate limit hepsi bu modülün içinde katmanlanır; ayrı bir `users/` veya `tokens/` modülü açılmaz.
- İterasyon 2, sonraki tüm modüllerin (Faz 2+) tekrar kullanacağı ortak backend altyapısını (`DomainException`, `AllExceptionsFilter`, response envelope, `ZodValidationPipe`) da taşıdığından diğer iterasyonlardan daha geniştir — bu kasıtlıdır, bölünmez.

## İterasyon indeksi

| # | Teslim | §N.M |
| - | ------ | ---- |
| 1 | Kullanıcı modeli doğrulama + argon2id `PasswordService` | §1.1 |
| 2 | Register endpoint + ortak backend altyapısı + login'in credential-check çekirdeği | §1.2 |
| 3 | JWT access token + refresh cookie (`refresh_tokens` migration dahil) + login/refresh HTTP route'ları | §1.3 |
| 4 | Refresh replay tespiti + tüm oturumların iptali | §1.4 |
| 5 | `JwtAuthGuard` + `RolesGuard` + logout | §1.5 |
| 6 | Login rate limiting (IP+email) | §1.6 |
| 7 | Frontend auth akışı | §1.7 |

## Required Context

- `docs/10_IMPLEMENTATION_ROADMAP.md` §3 Faz 1 — tüm alt madde tanımları
- `docs/mimari-kararlar.md` AUTH-001/002 (RBAC modeli), SEC-006..013 (auth/session, secrets, refresh şeması)
- `.claude/rules/00-*.md` … `04-*.md` — zaten yüklü, tekrar edilmez
- `.claude/skills/phase-00-infra-scaffold/SKILL.md` — komşu faz formatı referansı (bu skill aynı iterasyon şablonunu izler)

## Done Definition

- [ ] Bir kullanıcı `/register` ile kayıt olup `/login` ile giriş yapabiliyor (gerçek tarayıcıda doğrulanmış)
- [ ] Access token süresi dolduğunda `apps/web` otomatik refresh tetikliyor, orijinal istek tekrar deneniyor
- [ ] Refresh replay senaryosu (kullanılmış token'ın tekrar kullanılması → kullanıcının tüm oturumlarının iptali) integration testiyle doğrulanmış
- [ ] Login rate limiting (`IP+email`, 15dk'da 5 deneme) `429 RATE_LIMIT_EXCEEDED` ile çalışıyor, testle kanıtlı
- [ ] `JwtAuthGuard`/`RolesGuard` global kayıtlı; `@Public()` yalnızca register/login/refresh'te
- [ ] CI'ın 4 adımı (lint→typecheck→test→build) yeşil

## Explicit Don'ts

- Admin paneli, network/asset aktivasyonu, `audit_logs` tablosu ve LOGIN/LOGIN_FAILED audit yazımı — hepsi Faz 2 (`docs/03` §5.1 sıralama notu).
- Ownership guard (cüzdan/transfer sahiplik kontrolü) — henüz kontrol edilecek bir kaynak yok, Faz 3+.
- Gerçek 2FA (TOTP/SMS) — MVP kapsamı dışı, kalıcı sınır (`mimari-kararlar.md` SEC-OPEN-1).
- S-DASHBOARD'ın gerçek içeriği — İterasyon 7'de yalnızca yönlendirme hedefi olarak geçici bir placeholder vardır, gerçek ekran Faz 3 §3.5.
- `(admin)` route group, S-ERROR-404/403 sistem ekranları — sırasıyla Faz 2, Faz 7.

---

### İterasyon 1 — Kullanıcı Modeli Doğrulama + Şifre Hash'leme (§1.1)

**Hedef:** `users` tablosunun (Faz 0'da oluşturulan 4 temel tablodan biri) `docs/02_DATABASE_SCHEMA.md` §2.1 ile birebir olduğu doğrulanır; argon2id tabanlı, test edilmiş bir `PasswordService` kurulur — §1.2'nin register/login akışının temelini oluşturur.

**Teslim çıktısı:**
- `apps/api/src/auth/password.service.ts` (+ `.spec.ts`), `apps/api/src/auth/auth.module.ts` (iskelet, yalnızca `PasswordService` provider)

**Önkoşullar:**
- [ ] Faz 0 tamamlanmış (`users` tablosu migration'ı mevcut, `docker-compose up` ile Postgres ayakta)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §1.1 — kapsam
2. `docs/02_DATABASE_SCHEMA.md` §2.1 `users` — şema doğrulama
3. `docs/mimari-kararlar.md` A-001 (email+şifre argon2id kararı)
4. `docs/07_SECURITY_IMPLEMENTATION.md` §2 Kimlik Doğrulama Akışı — argon2id karşılaştırma adımı

**Uygulama planı:**
1. `git-phase-branch` ile `feat/password-hashing-service` branch'i aç.
2. `apps/api/prisma/schema.prisma`'daki `User` modelinin `docs/02` §2.1 ile birebir olduğunu doğrula (`email` UNIQUE, `password_hash` TEXT, `role` enum default `user`, `created_at`) — sapma beklenmiyor (Faz 0 aynı kaynaktan üretildi); varsa `add-prisma-migration` ile düzelt.
3. `argon2` paketini `apps/api`'ye ekle (`pnpm add argon2 --filter api`).
4. `PasswordService.hash(plain: string): Promise<string>` — `argon2.hash(plain, { type: argon2.argon2id })`; `PasswordService.verify(hash: string, plain: string): Promise<boolean>` — `argon2.verify`.
5. `AuthModule` iskeleti (yalnızca bu servis provider olarak), `app.module.ts`'e import edilir.
6. Unit test: `hash()` aynı plaintext için her çağrıda farklı çıktı üretir (salt); `verify()` doğru şifrede `true`, yanlış şifrede `false` döner.
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `apps/api/src/auth/password.service.ts`, `apps/api/src/auth/password.service.spec.ts`, `apps/api/src/auth/auth.module.ts` |
| Güncelle | `apps/api/package.json` (argon2), `apps/api/src/app.module.ts` (AuthModule import) |
| Dokunma | `apps/api/prisma/schema.prisma` (yalnızca doğrulama, değişiklik beklenmiyor) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `password_hash` argon2id ile hash'lenir | `docs/02` §2.1, `mimari-kararlar` A-001 | `argon2.hash(..., { type: argon2.argon2id })` |
| Şifre hiçbir log satırına yazılmaz | `.claude/rules/03-security-baseline.md` madde 1 (prensip) | `PasswordService` plaintext şifreyi hiçbir yerde loglamaz |

**Kalite kapıları:**
- [ ] Pozitif senaryo: doğru şifre → `verify` `true`
- [ ] Negatif senaryo: yanlış şifre → `verify` `false`
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** register/login endpoint'leri (§1.2), JWT (§1.3), migration değişikliği (`users` tablosu zaten Faz 0'da tam haliyle var).

**Risk / dikkat:** `argon2` paketinin varsayılan (memory/time cost) parametreleri elle zayıflatılmaz — güvenli varsayılanlar korunur.

**Stop:**
- [ ] `pnpm --filter api test -- password.service`
- [ ] PR/onay → İterasyon 2

---

### İterasyon 2 — Register Endpoint + Ortak Backend Altyapısı (§1.2)

**Hedef:** `POST /auth/register` uçtan uca çalışır (`docs/03` §5.1 ile birebir); login'in kimlik doğrulama çekirdeği (`AuthService.validateCredentials`) test edilmiş şekilde hazırdır. Bu iterasyon, sonraki tüm modüllerin (Faz 2+) tekrar kullanacağı ortak backend altyapısını da ilk kez kurar.

**Teslim çıktısı:**
- `packages/types/src/schemas/auth.schema.ts` (`registerSchema`, `loginSchema`)
- `apps/api/src/common/exceptions/domain.exception.ts`, `apps/api/src/common/filters/all-exceptions.filter.ts`, `apps/api/src/common/interceptors/response-envelope.interceptor.ts`, `apps/api/src/common/pipes/zod-validation.pipe.ts`
- `apps/api/src/auth/{auth.controller.ts, auth.service.ts, users.repository.ts, dto/register.dto.ts, dto/login.dto.ts}` + ilgili `.spec.ts`

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (`PasswordService` hazır)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §1.2 — kapsam
2. `docs/03_API_CONTRACTS.md` §2 Response Envelope, §3 Error Taxonomy, §5.1 Auth (yalnızca register+login satırları)
3. `docs/04_BACKEND_SPEC.md` §5 Validation Kalıbı, §6 Exception Handling
4. `docs/06_SCREEN_CATALOG.md` §4.1 S-AUTH-LOGIN/S-AUTH-REGISTER — alan/validation kuralları (frontend §1.7'de kullanılacak, şema burada kurulur)
5. `add-new-endpoint` skill (prosedür referansı)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/register-login-endpoints` branch'i aç.
2. `packages/types/src/schemas/auth.schema.ts`: `registerSchema` (email, password ≥8 karakter + en az 1 rakam), `loginSchema` (email, password boş olamaz) — `.strict()` ile bilinmeyen alan reddi; `packages/types/src/index.ts` barrel'ına ekle.
3. `common/exceptions/domain.exception.ts` — `DomainException` taban sınıfı; ilk somut alt sınıflar: `EmailAlreadyExistsException` (409 `EMAIL_ALREADY_EXISTS`), `AuthInvalidCredentialsException` (401 `AUTH_INVALID_CREDENTIALS`), `ValidationFailedException` (400 `VALIDATION_FAILED`, `details`).
4. `common/pipes/zod-validation.pipe.ts` — generic pipe, `schema.parse()` ile doğrular, `ZodError`'ı `ValidationFailedException`'a çevirir (`details: issues.map(i => ({ field: i.path.join('.'), reason: i.message }))`); her route'a `@UsePipes(new ZodValidationPipe(schema))` ile uygulanır (backend spec §5'teki "her DTO sınıfı zod şemasını bir pipe üzerinden çalıştırır" kalıbı — tek bir global `APP_PIPE` değil, per-route uygulama; farklı route'lar farklı şema gerektirdiğinden bu konvansiyon buradan itibaren sabittir).
5. `common/filters/all-exceptions.filter.ts` + `common/interceptors/response-envelope.interceptor.ts` — `docs/03` §2/§6 ile birebir; `main.ts`'te global kaydedilir.
6. `auth/users.repository.ts` — `findByEmail`, `create` (`PrismaService` üzerinden).
7. `auth/auth.service.ts` — `register(dto)`: email benzersizlik kontrolü → `PasswordService.hash` → `UsersRepository.create`; `validateCredentials(email, password)`: kullanıcıyı bulur, `PasswordService.verify` çağırır, başarısızsa `AuthInvalidCredentialsException` fırlatır, başarılıysa kullanıcıyı döner (login endpoint'i İterasyon 3'te bunu çağıracak).
8. `auth/auth.controller.ts` — `@Public() POST /auth/register` (`@UsePipes(new ZodValidationPipe(registerSchema))`). `POST /auth/login` HTTP route'u **bilerek bu iterasyonda açılmıyor** (bkz. Bu iterasyonda yok).
9. Unit test (`auth.service`): email zaten varsa `EmailAlreadyExistsException`; şifre yanlışsa `AuthInvalidCredentialsException`; doğru girişte kullanıcı dönüyor. Integration test (controller→repo, test DB): register happy path `201`, aynı email ile `409`, eksik alan ile `400` + `details`.
10. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `packages/types/src/schemas/auth.schema.ts`, `common/exceptions/domain.exception.ts`, `common/filters/all-exceptions.filter.ts`, `common/interceptors/response-envelope.interceptor.ts`, `common/pipes/zod-validation.pipe.ts`, `auth/auth.controller.ts`, `auth/auth.service.ts`, `auth/users.repository.ts`, `auth/dto/register.dto.ts`, `auth/dto/login.dto.ts` + `.spec.ts` dosyaları |
| Güncelle | `packages/types/src/index.ts`, `apps/api/src/main.ts` (filter/interceptor kaydı), `apps/api/src/auth/auth.module.ts` |
| Dokunma | `POST /auth/login` HTTP route'u (kasıtlı olarak §1.3'e bırakıldı) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Response envelope (`data`/`error` + `meta`) | `docs/03` §2 | `ResponseEnvelopeInterceptor` + `AllExceptionsFilter` |
| Error taxonomy (`<DOMAIN>_<REASON>`, sabit HTTP status) | `docs/03` §3 | `DomainException` alt sınıfları |
| Zod şema, `class-validator` yok | `docs/04` §5 | `ZodValidationPipe`, `.strict()` şema |
| DTO backend/frontend'de aynı şema | `docs/04` §5 | `packages/types/src/schemas/auth.schema.ts` tek kaynak |

**Kalite kapıları:**
- [ ] Unit test: `EmailAlreadyExistsException`, `AuthInvalidCredentialsException`, başarılı `validateCredentials`
- [ ] Integration test: register `201`/`409`/`400` senaryoları
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `POST /auth/login` HTTP route'u — token issuance (§1.3) olmadan `docs/03` §5.1'deki login sözleşmesine (`{ accessToken, user }` + `Set-Cookie`) uyan bir yanıt üretilemez; yarı-sözleşmeli bir endpoint'i `main`'e almamak için `AuthService.validateCredentials()` burada tamamlanıp test edilir, HTTP route'unu İterasyon 3 açar. JWT/refresh cookie, guard'lar, rate limiting sonraki iterasyonlarda.

**Risk / dikkat:** `ZodValidationPipe`/`AllExceptionsFilter`/response envelope, Faz 2+'nin tüm modüllerinin üzerine kuracağı ortak kalıptır — burada atılan error code eşlemesi/`details` formatı sonradan değişirse geriye dönük tüm endpoint'leri etkiler; `docs/03` §2/§3 ile birebir kalmalı.

**Stop:**
- [ ] `pnpm --filter api test -- auth`
- [ ] PR/onay → İterasyon 3

---

### İterasyon 3 — JWT Access Token ve Refresh Cookie (§1.3)

**Hedef:** `POST /auth/login` artık `docs/03` §5.1 sözleşmesine tam uyar (`accessToken` body + `Set-Cookie: refresh_token`); `POST /auth/refresh` rotation ile çalışır. `refresh_tokens` tablosu (SEC-013) bu iterasyonda migration ile oluşturulur.

**Teslim çıktısı:**
- `refresh_tokens` migration, `apps/api/src/auth/token.service.ts` (+ `.spec.ts`), `apps/api/src/auth/refresh-tokens.repository.ts`
- `auth.controller.ts`/`auth.service.ts` güncellemesi (login tamamlanır, refresh eklenir)
- `env.schema.ts` + `.env.example` güncellemesi (`COOKIE_SECURE`), `main.ts`'e `cookie-parser` middleware

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §1.3 — kapsam
2. `docs/mimari-kararlar.md` SEC-007 (`COOKIE_SECURE` addendum'u dahil), **SEC-013** (`refresh_tokens` şeması — bu skill'in başındaki "Ön koşul" bölümüyle eklendi)
3. `docs/02_DATABASE_SCHEMA.md` §2.13 `refresh_tokens`
4. `docs/03_API_CONTRACTS.md` §4 Auth Başlıkları/Cookie Sözleşmesi, §5.1 login/refresh
5. `docs/07_SECURITY_IMPLEMENTATION.md` §2-3 (login sequence diagram, token karşılaştırma tablosu)
6. `docs/09_DEV_WORKFLOW.md` §7 (`COOKIE_SECURE`, `JWT_*` env temin yolu)
7. `add-prisma-migration` skill (migration adımı için)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/jwt-access-refresh-cookie` branch'i aç.
2. `add-prisma-migration` prosedürüyle `refresh_tokens` tablosunu şemaya ekle (`docs/02` §2.13 birebir), `prisma migrate dev --name add_refresh_tokens`.
3. `apps/api/.env.example` ve `env.schema.ts`'e `COOKIE_SECURE` (boolean, varsayılan `true`) ekle — Faz 0'da bu değişken yoktu, bu iterasyonda SEC-007 addendum'u nedeniyle eklendi.
4. `@nestjs/jwt` kaydı (`JwtModule.registerAsync`, `ConfigService`'ten `JWT_ACCESS_SECRET`/`JWT_ACCESS_TTL` okunur — bu env değişkenleri Faz 0'da zaten `.env.example`/`env.schema.ts`'e eklenmişti, yalnızca burada tüketilmeye başlanıyor).
5. `token.service.ts`: `issueAccessToken(user)` → `jwtService.sign({ sub, role }, { expiresIn })`; `issueRefreshToken(userId)` → `crypto.randomBytes(32).toString('hex')` ile ham token üretir, `hashRefreshToken()` ile (`JWT_REFRESH_SECRET` anahtarlı HMAC-SHA256) hash'ler, `refresh_tokens`'a `{ userId, tokenHash, expiresAt: now + JWT_REFRESH_TTL }` yazar, ham token'ı döner (yalnızca bu anda — DB'ye yalnızca hash yazılır); `rotateRefreshToken(rawOldToken)` → hash'le, repository'den bul; bulunamazsa/süresi geçmişse `AuthTokenExpiredException`; bulunursa mevcut satırı `revokedAt = now()` yapıp yeni bir `issueRefreshToken` çağırır (tek transaction).
6. `refresh-tokens.repository.ts`: `findByHash`, `revoke`, `create` (Prisma).
7. `auth.controller.ts`: login artık `AuthService.login(dto)` çağırır (`validateCredentials` + `issueAccessToken` + `issueRefreshToken`), response body `{ accessToken, user }`, `Set-Cookie` (`res.cookie('refresh_token', raw, { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 })`); `POST /auth/refresh` (`@Public()`): cookie'den `refresh_token` okur, `rotateRefreshToken` çağırır, yeni `accessToken` + rotate edilmiş `Set-Cookie` döner.
8. `cookie-parser` middleware `main.ts`'e eklenir.
9. Unit test (`token.service`): `issueAccessToken` doğru payload/TTL üretir; `issueRefreshToken` hash'i DB'ye yazar, ham değeri döndürür; `rotateRefreshToken` eski satırı revoke eder + yeni satır oluşturur. Integration test (auth flow): login → `accessToken` body'de + `Set-Cookie`'de `refresh_token` var; refresh → yeni `accessToken` + rotate edilmiş cookie.
10. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `token.service.ts` (+ `.spec.ts`), `refresh-tokens.repository.ts` |
| Güncelle | `schema.prisma`, `apps/api/.env.example`, `env.schema.ts`, `main.ts`, `auth.controller.ts`, `auth.service.ts`, `apps/api/package.json` (`@nestjs/jwt`, `cookie-parser`) |
| Dokunma | replay'in ayrıştırılmış tespiti (İterasyon 4'e bırakıldı — burada zaten-revoke-edilmiş bir token yalnızca genel `AUTH_TOKEN_EXPIRED` alır) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Access token 15dk, refresh cookie 7 gün rotating | `mimari-kararlar` SEC-007 | `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` env |
| `refresh_tokens` şeması, HMAC-SHA256 `tokenHash` | `mimari-kararlar` SEC-013, `docs/02` §2.13 | `hashRefreshToken()` `JWT_REFRESH_SECRET` anahtarlı |
| `secure` cookie varsayılan `true`, dev'de `COOKIE_SECURE=false` | `mimari-kararlar` SEC-007 addendum, `docs/09` §7 | `res.cookie(..., { secure: config.cookieSecure })` |
| `POST /auth/refresh` cookie üzerinden çalışır, header gerekmez | `docs/03` §4 | `cookie-parser` + `@Public()` |

**Kalite kapıları:**
- [ ] Unit test: `token.service` (issue/rotate)
- [ ] Integration test: login → `Set-Cookie` doğrulaması; refresh → rotation doğrulaması
- [ ] `prisma validate` + `migrate dev` hatasız
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** replay'in `AUTH_REFRESH_REUSE_DETECTED` olarak ayrıca tespiti ve kullanıcının TÜM oturumlarının iptali (§1.4); `JwtAuthGuard`/`RolesGuard` (§1.5) henüz yok — login/refresh dışında korunan bir endpoint yok; rate limiting (§1.6).

**Risk / dikkat:** `COOKIE_SECURE=false` yalnızca yerel `.env`'de olmalı; kod içindeki varsayılan her zaman `true`'dur — env okunamazsa fail-fast (Faz 0 §0.2 zod disiplini) devreye girmeli, sessizce `false`'a düşmemeli.

**Stop:**
- [ ] `pnpm --filter api exec prisma migrate dev`
- [ ] `pnpm --filter api test -- token`
- [ ] `pnpm --filter api test -- auth`
- [ ] PR/onay → İterasyon 4

---

### İterasyon 4 — Refresh Replay Tespiti (§1.4)

**Hedef:** Kullanılmış (`revokedAt` dolu) bir refresh token tekrar sunulursa `401 AUTH_REFRESH_REUSE_DETECTED` döner ve o kullanıcıya ait, o ana kadar `revokedAt`'ı boş olan **tüm** `refresh_tokens` satırları geçersiz kılınır.

**Teslim çıktısı:**
- `refresh-tokens.repository.ts` güncellemesi (`revokeAllForUser` metodu), `auth.service.ts`/`token.service.ts` refresh akışı güncellemesi (replay dalı), regresyon testi (`docs/08` zorunlu negatif senaryo #9)

**Önkoşullar:**
- [ ] İterasyon 3 Stop tamam

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §1.4 — kapsam
2. `docs/07_SECURITY_IMPLEMENTATION.md` §2 — replay sequence diyagramı
3. `docs/03_API_CONTRACTS.md` §5.1 — `AUTH_REFRESH_REUSE_DETECTED`
4. `docs/08_TESTING_STRATEGY.md` §3 Kritik Modül Tanımı (Auth/session servisleri), §4 madde 9

**Uygulama planı:**
1. `git-phase-branch` ile `feat/refresh-replay-detection` branch'i aç.
2. `refresh-tokens.repository.ts`: `revokeAllForUser(userId)` — `WHERE userId = ... AND revokedAt IS NULL` → `SET revokedAt = now()`.
3. Refresh akışını genişlet: hash'i bul → (a) satır yok VEYA `expiresAt` geçmiş → `AuthTokenExpiredException` (mevcut davranış); (b) satır var VE `revokedAt` DOLU → önce `revokeAllForUser(satırın userId'si)` çağrılır, sonra `AuthRefreshReuseDetectedException` (401 `AUTH_REFRESH_REUSE_DETECTED`) fırlatılır; (c) satır var VE `revokedAt` boş VE süresi geçmemiş → mevcut rotation akışı (İterasyon 3). (b) ve cascade revoke, tek bir Prisma transaction'ı içinde yapılır.
4. `AuthRefreshReuseDetectedException` (`DomainException` alt sınıfı) `common/exceptions` veya `auth/exceptions` altına eklenir.
5. Regresyon testi: login → refresh (rotate: token A geçersiz, token B geçerli) → eski token A ile tekrar refresh dene → `401 AUTH_REFRESH_REUSE_DETECTED`; ardından token B ile refresh dene → o da artık geçersiz (cascade revoke edildiği için) — bu iki adım `docs/08` madde 9'un regresyon karşılığıdır.
6. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Güncelle | `refresh-tokens.repository.ts`, `auth.service.ts`/`token.service.ts`, exception dosyası (yeni sınıf eklenir) |
| Oluştur | mevcut `.spec.ts` dosyalarına yeni test case'ler (genelde yeni dosya gerekmez) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Replay tespitinde tüm oturumlar iptal | `docs/10` §1.4, `mimari-kararlar` SEC-007 | `revokeAllForUser` + `AuthRefreshReuseDetectedException` |
| Zorunlu negatif senaryo #9 | `docs/08` §4 | Regresyon testi (adım 5) |
| Refresh'te audit yazımı yok | `docs/03` §5.1 | Replay de "yüksek frekanslı teknik olay" sınıfına girer, ayrıca loglanmaz |

**Kalite kapıları:**
- [ ] Regresyon testi zorunlu (madde 9) — geçmeli
- [ ] Mevcut §1.3 testleri hâlâ geçiyor
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `JwtAuthGuard`/`RolesGuard` (§1.5), rate limiting (§1.6), audit_logs yazımı (tablo Faz 2'de).

**Risk / dikkat:** Cascade revoke ile exception fırlatma sırası önemlidir — önce revoke, sonra hata; aksi halde eşzamanlı iki replay denemesi tutarsız sonuç üretebilir. Bu adım tek transaction içinde olmalı.

**Stop:**
- [ ] `pnpm --filter api test -- auth` (replay senaryosu dahil)
- [ ] PR/onay → İterasyon 5

---

### İterasyon 5 — Auth Guard, Role Guard ve Logout (§1.5)

**Hedef:** `JwtAuthGuard` + `RolesGuard` global olarak çalışır (`docs/04` §4 middleware zincirinin 4-5. adımları); `POST /auth/logout` mevcut refresh token'ı iptal eder.

**Teslim çıktısı:**
- `common/guards/{jwt-auth.guard.ts, roles.guard.ts}`, `common/decorators/{public.decorator.ts, roles.decorator.ts, current-user.decorator.ts}`
- `app.module.ts`'te `APP_GUARD` kaydı, `auth.controller.ts` logout route, `auth.service.ts` logout metodu

**Önkoşullar:**
- [ ] İterasyon 4 Stop tamam

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §1.5 — kapsam
2. `docs/04_BACKEND_SPEC.md` §4 Middleware Zinciri (adım 4-6; ownership guard bu fazda yok, Faz 3+'ta gelir)
3. `docs/mimari-kararlar.md` AUTH-001, AUTH-002 (RBAC modeli, guard zorunluluğu)
4. `docs/03_API_CONTRACTS.md` §5.1 logout
5. `docs/02_DATABASE_SCHEMA.md` §3 `user_role` enum

**Uygulama planı:**
1. `git-phase-branch` ile `feat/auth-role-guards` branch'i aç.
2. `common/decorators/public.decorator.ts` — `@Public()` (`SetMetadata`); register/login/refresh route'larına (İterasyon 2-3'te zaten kullanılmadıysa) uygulanır.
3. `common/guards/jwt-auth.guard.ts` — `Reflector` ile `@Public()` kontrolü; yoksa `Authorization: Bearer` header'ındaki JWT'yi `JwtService` ile doğrular, `request.user = { id, role }` set eder; geçersiz/süresi dolmuş token'da `401 AUTH_TOKEN_INVALID`/`AUTH_TOKEN_EXPIRED`.
4. `common/decorators/roles.decorator.ts` (`@Roles('admin')`) + `common/guards/roles.guard.ts` — `Reflector` ile gerekli rolü okur, `request.user.role` ile karşılaştırır; uyuşmazlıkta `403 FORBIDDEN_ROLE`.
5. `common/decorators/current-user.decorator.ts` (`@CurrentUser()`) — `request.user`'ı controller parametresine enjekte eder.
6. `app.module.ts`: `APP_GUARD` ile `JwtAuthGuard` + `RolesGuard` global kayıt (`docs/04` §4 sırası: auth guard önce, role guard sonra).
7. `auth.service.ts`: `logout(refreshTokenRaw)` — hash'le, ilgili satırı `revokedAt = now()` yap (bulunamazsa sessizce no-op — `docs/03` bu durum için ayrı bir hata kodu tanımlamıyor); `auth.controller.ts`: `POST /auth/logout` (global guard zaten geçerli, `@Public()` YOK), cookie'yi temizleyen `Set-Cookie` (`maxAge: 0`) + `204`.
8. Unit test: `JwtAuthGuard` geçerli/geçersiz/süresi dolmuş token senaryoları, `@Public()` bypass; `RolesGuard` user/admin senaryoları (mock request ile — henüz gerçek bir `@Roles('admin')` endpoint'i yok). Integration test: logout sonrası aynı refresh cookie ile refresh denemesi başarısız olmalı (satır revoked).
9. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `common/guards/jwt-auth.guard.ts` (+.spec), `common/guards/roles.guard.ts` (+.spec), `common/decorators/{public,roles,current-user}.decorator.ts` |
| Güncelle | `app.module.ts` (`APP_GUARD`), `auth.controller.ts`, `auth.service.ts` |
| Dokunma | Ownership guard (Faz 3+) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Her endpoint guard'a tabi, `@Public()` istisnası | `mimari-kararlar` AUTH-002, `docs/04` §4 | `APP_GUARD` + `@Public()` |
| RBAC (`user`/`admin`) | `mimari-kararlar` AUTH-001 | `@Roles()` + `RolesGuard` |
| Logout refresh cookie'yi geçersiz kılar | `docs/03` §5.1 | `revokedAt = now()` + `Set-Cookie` temizleme |

**Kalite kapıları:**
- [ ] `JwtAuthGuard` unit test (geçerli/geçersiz/süresi dolmuş/`@Public()` bypass)
- [ ] `RolesGuard` unit test (user/admin)
- [ ] Logout integration test (sonraki refresh denemesi başarısız)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** Ownership guard (cüzdan/transfer sahiplik — Faz 3+), gerçek bir `@Roles('admin')` endpoint'i (Faz 2'de gelir, `RolesGuard` burada yalnızca birim testte doğrulanır), rate limiting (§1.6).

**Risk / dikkat:** Global guard kayıt sırası ters olursa (`RolesGuard` `JwtAuthGuard`'dan önce çalışırsa) `request.user` henüz set edilmeden rol kontrolü yapılmaya çalışılabilir — `docs/04` §4'teki sıra (4. auth guard, 5. role guard) birebir korunmalı.

**Stop:**
- [ ] `pnpm --filter api test -- guard`
- [ ] `pnpm --filter api test -- auth`
- [ ] PR/onay → İterasyon 6

---

### İterasyon 6 — Login Rate Limiting (§1.6)

**Hedef:** `POST /auth/login` `IP+email` bileşik anahtarıyla 15 dakikada 5 deneme ile sınırlanır; `POST /auth/register` IP başına saatte 3 ile sınırlanır; aşımda `429 RATE_LIMIT_EXCEEDED` + `Retry-After`.

**Teslim çıktısı:**
- `@nestjs/throttler` kurulumu, `apps/api/src/auth/login-throttler.guard.ts` (custom key generator), `app.module.ts` `ThrottlerModule` kaydı, controller dekoratörleri

**Önkoşullar:**
- [ ] İterasyon 5 Stop tamam

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §1.6 — kapsam
2. `docs/03_API_CONTRACTS.md` §6 Rate Limit ve Kota Kuralları
3. `docs/mimari-kararlar.md` SEC-007 (rate limiting cümlesi), `.claude/rules/03-security-baseline.md` madde 5
4. `docs/08_TESTING_STRATEGY.md` §4 madde 10 (zorunlu negatif senaryo)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/login-rate-limiting` branch'i aç.
2. `@nestjs/throttler` ekle; `app.module.ts`'te `ThrottlerModule.forRoot` (varsayılan: 100 istek/dk, key: `userId` — `docs/03` §6 "diğer tüm authenticated endpoint'ler" satırı; bu varsayılan Faz 2+'nin endpoint'lerine otomatik uygulanacak).
3. `auth/login-throttler.guard.ts` — `ThrottlerGuard`'ı extend eder, `getTracker()` → `` `${ip}:${normalizedEmail}` `` (email lowercase normalize edilmiş, gövdeden okunur); login route'una `@UseGuards(LoginThrottlerGuard)` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })`.
4. register route'una `@Throttle({ default: { limit: 3, ttl: 3_600_000 } })` (key: yalnızca IP, varsayılan tracker yeterli).
5. `AllExceptionsFilter`'da `ThrottlerException` → `429 RATE_LIMIT_EXCEEDED` eşlemesi eklenir; `Retry-After` header'ının `ThrottlerGuard`'ın varsayılan davranışıyla zaten set edildiği doğrulanır.
6. Unit test: composite key generator `IP+email`'i doğru birleştiriyor (email normalize dahil). Integration test: aynı `IP+email` ile 6 login denemesi → 6.'sı `429` (`docs/08` madde 10 regresyonu).
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `auth/login-throttler.guard.ts` (+.spec) |
| Güncelle | `app.module.ts` (`ThrottlerModule`), `auth.controller.ts` (`@Throttle` dekoratörleri), `all-exceptions.filter.ts` (`ThrottlerException` eşlemesi), `apps/api/package.json` (`@nestjs/throttler`) |
| Dokunma | `LOGIN_FAILED` audit kaydı (Faz 2'de, `audit_logs` tablosuyla birlikte) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Login: 5 istek/15dk, `IP+email` | `docs/03` §6 | `@Throttle` + custom tracker |
| Register: 3 istek/saat, `IP` | `docs/03` §6 | `@Throttle` varsayılan tracker |
| Zorunlu negatif senaryo #10 | `docs/08` §4 | 6. deneme `429` regresyon testi |

**Kalite kapıları:**
- [ ] Composite key generator unit test
- [ ] Rate limit aşımı integration testi (madde 10)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `LOGIN_FAILED` audit kaydının `metadata: { reason: 'rate_limited' }` ile yazılması (`audit_logs` Faz 2'de gelir — `docs/03` §6 sıralama notu); admin/mint/transfer rate limit eşikleri (ilgili endpoint'lerle birlikte Faz 4/5'te).

**Risk / dikkat:** Email normalize edilmeden (case-sensitivity) key üretilirse aynı kullanıcı farklı case ile farklı bucket'lara düşebilir — login/register akışındaki email normalize kuralıyla tutarlı olmalı.

**Stop:**
- [ ] `pnpm --filter api test -- throttl`
- [ ] PR/onay → İterasyon 7

---

### İterasyon 7 — Frontend Auth Akışı (§1.7)

**Hedef:** Kullanıcı gerçek tarayıcıda kayıt olup giriş yapabiliyor; access token bellekte tutuluyor; `401 AUTH_TOKEN_EXPIRED` alındığında otomatik refresh + orijinal isteğin tekrarı çalışıyor; S-SESSION-EXPIRED/S-LOGOUT-CONFIRM akışları çalışıyor. Faz 1'in insan onay noktası bu iterasyonla manuel doğrulanabilir hale gelir.

**Teslim çıktısı:**
- `apps/web/src/app/(public)/{login,register}/page.tsx`, `(authenticated)/layout.tsx` + `middleware.ts`
- `AuthContext`, `lib/api-client.ts`, `hooks/useAuth.ts`
- S-SESSION-EXPIRED, S-LOGOUT-CONFIRM bileşenleri
- Geçici `(authenticated)/dashboard/page.tsx` placeholder

**Önkoşullar:**
- [ ] İterasyon 6 Stop tamam (backend auth uçtan uca çalışıyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §1.7 — kapsam
2. `docs/06_SCREEN_CATALOG.md` §4.1 S-AUTH-LOGIN/S-AUTH-REGISTER, §5.1 S-SESSION-EXPIRED/S-LOGOUT-CONFIRM
3. `docs/05_FRONTEND_SPEC.md` §1-5 (klasör yapısı, routing, state yönetimi, veri çekme, form kalıbı)
4. `add-new-screen` skill (prosedür referansı)
5. `packages/types/src/schemas/auth.schema.ts` (İterasyon 2'de kurulan şema — form aynı şemayı kullanır)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/frontend-auth-flow` branch'i aç.
2. `lib/api-client.ts` — merkezi fetch wrapper: her isteğe `Authorization` header (`AuthContext`'ten okunan access token) ekler, `credentials: 'include'` (refresh cookie için), `401 AUTH_TOKEN_EXPIRED` yakalandığında `POST /auth/refresh` tetikler → başarılıysa orijinal isteği tekrar dener, başarısızsa S-SESSION-EXPIRED tetikler.
3. `hooks/useAuth.ts` — `useLogin`/`useRegister`/`useLogout` mutations (TanStack Query), `AuthContext`'e access token'ı yazar/temizler.
4. `AuthContext` (React Context, yalnızca bellek — `localStorage` yok, `docs/05` §3 access token istisnası).
5. `app/(public)/layout.tsx`, `/login/page.tsx` (S-AUTH-LOGIN — react-hook-form + `loginSchema`), `/register/page.tsx` (S-AUTH-REGISTER — `registerSchema` + frontend-only "şifre tekrar" alanı).
6. `app/(authenticated)/layout.tsx` + `middleware.ts` (refresh_token cookie varlığı kontrolü — `httpOnly` olduğundan yalnızca varlık, içerik okunamaz); `app/(authenticated)/dashboard/page.tsx` — **GEÇİCİ placeholder** ("Giriş başarılı" + çıkış butonu); gerçek dashboard Faz 3 §3.5'te bunun yerini alır.
7. S-SESSION-EXPIRED (modal/redirect bileşeni), S-LOGOUT-CONFIRM (modal, "Çıkış Yap" → `useLogout` → `/login`).
8. Manuel doğrulama: kayıt ol → login → dashboard placeholder'a yönlen → (dev'de `JWT_ACCESS_TTL` kısaltılarak) erken süre dolumu senaryosunda otomatik refresh'in tetiklendiği gözlemlenir.
9. PR aç — PR açıklamasında dashboard placeholder'ının **geçici** olduğu ve Faz 3 §3.5'te değişeceği açıkça belirtilir.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(public)/layout.tsx`, `login/page.tsx`, `register/page.tsx`, `app/(authenticated)/layout.tsx`, `dashboard/page.tsx` (placeholder), `middleware.ts`, `lib/api-client.ts`, `hooks/useAuth.ts`, `AuthContext` dosyası, S-SESSION-EXPIRED/S-LOGOUT-CONFIRM bileşenleri |
| Dokunma | S-DASHBOARD gerçek içeriği (Faz 3 §3.5), `(admin)` route group (Faz 2) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Access token yalnızca bellekte | `docs/05` §3, `.claude/rules/03-security-baseline.md` madde 2 | `AuthContext`, `localStorage` yok |
| Alan listesi/validation (login/register) | `docs/06` §4.1 | `react-hook-form` + `packages/types` şeması |
| 401 → otomatik refresh → retry | `mimari-kararlar` SEC-007 | `lib/api-client.ts` interceptor mantığı |
| Korumalı route yönlendirmesi | `docs/05` §2 | `middleware.ts` cookie varlık kontrolü (yalnızca UX, backend zaten zorunlu kılar) |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok — proje test spec'i (`docs/08`) frontend birim testi tanımlamıyor, doğrulama e2e'de (Faz 7 §7.3) ve bu iterasyonun manuel doğrulamasında yapılır

**Bu iterasyonda yok:** gerçek S-DASHBOARD içeriği (Faz 3 §3.5 — burada yalnızca yönlendirme hedefi olarak boş bir placeholder var), `(admin)` route group (Faz 2), S-ERROR-404/403 sistem ekranları (Faz 7).

**Risk / dikkat:** Dashboard placeholder'ının Faz 3'e kadar unutulup kalıcı hale gelmesi riski — PR açıklamasında ve varsa ilgili teknik borç notunda açıkça "GEÇİCİ" işaretlenmeli.

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (kayıt → giriş → placeholder dashboard → otomatik refresh)
- [ ] Faz 1 Done Definition tamam; `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 1 işaretlenir; kullanıcı onayı → Faz 2
