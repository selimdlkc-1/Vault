# 03. API Sözleşmeleri — Vault

## İçindekiler

1. Genel Sözleşme
2. Response Envelope
3. Error Taxonomy
4. Auth Başlıkları / Cookie Sözleşmesi
5. Endpoint Kataloğu
   - 5.1 Auth
   - 5.2 Wallets
   - 5.3 Networks / Assets
   - 5.4 Transfers
   - 5.5 Movements / History
   - 5.6 Portfolio
   - 5.7 Notifications
   - 5.8 Admin
6. Rate Limit ve Kota Kuralları
7. Idempotency ve Retry Semantiği
8. Webhook / Callback Sözleşmeleri
9. SLA ve Performans Hedefleri

---

## 1. Genel Sözleşme

**Base path:** `/api/v1`. Tüm endpoint'ler bu önekle başlar.

**Versiyonlama:** URL-path versioning. Şu an tek versiyon (`v1`) vardır; demo/portföy projesi ölçeğinde eşzamanlı versiyon desteği gerekmez. Kırıcı (breaking) bir değişiklik gerekirse `v1` doğrudan güncellenir, `v2` açılmaz — mevcut istemci (tek frontend) her zaman güncel versiyonla uyumlu deploy edilir.

**Content type:** İstek ve yanıt gövdeleri `application/json; charset=utf-8`. Dosya yükleme yoktur, bu nedenle `multipart/form-data` desteklenmez.

**Pagination modeli:** Offset tabanlı sayfalama. Liste döndüren tüm endpoint'ler `page` (1-tabanlı, varsayılan `1`) ve `pageSize` (varsayılan `20`, maksimum `100`) query parametrelerini kabul eder. Cursor-based sayfalama kullanılmaz; veri seti küçük (demo ölçeği) olduğundan offset'in performans dezavantajı bu projede gerçekleşmez.

```json
{
  "data": [ /* ... */ ],
  "pagination": { "page": 1, "pageSize": 20, "totalItems": 47, "totalPages": 3 }
}
```

**HTTP metodu kullanımı:** `GET` (okuma, yan etkisiz), `POST` (oluşturma veya durum geçişi tetikleme — ör. transfer'i `pending_signature`'a taşımak), `PATCH` (kısmi güncelleme — ör. `network_assets.is_active`), `DELETE` (yalnızca `draft` durumundaki transferin silinmesi). `PUT` kullanılmaz; tam kaynak değişimi gerektiren bir senaryo yoktur.

---

## 2. Response Envelope

**Başarı yanıtı:**

```json
{
  "data": { "id": "b3f1...", "email": "demo@vault.local" },
  "meta": { "timestamp": "2026-08-24T10:00:00.000Z" }
}
```

`data` tekil bir kaynak veya liste taşıyabilir; liste durumunda `meta` yerine üst düzeyde `pagination` alanı da eklenir (bkz. §1).

**Hata yanıtı:**

```json
{
  "error": {
    "code": "TRANSFER_INVALID_TRANSITION",
    "message": "Bu transfer bu adımda onaylanamaz.",
    "details": null
  },
  "meta": { "timestamp": "2026-08-24T10:00:00.000Z", "path": "/api/v1/transfers/9c2.../confirm" }
}
```

`details` alanı yalnızca doğrulama (validation) hatalarında alan bazlı hata listesiyle doldurulur (bkz. §3); diğer hata tiplerinde `null`'dır. Başarı ve hata yanıtları asla aynı gövdede karışmaz — bir yanıt ya yalnızca `data` ya yalnızca `error` taşır.

---

## 3. Error Taxonomy

Error code formatı: `<DOMAIN>_<REASON>`, tamamı `UPPER_SNAKE_CASE`. Her kod tek bir HTTP status'e eşlenir; aynı kod iki farklı status döndürmez.

