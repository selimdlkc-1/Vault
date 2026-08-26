### İterasyon 4 — Cüzdan Okuma Endpoint'leri (§3.4a)

**Hedef:** `GET /wallets`, `GET /wallets/:id` `docs/03` §5.2 ile birebir çalışır — her cüzdanın varlık bazlı bakiyeleri (`balance_caches`) ve her birinin USDT karşılığı (İterasyon 3'ün fiyat cache'inden türetilen `ETH/USDT = (ETH/USD) ÷ (USDT/USD)` formülüyle) döner; bu formülün ilk gerçek implementasyonu burada kurulur ve İterasyon 5'te portföy toplamında yeniden kullanılır.

**Teslim çıktısı:**
- `apps/api/src/common/usdt-conversion.util.ts` (+ `.spec.ts`)
- `wallets.controller.ts`/`wallets.service.ts`/`wallets.repository.ts` güncellemesi (`GET /wallets`, `GET /wallets/:id`)

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam (`balance_caches` doluyor)
- [ ] İterasyon 3 Stop tamam (fiyat cache'i doluyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.4 — kapsam (a/b bölünme notu)
2. `docs/03_API_CONTRACTS.md` §5.2 `GET /wallets`, `GET /wallets/:id` — response şekli, `?userId=` ile Admin salt-okunur erişimi
3. `docs/04_BACKEND_SPEC.md` §4 Middleware Zinciri madde 6 (Ownership guard — `User` yalnızca kendi cüzdanı, `Admin` muaf)
4. `docs/mimari-kararlar.md` P-014 (USDT hesaplama formülü)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/wallet-read-endpoints` branch'i aç.
2. `common/usdt-conversion.util.ts`: `calculateUsdtValue(balanceRaw: string, decimals: number, assetSymbol: string, priceCache: PriceCacheService): Promise<string>` — `assetSymbol` fiyatını ve `USDT` fiyatını `PriceCacheService.get()`'ten okur, `(assetUsd / usdtUsd) * (balanceRaw / 10^decimals)` hesaplar, sonucu string olarak döner (asla `number`); ikisinden biri cache'te yoksa (worker henüz ilk turunu atmamış) `null` döner — çağıran taraf bunu UI'da "—" olarak göstermeye bırakır, hata fırlatmaz.
3. `wallets.repository.ts`: `findByUserId(userId, { page, pageSize, networkId?, type? })` ve `findById(walletId)` — her ikisi de `balance_caches` join'iyle döner (Prisma `include`).
4. `wallets.service.ts`: `listWallets(requesterId, requesterRole, { userId?, ...filters })` — `Admin` + `?userId=` ise o kullanıcının cüzdanları, `User` ise yalnızca kendi `userId`'si (başka `userId` denerse `FORBIDDEN_ROLE`); her cüzdanın `balances` listesini `calculateUsdtValue` ile zenginleştirir. `getWalletById(requesterId, requesterRole, walletId)` — sahiplik kontrolü (`Admin` muaf, `User` değilse `FORBIDDEN_NOT_OWNER`), bulunamazsa `RESOURCE_NOT_FOUND`; ayrıca son 5 `chainMovement` döner (İterasyon 8 tamamlanana kadar bu alan boş dizi döner — `chain_movements` tablosu henüz yok, `wallets.repository.ts` bu join'i şimdilik atlar ve bir TODO/yorum bırakır, İterasyon 8 bunu doldurur).
5. `wallets.controller.ts`: `GET /wallets` (query: `page`, `pageSize`, `networkId?`, `type?`, `userId?`), `GET /wallets/:id` (`ParseUUIDPipe`).
6. Unit test (`usdt-conversion.util`): normal hesap, sıfır bakiye, fiyat cache'te yoksa `null`. Unit test (`wallets.service`): `Admin`+`userId` filtresi, `User` başka `userId` denerse `FORBIDDEN_ROLE`, sahiplik olmayan `getWalletById` çağrısı `FORBIDDEN_NOT_OWNER`. Integration test: `200` happy path (İterasyon 1'in seed watch-only cüzdanıyla), `404`, `403`.
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `common/usdt-conversion.util.ts` (+`.spec.ts`) |
| Güncelle | `wallets/wallets.controller.ts`, `wallets.service.ts`, `wallets.repository.ts` (+ mevcut `.spec.ts` dosyaları) |
| Dokunma | `GET /portfolio/summary` (İterasyon 5 — kendi toplam hesaplamasını yapar ama bu util'i yeniden kullanır), `chainMovements` alanının gerçek verisi (İterasyon 8) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `ETH/USDT = (ETH/USD) ÷ (USDT/USD)` | `mimari-kararlar` P-014 | `usdt-conversion.util.ts` |
| `User` yalnızca kendi cüzdanı, `Admin` `?userId=` ile herhangi biri | `docs/03` §5.2 | `WalletsService.listWallets` rol dallanması |
| Sahiplik olmayan cüzdana erişim `403 FORBIDDEN_NOT_OWNER` | `docs/03` §3, `docs/08` senaryo #5 | `getWalletById` sahiplik kontrolü |

**Kalite kapıları:**
- [ ] Unit test: `usdt-conversion.util` (normal + fiyat eksik senaryosu)
- [ ] Unit test: `WalletsService` rol/sahiplik dallanmaları
- [ ] Integration test: `200`/`404`/`403` (senaryo #5 regresyonu)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `GET /portfolio/summary`/`GET /portfolio/history` (İterasyon 5), `chainMovements` alanının gerçek verisi (İterasyon 8'e kadar boş dizi).

**Risk / dikkat:** `calculateUsdtValue`'nun fiyat eksikliğinde `null` dönmesi bilinçli bir tasarımdır — worker henüz çalışmamışsa (ör. sistem yeni ayağa kalktı) endpoint hata fırlatmamalı, frontend bunu "—" olarak göstermelidir; bu davranış İterasyon 6/7'nin UX beklentisiyle uyumlu olmalıdır.

**Stop:**
- [ ] `pnpm --filter api test -- wallets`
- [ ] PR/onay → İterasyon 5
