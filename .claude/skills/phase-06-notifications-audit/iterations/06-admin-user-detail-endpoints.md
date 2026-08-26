### İterasyon 6 — Admin Kullanıcı Detay Endpoint'leri (§6.4a)

**Hedef:** `GET /admin/users/:userId/wallets` ve `GET /admin/users/:userId/transfers` çalışıyor — Faz 3 §3.4a'nın/Faz 5'in mevcut `?userId=` mantığını yeniden kullanan path-param alias'ları; private key hiçbir yanıtta dönmüyor (testle kanıtlı).

**Teslim çıktısı:**
- `admin` modülünde iki yeni controller metodu (path-param alias)
- Faz 3 §3.4a `WalletsService` ve Faz 5 `TransfersService`'in mevcut Admin-farkında liste metodlarının yeniden kullanımı — yeni servis mantığı yazılmaz

**Önkoşullar:**
- [ ] Faz 3 §3.4a `GET /wallets?userId=` ve Faz 5 `GET /transfers?userId=` çalışır durumda

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §6.4 — kapsam, path-param/query-param alternatif olma notu, a/b bölünme notu
2. `docs/03_API_CONTRACTS.md` §5.8 `GET /admin/users/:userId/{wallets,transfers}` — "aynı işlevi path-parametreli biçimde sunan alternatif" notu
3. `docs/03_API_CONTRACTS.md` §5.2/§5.4 — orijinal query-param endpoint'lerin tam response şeması (birebir aynısı döner)
4. `docs/04_BACKEND_SPEC.md` §1 Katman Mimarisi — controller'ın servise ince bir katman olarak kalması kuralı (bu iterasyon yeni iş mantığı yazmaz)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/admin-user-detail-endpoints` branch'i aç.
2. `admin.controller.ts` (veya `admin-users.controller.ts`): `GET /admin/users/:userId/wallets` — `@Roles('admin')`, `@Param('userId', ParseUUIDPipe)`; içeride doğrudan `WalletsService`'in `?userId=` için zaten kullandığı aynı metod (Faz 3 §3.4a) çağrılır — yeni bir servis metodu yazılmaz, yalnızca controller path'i farklıdır.
3. Aynı şekilde `GET /admin/users/:userId/transfers` — `TransfersService`'in `?userId=` için kullandığı metodu path param ile çağırır.
4. Sahiplik/rol: bu iki endpoint zaten `@Roles('admin')` olduğundan `OwnershipGuard` uygulanmaz (`docs/04` §4 madde 6, Admin muafiyeti) — `:userId` path param'ı hedef kullanıcıyı belirtir, isteği yapan Admin'in kendi id'si değildir.
5. `userId` için `RESOURCE_NOT_FOUND`: kullanıcı yoksa (silinmiş/geçersiz id) `404` döner — bu kontrol controller'da hafif bir varlık kontrolü (`UsersService.exists` benzeri, Faz 1'den mevcutsa) ile eklenir; ayrı bir yeni servis mantığı icat edilmez, mevcut kullanıcı sorgusu tüketilir.
6. Unit/integration test: private key alanının (`encryptedPrivateKey`/`encryptedDek`) response'ta hiçbir zaman yer almadığının doğrulanması (mevcut `WalletsService` serialization'ının regresyon testi — yeni bir serialization yazılmaz); `User` rolüyle erişim `403`.
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | ilgili `.spec.ts` (controller + regresyon testi) |
| Güncelle | `admin.controller.ts` (veya `admin-users.controller.ts`), `admin.module.ts` (`WalletsModule`/`TransfersModule` import, yalnızca `exports` edilen servisler tüketilir) |
| Dokunma | `wallets.service.ts`, `transfers.service.ts` (yalnızca mevcut metodları tüketilir, değiştirilmez) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Path-param = query-param alternatifi | `docs/03` §5.8 | aynı servis metodu, farklı controller path'i |
| Private key hiçbir yanıtta yok | Faz 4 §4.2 testinin regresyonu | mevcut serialization'ın yeniden test edilmesi |
| Admin-only, ownership guard muaf | `docs/04` §4 madde 6 | `@Roles('admin')` yeterli, `OwnershipGuard` uygulanmaz |

**Kalite kapıları:**
- [ ] Integration: `GET /admin/users/:userId/wallets` + `/transfers` happy path
- [ ] Deny: `User` rolüyle erişim → `403 FORBIDDEN_ROLE`
- [ ] Regresyon: private key alanı response'ta yok
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** S-ADMIN-USER-DETAIL ekranı (İterasyon 7); yeni bir `WalletsService`/`TransfersService` iş mantığı (roadmap notu — sıfırdan yazılmaz).

**Risk / dikkat:** Bu iterasyonun tuzağı "kolay görünüyor, yeni bir servis yazayım" dürtüsüdür — roadmap §6.4 notu açıkça mevcut mantığın yeniden kullanılmasını ister; controller'da iş kuralı (`docs/04` §1) yazılmaz, yalnızca path param'dan mevcut query-param mantığına köprü kurulur.

**Stop:**
- [ ] `pnpm --filter api test -- admin-users`
- [ ] lint/typecheck yeşil
- [ ] PR/onay → İterasyon 7