| Error code | HTTP status | Anlamı |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | İstek gövdesi/query şeması geçersiz; `details` alanında `{ field, reason }` listesi döner |
| `EMAIL_ALREADY_EXISTS` | 409 | Register sırasında girilen e-posta sistemde zaten kayıtlı |
| `AUTH_INVALID_CREDENTIALS` | 401 | Email/şifre eşleşmedi (login) |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token süresi dolmuş; istemci refresh akışını tetiklemeli |
| `AUTH_TOKEN_INVALID` | 401 | Access token geçersiz/imza hatalı |
| `AUTH_REFRESH_REUSE_DETECTED` | 401 | Kullanılmış bir refresh token tekrar kullanılmaya çalışıldı (replay); tüm oturumlar geçersiz kılınır |
| `AUTH_STEP_UP_REQUIRED` | 401 | Transfer onayı için şifre tekrar doğrulaması başarısız/eksik |
| `FORBIDDEN_ROLE` | 403 | Kullanıcının rolü bu endpoint'e erişime yetkili değil |
| `FORBIDDEN_NOT_OWNER` | 403 | Kaynak (cüzdan/transfer) isteği yapan kullanıcıya ait değil |
| `RESOURCE_NOT_FOUND` | 404 | Belirtilen id ile eşleşen kayıt yok |
| `NETWORK_ASSET_INACTIVE` | 409 | Hedef `(network, asset)` çifti aktif değil; cüzdan/transfer oluşturulamaz |
| `WALLET_ADDRESS_ALREADY_EXISTS` | 409 | Aynı `(network, address)` çiftiyle bir cüzdan zaten kayıtlı (watch-only ekleme) |
| `WALLET_CROSS_NETWORK_MISMATCH` | 409 | Gönderen cüzdanın ağı ile hedef adresin beklenen ağı uyuşmuyor |
| `WALLET_INSUFFICIENT_BALANCE` | 409 | Bakiye, tutar + tahmini gas/fee'yi karşılamıyor |
| `WALLET_NOT_MANAGED` | 409 | Watch-only bir cüzdandan transfer başlatılmaya çalışıldı |
| `TRANSFER_INVALID_TRANSITION` | 409 | İstenen durum geçişi, mevcut durumdan izin verilen bir geçiş değil |
| `TRANSFER_ALREADY_TERMINAL` | 409 | Terminal durumdaki (`confirmed`/`failed`/`dropped`) bir transfer üzerinde işlem denendi |
| `WALLET_ADDRESS_INVALID_FORMAT` | 422 | Girilen adres, ağın beklediği formatta değil (checksum/base58check hatası) |
| `RATE_LIMIT_EXCEEDED` | 429 | İstek, tanımlı rate limit eşiğini aştı |
| `CHAIN_PROVIDER_UNAVAILABLE` | 502 | RPC/Alchemy/TronGrid çağrısı başarısız oldu, geçici sağlayıcı hatası |
| `INTERNAL_ERROR` | 500 | Beklenmeyen sunucu hatası; istemciye ham hata detayı asla verilmez |

