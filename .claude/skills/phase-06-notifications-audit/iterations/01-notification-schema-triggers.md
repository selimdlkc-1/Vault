### İterasyon 1 — Bildirim Şeması + Worker Tetikleyicileri (§6.1)

**Hedef:** `notifications` tablosu migration ile kuruldu; `confirmation` worker `confirmed`/`failed` geçişlerinde, `movement-index` worker (webhook + Tron polling) gelen transfer tespitinde `NotificationsService.notify()` çağırıyor; üç `notification_type` (`tx_confirmed`, `tx_failed`, `incoming_transfer_detected`) unit testle doğrulanmış.

**Teslim çıktısı:**
- `notifications` tablosu migration'ı (`notification_type` enum)
- `apps/api/src/notifications/{notifications.module.ts, notifications.service.ts, notifications.repository.ts}` (+ `.spec.ts`) — yalnızca yazma/iç API bu iterasyonda (controller İterasyon 2'de)
- `confirmation.processor.ts` güncellemesi: `confirmed`/`failed` geçişinde bildirim
- `movement-index` worker güncellemesi: `incoming` yönlü yeni hareket tespitinde bildirim

**Önkoşullar:**
- [ ] Faz 5'in tüm alt maddeleri tamam (`confirmation` worker `confirmed`/`failed`/`dropped`'a geçiyor)
- [ ] Faz 3 §3.6a'nın `movement-index` worker'ı (Alchemy webhook + Tron polling) çalışır durumda

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §6.1 — kapsam
2. `docs/01_DOMAIN_MODEL.md` §2.9 Notification — sorumluluk/sahiplik/yaşam döngüsü, §3 `User 1──N Notification` ilişkisi
3. `docs/02_DATABASE_SCHEMA.md` §2.10 `notifications` — kolon listesi, `notification_type` enum, `notifications_user_id_read_at_idx` index
4. `docs/04_BACKEND_SPEC.md` §2 Klasör Yapısı (`notifications/` modülü), §8 Background Job/Worker Kalıbı — `confirmation`/`movement-index` kuyruklarının mevcut tetikleyicileri
5. `docs/mimari-kararlar.md` N-002 (tetikleyici olaylar), N-004 (data modeli)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/notification-schema-triggers` branch'i aç.
2. `add-prisma-migration` prosedürüyle `notification_type` enum (`tx_confirmed`, `tx_failed`, `incoming_transfer_detected`) ve `notifications` tablosu (`user_id`, `type`, `payload JSONB`, `read_at` nullable, `created_at`) + `notifications_user_id_read_at_idx` index ekle — `docs/02` §2.10 birebir.
3. `notifications.repository.ts`: `create(userId, type, payload)` — yalnızca insert; bu iterasyonda okuma metodu yok (İterasyon 2'de eklenir).
4. `notifications.service.ts`: `notify(userId, type, payload)` ince bir wrapper; `NotificationsModule` bu servisi `exports` eder ki `TransfersModule`/`workers` altındaki processor'lar DI ile enjekte edebilsin (`docs/04` §3 modül kayıt kalıbı).
5. `confirmation.processor.ts`: transfer `confirmed` olduğunda `notify(transfer.userId, 'tx_confirmed', { transferId, txHash, amount })`; `failed` olduğunda `notify(..., 'tx_failed', { transferId, failureReason })`; `dropped`'ta bildirim **yok** (roadmap §6.1 yalnızca `tx confirmed`/`tx failed`/`incoming transfer`'i listeler — bilinçli kapsam sınırı, bkz. Risk).
6. `movement-index` worker (Alchemy webhook handler'ı ve Tron polling worker'ı, Faz 3 §3.6a): kayıtlı bir cüzdana gelen (`direction: 'incoming'`) yeni bir `chain_movement` tespit edildiğinde `notify(wallet.userId, 'incoming_transfer_detected', { walletId, txHash, amount })` — `docs/03` §8 webhook sözleşmesindeki `INCOMING_TRANSFER_DETECTED` notunun karşılığı.
7. Unit test: `NotificationsService.notify` insert doğrulaması; `confirmation.processor.spec.ts`'e `confirmed`/`failed`'da `notify` çağrıldığının, `dropped`'ta çağrılmadığının testi; `movement-index` worker testine `incoming` hareket tespitinde `notify` çağrıldığının testi.
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `notifications/{notifications.module.ts, notifications.service.ts, notifications.repository.ts}` (+`.spec.ts`) |
| Güncelle | `schema.prisma`, `app.module.ts`, `confirmation.processor.ts` (+`.spec.ts`), `movement-index` worker dosyası (+`.spec.ts`) |
| Dokunma | `notifications.controller.ts`, `dto/` (İterasyon 2) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `notification_type` 3 değer | `docs/02` §2.10 | enum `tx_confirmed`/`tx_failed`/`incoming_transfer_detected` |
| Tetikleyici olaylar | `mimari-kararlar` N-002 | `confirmed`/`failed`/`incoming` — `dropped` hariç |
| Data modeli | `mimari-kararlar` N-004 | `userId, type, payload json, readAt nullable` |
| Worker idempotency bozulmaz | `docs/04` §8 | `notify()` bir state geçişi değil, yan etkidir; worker'ın `(transferId, targetState)`/`(chain, txHash)` idempotency anahtarını etkilemez |

**Kalite kapıları:**
- [ ] Unit: `NotificationsService.notify` insert
- [ ] Unit: `confirmation.processor` — `confirmed`/`failed` → `notify` çağrılır, `dropped` → çağrılmaz
- [ ] Unit: `movement-index` worker — `incoming` tespitinde `notify` çağrılır
- [ ] `pnpm --filter api exec prisma migrate dev` hatasız
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `GET/PATCH /notifications` endpoint'leri, S-NOTIFICATIONS ekranı (İterasyon 2/3); `dropped` durumunda bildirim (roadmap kapsamı dışı).

**Risk / dikkat:** `notify()` çağrısı worker'ın ana state geçiş transaction'ına dahil edilmez — `confirmation` worker'ın `$transaction` bloğu yalnızca `transfers.state` + `transfer_state_events` + `audit_logs` yazar (`docs/04` §7); bildirim yazımı bu transaction'dan sonra, ayrı bir insert olarak yapılır çünkü `notifications` audit amaçlı değildir (`docs/02` §2.10 dipnotu, `notifications.user_id → users.id CASCADE` — denetim amaçlı değil) ve worker'ın kritik state geçişi bildirim yazım hatasına bağımlı kılınmaz — bildirim insert'i başarısız olsa bile transfer state geçişi geri alınmaz, yalnızca loglanır.

**Stop:**
- [ ] `pnpm --filter api test -- notifications`
- [ ] `pnpm --filter api test -- confirmation`
- [ ] PR/onay → İterasyon 2
