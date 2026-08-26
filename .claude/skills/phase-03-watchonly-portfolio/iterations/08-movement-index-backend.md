### İterasyon 8 — Movement-index Backend: Şema + Webhook + Tron Polling + `GET /movements` (§3.6a)

**Hedef:** `chain_movements` tablosu oluşur; Alchemy webhook alıcı endpoint'i (EVM, imza doğrulamalı) ve Tron polling worker'ı zincir hareketlerini indexler; `GET /movements` bunları filtrelenebilir şekilde listeler — bu fazda yalnızca `source: 'chain'` döner (`transfers` tablosu Faz 5'e kadar yoktur).

**Teslim çıktısı:**
- `chain_movements` migration (+ `movement_direction` enum)
- `apps/api/src/movements/{movements.module.ts, movements.controller.ts, movements.service.ts, movements.repository.ts}` (+ `.spec.ts`)
- `apps/api/src/movements/webhooks/alchemy-webhook.controller.ts` (+ `.spec.ts`)
- `apps/api/src/workers/movement-index/{movement-index.module.ts, tron-movement-poll.processor.ts}` (+ `.spec.ts`)

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam (worker altyapı kalıbı kurulu)
- [ ] İterasyon 4 Stop tamam (`wallets.repository.ts`'teki `chainMovements` alanı bu iterasyonda doldurulacak)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.6 — kapsam (a) kısmı ve `transfers` henüz yok notu
2. `docs/02_DATABASE_SCHEMA.md` §2.9 `chain_movements` — tam şema, `(wallet_id, tx_hash, direction)` UNIQUE
3. `docs/03_API_CONTRACTS.md` §5.5 `GET /movements`, §8 `POST /webhooks/alchemy` (imza doğrulama, davranış, hata kodu)
4. `docs/mimari-kararlar.md` W-006/W-007 (birleşik hareket listesi kararı — bu fazda yalnızca zincir tarafı), I-002 (Alchemy webhook EVM, TronGrid polling Tron)
5. `docs/04_BACKEND_SPEC.md` §4 Middleware Zinciri (madde 9 notu — `@Public()` yalnızca register/login/refresh/Alchemy webhook), §10 (`ALCHEMY_WEBHOOK_SIGNING_KEY`, `TRONGRID_API_KEY`)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/movement-index-backend` branch'i aç.
2. `add-prisma-migration` prosedürüyle `chain_movements` tablosunu (+ `movement_direction` enum: `incoming`\|`outgoing`) `docs/02` §2.9 birebir ekle.
3. `movements/movements.repository.ts`: `create(data)` (tekilleştirme için `(wallet_id, tx_hash, direction)` UNIQUE'e güvenir, çakışmada sessizce atlar — idempotent indexleme), `findByFilters(userId, { page, pageSize, walletId?, networkId?, assetId?, direction?, dateFrom?, dateTo? })`, `findRecentByWallet(walletId, limit)` (İterasyon 4'ün `wallets.repository`'sindeki boş `chainMovements` alanını doldurmak için `WalletsModule` bu servisi `imports`+`exports` yoluyla kullanır — `docs/04` §3 modül izolasyon kuralı).
4. `movements/movements.service.ts`: `listMovements(userId, filters)` — yalnızca `source: 'chain'` satırları döner (`docs/03` §5.5 şekli, `state` alanı `undefined`); geçersiz tarih aralığında `VALIDATION_FAILED`.
5. `movements/movements.controller.ts`: `GET /movements` (`User`, yalnızca kendi cüzdanları — `userId` sahiplik filtresi serviste zorlanır).
6. `movements/webhooks/alchemy-webhook.controller.ts`: `POST /webhooks/alchemy` — `@Public()`; `X-Alchemy-Signature` header'ını `ALCHEMY_WEBHOOK_SIGNING_KEY` ile HMAC doğrular (uyuşmazsa `401`, işlem yapılmaz); payload'daki her hareket için ilgili `wallet` adresle eşleşiyorsa `MovementsService`'in `indexChainMovement()` metodunu çağırır (kayıtlı olmayan adrese gelen hareket yok sayılır — `docs/03` §8); bildirim tetikleme **yapılmaz** (Faz 6 §6.1).
7. `workers/movement-index/tron-movement-poll.processor.ts`: periyodik (İterasyon 2'nin worker kalıbı), TronGrid'in TRC-20 transfer endpoint'ini watch-only+ilerideki managed cüzdan adresleri için tarar, yeni hareketleri `MovementsService.indexChainMovement()` ile yazar; job idempotency `(walletId, txHash, direction)` bileşik anahtarıyla (`docs/04` §8).
8. `workers/movement-index/movement-index.module.ts`: `BullModule.registerQueue({ name: 'movement-index' })`, webhook controller de bu modülde yaşar (ayrı bir `webhooks/` üst modülü açılmaz — tek kaynağı EVM olduğundan `MovementsModule`'ün bir alt parçasıdır).
9. Unit test (`movements.service`): filtre kombinasyonları, `source: 'chain'` sabitliği, tarih validasyonu. Unit test (`alchemy-webhook.controller`): geçerli/geçersiz imza (senaryo benzeri — imza doğrulama). Unit test (`tron-movement-poll.processor`): mock TronGrid yanıtıyla doğru insert + tekilleştirme (aynı tx_hash iki kez yazılmaz). Integration test: `GET /movements` `200`, filtre.
10. `wallets.repository.ts`'teki (İterasyon 4) boş `chainMovements` alanı `MovementsModule`'ün `findRecentByWallet`'ı ile doldurulur.
11. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `movements/{movements.module.ts, movements.controller.ts, movements.service.ts, movements.repository.ts}` (+`.spec.ts`), `movements/webhooks/alchemy-webhook.controller.ts` (+`.spec.ts`), `workers/movement-index/{movement-index.module.ts, tron-movement-poll.processor.ts}` (+`.spec.ts`) |
| Güncelle | `schema.prisma`, `apps/api/src/app.module.ts`, `wallets/wallets.module.ts` (MovementsModule import), `wallets/wallets.repository.ts` (İterasyon 4'teki boş alanı doldur) |
| Dokunma | `source: 'system'` birleşimi, `state` alanının doldurulması (Faz 5), bildirim tetikleme (Faz 6 §6.1) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `X-Alchemy-Signature` HMAC doğrulama, uyuşmazsa `401` | `docs/03` §8 | `alchemy-webhook.controller.ts`, işlem imza doğrulanmadan yapılmaz |
| Kayıtlı olmayan adrese gelen hareket yok sayılır | `docs/03` §8 | `MovementsService.indexChainMovement` cüzdan bulunamazsa sessizce çıkar |
| `(wallet_id, tx_hash, direction)` tekilleştirme | `docs/02` §2.9 | UNIQUE constraint + idempotent insert |
| `GET /movements` bu fazda yalnızca `source: 'chain'` | `docs/10` §3.6 notu | `transfers` tablosu yok, birleşim Faz 5'te |

**Kalite kapıları:**
- [ ] Unit test: `movements.service` filtre/validasyon, webhook imza doğrulama, Tron polling tekilleştirme
- [ ] Integration test: `GET /movements` `200`
- [ ] `pnpm --filter api exec prisma migrate dev` hatasız
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `transfers` ile birleşim/tekilleştirme (Faz 5 §5.1 sonrası), bildirim tetikleme (`INCOMING_TRANSFER_DETECTED`, Faz 6 §6.1), S-MOVEMENTS frontend'i (İterasyon 9).

**Risk / dikkat:** Alchemy webhook'unun `@Public()` olması — imza doğrulaması olmadan bu endpoint dışarıdan tetiklenebilir bir yazma yoludur; HMAC kontrolünün **her zaman** ilk adım olması ve doğrulanmadan hiçbir DB yazımı yapılmaması code review'da özellikle kontrol edilmeli (`docs/07` güvenlik taban kontrolü — state değiştiren her yol korunmalı). Tron polling'in tarama aralığı, TronGrid rate limit'ine (İterasyon 2/3'te kurulan merkezi rate-limiter kalıbı) tabidir.

**Stop:**
- [ ] `pnpm --filter api test -- movements`
- [ ] `pnpm --filter api test -- movement-index`
- [ ] PR/onay → İterasyon 9