**Mesaj politikası:** `message` alanı her zaman Türkçe ve kullanıcıya gösterilebilir şekilde yazılır (ham RPC/DB hatası asla `message`'a yansımaz). Ayrıntılı teknik hata (stack trace, RPC yanıtı) yalnızca sunucu tarafı structured log'a yazılır, API yanıtında yer almaz.

---

## 4. Auth Başlıkları / Cookie Sözleşmesi

**Access token:** `Authorization: Bearer <jwt>` header'ı ile gönderilir. JWT'nin TTL'i 15 dakikadır. Frontend bu token'ı yalnızca bellekte (JS değişkeninde) tutar, `localStorage`/`sessionStorage`'a yazmaz — XSS ile token çalınmasını engellemek içindir.

**Refresh token:** `httpOnly`, `secure` (env `COOKIE_SECURE`'a bağlı; varsayılan `true`, yalnızca yerel dev'de `false`), `SameSite=Strict` bir cookie'de (`refresh_token`) taşınır; TTL 7 gündür ve her kullanımda rotate edilir (kullanılan refresh token geçersiz kılınır, yenisi basılır). Bu cookie JavaScript'ten okunamaz. `POST /api/v1/auth/refresh` endpoint'i bu cookie'yi otomatik olarak (tarayıcı tarafından) gönderir, ayrıca bir header gerekmez.

**CSRF koruması:** `SameSite=Strict` refresh cookie'si zaten cross-site istekleri engeller; ek olarak state değiştiren tüm isteklerde (`POST`/`PATCH`/`DELETE`) özel bir `X-Requested-With: XMLHttpRequest` header'ı zorunludur — bu header'ı taşımayan istekler, cookie geçerli olsa dahi reddedilir.

**Public endpoint'ler** (`register`, `login`, `refresh`) `Authorization` header'ı gerektirmez. Diğer tüm endpoint'ler bu header olmadan `401 AUTH_TOKEN_INVALID` döner.

**Step-up header'ı:** Transfer'i `pending_signature`'a taşıyan endpoint, normal `Authorization` header'ına ek olarak istek gövdesinde kullanıcının mevcut şifresini (`currentPassword`) taşır; bu bir header değil, gövde alanıdır ve yalnızca bu tek endpoint'te zorunludur (bkz. §5.4).

---

## 5. Endpoint Kataloğu

### 5.1 Auth

**`POST /api/v1/auth/register`**
- *Yetki:* Public
- *Request:* `{ email: string, password: string }`
- *Response:* `201` — `{ id, email, role: 'user', createdAt }`
- *Hata kodları:* `VALIDATION_FAILED` (zayıf şifre/geçersiz email), `409 EMAIL_ALREADY_EXISTS`
- *Audit event:* Yok (kayıt olayı ayrı loglanmaz; ilk login loglanır)

**`POST /api/v1/auth/login`**
- *Yetki:* Public
- *Request:* `{ email: string, password: string }`
- *Response:* `200` — `{ accessToken, user: { id, email, role } }` + `Set-Cookie: refresh_token=...`
- *Hata kodları:* `AUTH_INVALID_CREDENTIALS`, `RATE_LIMIT_EXCEEDED` (IP+email bazlı brute-force koruması)
- *Audit event:* `LOGIN` (başarılı), `LOGIN_FAILED` (başarısız — email + IP metadata ile). *Sıralama notu:* `audit_logs` tablosu ilk kez Faz 2 §2.3'te oluşturulur (`docs/10_IMPLEMENTATION_ROADMAP.md`); Faz 1'de bu endpoint audit yazmadan çalışır, audit entegrasyonu Faz 2'de tabloyla birlikte eklenir.

**`POST /api/v1/auth/refresh`**
- *Yetki:* Public (yalnızca geçerli `refresh_token` cookie'si gerektirir)
- *Request:* Gövde yok; cookie üzerinden çalışır
- *Response:* `200` — `{ accessToken }` + rotate edilmiş `Set-Cookie: refresh_token=...`
- *Hata kodları:* `AUTH_TOKEN_EXPIRED`, `AUTH_REFRESH_REUSE_DETECTED` (replay tespitinde tüm oturumlar geçersiz kılınır)
- *Audit event:* Yok (yüksek frekanslı teknik olay, audit log'a yazılmaz)

**`POST /api/v1/auth/logout`**
- *Yetki:* Authenticated (`User` | `Admin`)
- *Request:* Gövde yok
- *Response:* `204` + `refresh_token` cookie'sini temizleyen `Set-Cookie`
- *Hata kodları:* —
- *Audit event:* Yok

### 5.2 Wallets

**`GET /api/v1/wallets`**
- *Yetki:* `User` (yalnızca kendi cüzdanları), `Admin` (`?userId=` ile herhangi bir kullanıcının cüzdanları, salt-okunur)
- *Request:* Query: `page`, `pageSize`, `networkId?`, `type?`
- *Response:* `200` — `{ data: [{ id, type, networkId, address, createdAt, balances: [{ assetId, symbol, balanceRaw, valueUsdt }] }], pagination }`
- *Hata kodları:* `FORBIDDEN_ROLE` (User başka bir `userId` denerse)
- *Audit event:* Yok (okuma)

**`GET /api/v1/wallets/:id`**
- *Yetki:* `User` (sahiplik kontrolü), `Admin` (salt-okunur)
- *Response:* `200` — cüzdan detay + `balances` + son 5 `chainMovement`
- *Hata kodları:* `RESOURCE_NOT_FOUND`, `FORBIDDEN_NOT_OWNER`
- *Audit event:* Yok

**`POST /api/v1/wallets/watch-only`**
- *Yetki:* `User`
- *Request:* `{ networkId: string, address: string }`
- *Response:* `201` — oluşturulan `Wallet`
- *Hata kodları:* `WALLET_ADDRESS_INVALID_FORMAT`, `NETWORK_ASSET_INACTIVE`, `409 WALLET_ADDRESS_ALREADY_EXISTS`
- *Audit event:* `WALLET_CREATED` (`metadata: { type: 'watch_only' }`)

**`POST /api/v1/wallets/managed`**
- *Yetki:* `User`
- *Request:* `{ networkId: string }`
- *Response:* `201` — oluşturulan `Wallet` (private key alanı hiçbir zaman döner, yalnızca `address` döner)
- *Hata kodları:* `NETWORK_ASSET_INACTIVE`
- *Audit event:* `WALLET_CREATED` (`metadata: { type: 'managed' }`)

### 5.3 Networks / Assets

**`GET /api/v1/networks`**
- *Yetki:* Authenticated (`User` | `Admin`)
- *Response:* `200` — `{ data: [{ id, name, chainType, chainId, confirmationThreshold }] }` (tüm ağlar; ağın kendisi aktif/pasif olmaz, yalnızca `(network, asset)` çifti pasifleşir)
- *Hata kodları:* —
- *Audit event:* Yok

**`GET /api/v1/networks/:networkId/assets`**
- *Yetki:* Authenticated
- *Request:* Query: `activeOnly?: boolean` (varsayılan `true` — `User` için UI her zaman yalnızca aktif olanları ister; `Admin` panelinden `false` geçilerek pasif çiftler de listelenir)
- *Response:* `200` — `{ data: [{ id, symbol, decimals, contractAddress, isActive }] }`
- *Hata kodları:* `RESOURCE_NOT_FOUND`
- *Audit event:* Yok

**`PATCH /api/v1/admin/network-assets/:networkId/:assetId`**
- *Yetki:* `Admin`
- *Request:* `{ isActive: boolean }`
- *Response:* `200` — güncellenmiş `NetworkAsset`
- *Hata kodları:* `FORBIDDEN_ROLE`, `RESOURCE_NOT_FOUND`
- *Audit event:* `NETWORK_ASSET_ACTIVATED` veya `NETWORK_ASSET_DEACTIVATED` (`metadata: { networkId, assetId }`)

### 5.4 Transfers

**`POST /api/v1/transfers`**
- *Yetki:* `User` (yalnızca kendi managed cüzdanı)
- *Request:* `{ walletId: string, toAddress: string, assetId: string, amount: string }` + header `Idempotency-Key: <uuid>` (bkz. §7)
- *Response:* `201` — oluşturulan `Transfer` (`state: 'draft'`)
- *Hata kodları:* `WALLET_NOT_MANAGED`, `FORBIDDEN_NOT_OWNER`, `WALLET_CROSS_NETWORK_MISMATCH`, `NETWORK_ASSET_INACTIVE`, `VALIDATION_FAILED` (geçersiz tutar formatı)
- *Audit event:* Yok (henüz zincire hiçbir şey gönderilmedi; `draft` oluşturma audit'e yazılmaz, yalnızca sonraki geçiş yazılır)

**`POST /api/v1/transfers/:id/confirm`**
- *Yetki:* `User` (sahiplik kontrolü)
- *Request:* `{ currentPassword: string }` — step-up authentication
- *Response:* `200` — `{ state: 'pending_signature' }`
- *Hata kodları:* `AUTH_STEP_UP_REQUIRED` (şifre yanlış), `TRANSFER_INVALID_TRANSITION` (transfer `draft` durumunda değilse), `WALLET_INSUFFICIENT_BALANCE`, `WALLET_CROSS_NETWORK_MISMATCH` (transfer oluşturulduktan sonra network_asset pasifleşmiş olabilir, burada tekrar kontrol edilir)
- *Audit event:* `TRANSFER_STATE_CHANGED` (`metadata: { fromState: 'draft', toState: 'pending_signature' }`) — aynı zamanda `transfer_state_events` tablosuna da yazılır

**`GET /api/v1/transfers`**
- *Yetki:* `User` (yalnızca kendi transferleri), `Admin` (`?userId=` ile herhangi bir kullanıcının transferleri, salt-okunur)
- *Request:* Query: `page`, `pageSize`, `walletId?`, `state?`
- *Response:* `200` — `{ data: [{ id, walletId, networkId, assetId, toAddress, amount, state, txHash, failureReason, createdAt, updatedAt }], pagination }`
- *Hata kodları:* `FORBIDDEN_ROLE`
- *Audit event:* Yok

**`GET /api/v1/transfers/:id`**
- *Yetki:* `User` (sahiplik), `Admin` (salt-okunur)
- *Response:* `200` — transfer detay + tam `transferStateEvents` listesi (denetim izi)
- *Hata kodları:* `RESOURCE_NOT_FOUND`, `FORBIDDEN_NOT_OWNER`
- *Audit event:* Yok

**`DELETE /api/v1/transfers/:id`**
- *Yetki:* `User` (sahiplik; yalnızca `draft` durumundaki kendi transferi)
- *Response:* `204`
- *Hata kodları:* `TRANSFER_ALREADY_TERMINAL` yerine burada spesifik olarak `409 TRANSFER_INVALID_TRANSITION` döner (yalnızca `draft` silinebilir, diğer terminal-olmayan durumlarda iptal yoktur), `FORBIDDEN_NOT_OWNER`
- *Audit event:* Yok

### 5.5 Movements / History

**`GET /api/v1/movements`**
- *Yetki:* `User` (yalnızca kendi cüzdanları)
- *Request:* Query: `page`, `pageSize`, `walletId?`, `networkId?`, `assetId?`, `direction?` (`incoming`|`outgoing`), `dateFrom?`, `dateTo?`, `state?`
- *Response:* `200` — `{ data: [{ source: 'chain'|'system', txHash, direction, amount, assetId, networkId, occurredAt, valueUsdtAtTime, state? }], pagination }`. `chain_movements` ve `transfers` tek zaman çizelgesinde `occurredAt`/`createdAt` ile birleştirilir; `confirmed` bir sistem transferi, aynı `txHash`'e sahip zincir hareketiyle eşleşip tek satıra indirgenir — `source: 'system'` olarak döner, `state` alanı yalnızca bu durumda doludur.
- *Hata kodları:* `VALIDATION_FAILED` (geçersiz tarih aralığı)
- *Audit event:* Yok

### 5.6 Portfolio

**`GET /api/v1/portfolio/summary`**
- *Yetki:* `User`
- *Response:* `200` — `{ totalValueUsdt: string, wallets: [{ walletId, networkId, assets: [{ assetId, symbol, balanceRaw, valueUsdt }] }] }`. `totalValueUsdt` `NUMERIC(38,18)` string temsili döner, asla JS `number` olarak serileştirilmez.
- *Hata kodları:* —
- *Audit event:* Yok

**`GET /api/v1/portfolio/history`**
- *Yetki:* `User`
- *Request:* Query: `dateFrom`, `dateTo`
- *Response:* `200` — `{ data: [{ timestamp, totalValueUsdt, priceSource }] }`; kayıtlar önceden yazılmış portföy snapshot'larından okunur, sorgu anında yeniden hesaplanmaz.
- *Hata kodları:* `VALIDATION_FAILED`
- *Audit event:* Yok

### 5.7 Notifications

**`GET /api/v1/notifications`**
- *Yetki:* `User`
- *Request:* Query: `page`, `pageSize`, `unreadOnly?: boolean`
- *Response:* `200` — `{ data: [{ id, type, payload, readAt, createdAt }], pagination, unreadCount }`. Frontend bu endpoint'i kısa aralıklarla (polling) periyodik çeker; websocket/SSE yoktur.
- *Hata kodları:* —
- *Audit event:* Yok

**`PATCH /api/v1/notifications/:id/read`**
- *Yetki:* `User` (sahiplik)
- *Response:* `200` — güncellenmiş `Notification`
- *Hata kodları:* `RESOURCE_NOT_FOUND`, `FORBIDDEN_NOT_OWNER`
- *Audit event:* Yok

### 5.8 Admin

**`GET /api/v1/admin/users`**
- *Yetki:* `Admin`
- *Request:* Query: `page`, `pageSize`, `email?` (kısmi, case-insensitive eşleşme)
- *Response:* `200` — `{ data: [{ id, email, role, createdAt }], pagination }`
- *Hata kodları:* `FORBIDDEN_ROLE`
- *Audit event:* Yok (okuma)
- *Not:* S-ADMIN-MINT'in kullanıcı arama alanının (`docs/06_SCREEN_CATALOG.md` S-ADMIN-MINT) bağımlı olduğu, daha önce hiçbir endpoint kataloğunda tanımlanmamış bir okuma endpoint'i — Faz 4 §4.4b'de (`POST /admin/mint` ile aynı iterasyonda, `admin/` modülü ilk oluşturulurken) eklenmiştir; Faz 4 §4.4c ekranı ve Faz 6'nın admin kullanıcı ekranları da bunu yeniden kullanır.

**`POST /api/v1/admin/mint`**
- *Yetki:* `Admin`
- *Request:* `{ walletId: string, assetId: string, amount: string }`
- *Response:* `201` — oluşturulan `MintOperation` (`txHash` mock kontrat işlemi sonucunda doldurulur)
- *Hata kodları:* `FORBIDDEN_ROLE`, `RESOURCE_NOT_FOUND` (cüzdan/varlık bulunamazsa), `CHAIN_PROVIDER_UNAVAILABLE`
- *Audit event:* `MINT_EXECUTED` (`metadata: { walletId, assetId, amount }`)

**`GET /api/v1/admin/audit-logs`**
- *Yetki:* `Admin`
- *Request:* Query: `page`, `pageSize`, `actorType?`, `actorId?`, `entityType?`, `action?`, `dateFrom?`, `dateTo?`
- *Response:* `200` — `{ data: [{ id, actorType, actorId, action, entityType, entityId, metadata, createdAt }], pagination }`
- *Hata kodları:* `FORBIDDEN_ROLE`
- *Audit event:* Yok (audit log'un kendisini okumak audit'e yazılmaz)

**`GET /api/v1/admin/users/:userId/wallets`** ve **`GET /api/v1/admin/users/:userId/transfers`**
- *Yetki:* `Admin` (salt-okunur)
- *Response:* §5.2 ve §5.4'teki liste endpoint'leriyle aynı şema; Admin'in herhangi bir kullanıcının verisini görüntülemesi için ayrı bir path yerine `?userId=` query parametresi de kabul edilir — bu iki endpoint, aynı işlevi path-parametreli biçimde sunan alternatif bir erişim yoludur ve Admin panelinin kullanıcı detay ekranında tercih edilir.
- *Hata kodları:* `FORBIDDEN_ROLE`, `RESOURCE_NOT_FOUND`
- *Audit event:* Yok

---

## 6. Rate Limit ve Kota Kuralları

NestJS `@nestjs/throttler` kullanılır; eşikler config'den okunur.

| Endpoint grubu | Eşik | Anahtar |
| --- | --- | --- |
| `POST /auth/login` | 5 istek / 15 dakika | `IP + email` bileşik anahtarı (brute-force koruması) |
| `POST /auth/register` | 3 istek / saat | `IP` |
| `POST /transfers`, `POST /transfers/:id/confirm` | 10 istek / dakika | `userId` |
| `POST /admin/mint` | 20 istek / dakika | `adminId` |
| Diğer tüm authenticated endpoint'ler | 100 istek / dakika | `userId` |

Eşik aşıldığında `429 RATE_LIMIT_EXCEEDED` döner, yanıt `Retry-After` header'ı taşır. Login eşiği aşıldığında ayrıca `LOGIN_FAILED` audit kaydı `metadata: { reason: 'rate_limited' }` ile yazılır (bu da §5.1'deki sıralama notuna tabidir — `audit_logs` Faz 2'de gelir, Faz 1'de bu kayıt atlanır). RPC/Alchemy/TronGrid gibi dış sağlayıcı çağrıları için ayrı bir merkezi rate-limiter (BullMQ concurrency limiti / `bottleneck`) kullanılır; bu, worker katmanının iç mimarisidir, dışa açık bir API kotası değildir ve bu doküman kapsamında endpoint bazlı bir kural olarak tanımlanmaz.

---

## 7. Idempotency ve Retry Semantiği

**Client-tarafı idempotency:** `POST /api/v1/transfers` çağrısı zorunlu bir `Idempotency-Key` header'ı (istemcinin ürettiği UUID) taşır. Backend, aynı `(userId, idempotencyKey)` çiftiyle daha önce başarılı bir istek işlendiyse, yeni bir kayıt oluşturmak yerine mevcut `Transfer` kaydını `200` ile döner (yeni oluşturmada olduğu gibi `201` değil). Bu, form çift gönderimi veya ağ kesintisi sonrası istemci retry'ının aynı transferi iki kez oluşturmasını engeller. Anahtar 24 saat saklanır, sonrasında yeniden kullanılabilir.

**Sunucu-tarafı (worker) idempotency:** İmzalama, broadcast ve confirmation worker'ları `(transferId, targetState)` veya `(chain, txHash)` bileşik anahtarıyla idempotent çalışır; BullMQ job id bu anahtardan türetilir. Terminal durum kuralı (bir transfer `confirmed`/`failed`/`dropped` olduktan sonra hiçbir geçiş kabul edilmez) sayesinde bir job'un yanlışlıkla iki kez işlenmesi yan etkisizdir.

**Retry semantiği:** RPC/Alchemy/TronGrid çağrılarında exponential backoff uygulanır (1s, 2s, 4s... maksimum 5 deneme), BullMQ'nun yerleşik retry stratejisi kullanılır. İstemciye dönük API endpoint'lerinde otomatik sunucu-tarafı retry yoktur — bir istek başarısız olursa istemci aynı `Idempotency-Key` ile yeniden dener (yalnızca `POST /transfers` için) veya `429`/`502` durumunda `Retry-After` header'ına göre bekler.

---

## 8. Webhook / Callback Sözleşmeleri

**`POST /api/v1/webhooks/alchemy`** — yalnızca EVM ağları (Sepolia, BSC Testnet) için gelen transfer tespiti.
- *Yetki:* Public endpoint, ancak Alchemy'nin gönderdiği `X-Alchemy-Signature` header'ı, paylaşılan bir imza anahtarıyla HMAC doğrulamasından geçer; imza uyuşmazsa `401` döner ve istek işlenmez.
- *Request:* Alchemy'nin `Address Activity` webhook payload formatı (harici sağlayıcı şeması; sabit değildir, sağlayıcı sözleşmesine göre yorumlanır).
- *Response:* `200` — boş gövde (Alchemy yalnızca 2xx bekler)
- *Davranış:* Payload'daki her hareket için, ilgili cüzdan sistemde kayıtlıysa bir `ChainMovement` kaydı oluşturulur ve `INCOMING_TRANSFER_DETECTED` bildirim tetiklenir; kayıtlı olmayan bir adrese gelen hareket yok sayılır.
- *Hata kodları:* `401` (imza doğrulama başarısız)
- *Audit event:* Yok (worker kaynaklı yüksek frekanslı teknik olay)

**Tron Shasta için webhook yoktur** — TronGrid webhook desteği sunmadığından, gelen transfer tespiti polling worker'ı ile yapılır (dışa açık bir callback endpoint'i gerektirmez, bu nedenle bu doküman kapsamında ayrı bir sözleşme tanımlanmaz).

---

## 9. SLA ve Performans Hedefleri

Vault yayına alınmayacak, gerçek kullanıcı trafiği olmayan bir demo/portföy projesi olduğundan sert bir SLA taahhüdü (uptime yüzdesi, p99 gecikme garantisi) tanımlanmaz — bu, ölçeğin gerektirmediği bir operasyonel yük olur. Bununla birlikte iki pratik hedef gözetilir:

- Tüm `GET` endpoint'leri, DB önbelleğinden okuduğu için (sayfa yüklemesinde asla canlı RPC çağrısı yapılmaz), lokal geliştirme ortamında **200ms altında** yanıt verir.
- `POST /transfers/:id/confirm` gibi imzalama kuyruğuna iş bırakan endpoint'ler senkron olarak yalnızca doğrulama adımlarını (bakiye, cross-network guard) çalıştırır ve hemen döner; asıl imzalama/broadcast/confirmation süreci asenkron worker'larda ilerler, bu nedenle bu endpoint'in kendisi de hızlı yanıt verir — zincirin kendi onay süresi (blok süresi × eşik) bu hedefin dışındadır ve ağın doğasına bağlıdır.
