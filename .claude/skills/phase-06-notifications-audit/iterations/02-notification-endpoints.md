### İterasyon 2 — Bildirim Endpoint'leri (§6.2a)

**Hedef:** `GET /notifications` (sayfalama + `unreadOnly` filtresi + `unreadCount`) ve `PATCH /notifications/:id/read` (sahiplik kontrolü) çalışıyor.

**Teslim çıktısı:**
- `notifications.controller.ts` + `dto/list-notifications.dto.ts`
- `notifications.service.ts` genişletmesi: `list(userId, query)`, `markRead(userId, id)`
- `notifications.repository.ts` genişletmesi: `findByUser`, `countUnread`, `markRead`
- Integration test

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (`notifications` tablosu + `notify()` var)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §6.2 — kapsam ve a/b bölünme notu
2. `docs/03_API_CONTRACTS.md` §5.7 Notifications — `GET`/`PATCH` tam sözleşme, hata kodları
3. `docs/04_BACKEND_SPEC.md` §4 Middleware Zinciri — `OwnershipGuard` (bu endpoint'te path param yok; sahiplik kontrolü servis/repository katmanında `WHERE user_id` ile sağlanır, ayrı bir guard eklenmez)
4. `docs/03_API_CONTRACTS.md` §6 Rate Limit — "diğer tüm authenticated endpoint'ler" varsayılan eşiği (100/dk/`userId`)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/notification-endpoints` branch'i aç.
2. `packages/types/src/schemas/notification.schema.ts`: `listNotificationsQuerySchema = z.object({ page, pageSize, unreadOnly: z.boolean().optional() })`.
3. `notifications.repository.ts`: `findByUser(userId, {page, pageSize, unreadOnly})`, `countUnread(userId)`, `markRead(userId, id)` — sahiplik `WHERE user_id = userId` sorguya gömülür; `markRead` kayıt yoksa/başka kullanıcıya aitse `null` döner (servis katmanında hata koduna çevrilir).
4. `notifications.service.ts`: `list()` → `{data, pagination, unreadCount}`; `markRead()` → repository `null` dönerse önce var mı diye ayrıca `findById` ile kontrol edip yoksa `RESOURCE_NOT_FOUND`, başkasına aitse `FORBIDDEN_NOT_OWNER` fırlatır (`docs/04` §6 domain exception kalıbı).
5. `notifications.controller.ts`: `GET /notifications` (herhangi authenticated `User`; `Admin` de kendi hesabının bildirimlerini görebilir, rol kısıtı yok), `PATCH /notifications/:id/read` (`@Param('id', ParseUUIDPipe)`).
6. `NotificationsModule`'ü `app.module.ts`'e bağla (İterasyon 1'de eklenmemişse).
7. Integration test: `GET /notifications` sayfalama + `unreadOnly` filtresi + `unreadCount` doğruluğu; `PATCH /notifications/:id/read` happy path + başka kullanıcının bildirimine erişim denemesi `403`.
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `notifications/notifications.controller.ts`, `notifications/dto/list-notifications.dto.ts`, `packages/types/src/schemas/notification.schema.ts`, ilgili `.spec.ts` |
| Güncelle | `notifications.service.ts`, `notifications.repository.ts`, `app.module.ts` (henüz değilse) |
| Dokunma | `confirmation.processor.ts`, `movement-index` worker (İterasyon 1'de tamamlandı) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `GET /notifications` response şekli | `docs/03` §5.7 | `{data, pagination, unreadCount}` |
| `PATCH` sahiplik | `docs/03` §5.7 | `RESOURCE_NOT_FOUND` / `FORBIDDEN_NOT_OWNER` |
| `unreadOnly` filtresi | `docs/03` §5.7 | query param, repository `WHERE read_at IS NULL` |
| Rate limit | `docs/03` §6 | varsayılan 100/dk/`userId` (özel satır yok) |

**Kalite kapıları:**
- [ ] Integration: `GET /notifications` sayfalama + `unreadCount`
- [ ] Integration: `PATCH /notifications/:id/read` happy path
- [ ] Deny: başka kullanıcının bildirimini okuma denemesi → `403 FORBIDDEN_NOT_OWNER` (`docs/08` §4 madde 5)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** S-NOTIFICATIONS ekranı (İterasyon 3); toplu "tümünü okundu işaretle" backend endpoint'i (bkz. Risk — sözleşme genişletilmez).

**Risk / dikkat:** `docs/03` §5.7'de ayrı bir toplu "tümünü okundu işaretle" endpoint'i tanımlı **değildir** — S-NOTIFICATIONS ekranındaki (`docs/06` §5.2) bu aksiyon, İterasyon 3'te frontend'in listedeki her okunmamış bildirim için tek tek `PATCH` çağırmasıyla (`Promise.all`) karşılanır; burada yeni bir backend endpoint icat edilmez.

**Stop:**
- [ ] `pnpm --filter api test -- notifications`
- [ ] lint/typecheck yeşil
- [ ] PR/onay → İterasyon 3
