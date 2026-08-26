### İterasyon 2 — Cross-network Guard + Step-up Auth (§5.2)

**Hedef:** `POST /transfers/:id/confirm` çalışıyor — şifre tekrarı (step-up), cross-network guard, `(network, asset)` aktiflik kontrolü ve bakiye yeterliliği geçilmeden `draft → pending_signature` geçişi gerçekleşmiyor; her kontrolün negatif senaryosu testle kanıtlı.

**Teslim çıktısı:**
- `transfers.controller.ts` → `POST /transfers/:id/confirm`
- `transfers.service.ts` → `confirm()`, cross-network guard + step-up doğrulama mantığı
- `transfer-state-machine.service.ts` → `draft → pending_signature` geçişi whitelist'e eklenir
- `packages/types/src/schemas/transfer.schema.ts` → `confirmTransferSchema`

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (`transfers`/`transfer_state_events`, `TransferStateMachine.enter()`)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §5.2 — kapsam
2. `docs/03_API_CONTRACTS.md` §5.4 `POST /transfers/:id/confirm` — request/response/hata kodları (`AUTH_STEP_UP_REQUIRED`, `TRANSFER_INVALID_TRANSITION`, `WALLET_INSUFFICIENT_BALANCE`, `WALLET_CROSS_NETWORK_MISMATCH`), §4 Step-up header notu
3. `docs/07_SECURITY_IMPLEMENTATION.md` §4 Yetkilendirme Uygulaması — step-up auth sequence diyagramı, "yalnızca backend'de zorlanır" ilkesi
4. `docs/01_DOMAIN_MODEL.md` §4 madde 3 (cross-network guard), §5.2 `draft → pending_signature` geçişi (backend/data/UI katmanları)
5. `docs/mimari-kararlar.md` AUTH-004 (cross-network guard), SEC-008 (step-up auth)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/cross-network-guard-step-up-auth` branch'i aç.
2. `confirmTransferSchema = z.object({ currentPassword: z.string().min(1) }).strict()`.
3. `transfer-state-machine.service.ts`: whitelist'e `draft: ['pending_signature', 'failed']` ekle (şimdilik yalnızca `pending_signature` hedefi kullanılır; `failed` hedefi İterasyon 3'ün başarısız imzalama senaryosu için burada tanımlanır ama bu iterasyonda tetiklenmez). `transitionTo(prisma, transferId, toState, actor, metadata?)` — genel geçiş metodu: whitelist kontrolü (izin verilmeyen geçiş `TransferInvalidTransitionException` fırlatır ve `AuditService`'e `TRANSFER_STATE_CHANGED` metadata'sıyla değil, ayrı bir `TRANSFER_INVALID_TRANSITION_ATTEMPTED` audit kaydı düşülmeden — bu iterasyonda yalnızca hata fırlatılır, audit yazımı yalnızca *başarılı* geçişler için madde 6'da tanımlanır), `$transaction` içinde `transfers.state` güncelleme + `transfer_state_events` insert.
4. `transfers.service.ts` → `confirm(userId, transferId, currentPassword)`: sırasıyla (a) transfer'i sahiplik kontrolüyle çek (`FORBIDDEN_NOT_OWNER`), (b) mevcut durum `draft` değilse `TRANSFER_INVALID_TRANSITION` (terminal durumdaysa bu doğal olarak `TRANSFER_ALREADY_TERMINAL` semantiğini de kapsar — whitelist zaten `confirmed`/`failed`/`dropped`'tan hiçbir hedefe izin vermediğinden aynı hata kod yoluna düşer), (c) `AuthService.verifyPassword(userId, currentPassword)` (Faz 1'in `password_hash` doğrulama servisi tekrar kullanılır) başarısızsa `AUTH_STEP_UP_REQUIRED`, (d) cross-network guard: `to_address`'in ağ formatını (`IChainProvider` implementasyonuna göre EIP-55/base58check) transfer'in `network_id`'siyle karşılaştır, uyuşmazlıkta `WALLET_CROSS_NETWORK_MISMATCH`, (e) `NetworksService` üzerinden `(network, asset)` aktiflik tekrar kontrolü (`NETWORK_ASSET_INACTIVE` — transfer oluşturulduktan sonra pasifleşmiş olabilir), (f) bakiye yeterliliği: `BalanceCache`'ten okunan bakiye `amount`'ı karşılamıyorsa `WALLET_INSUFFICIENT_BALANCE`.
5. Tüm kontroller geçerse `TransferStateMachine.transitionTo(prisma, transferId, 'pending_signature', 'user')` çağrılır; aynı `$transaction` içinde `AuditService.record` ile `TRANSFER_STATE_CHANGED` (`metadata: { fromState: 'draft', toState: 'pending_signature' }`) yazılır (`docs/04` §7 kalıbı).
6. `transfers.controller.ts`: `POST /transfers/:id/confirm` — `ZodValidationPipe(confirmTransferSchema)`, `ParseUUIDPipe` ile `:id`; başarıda `{ state: 'pending_signature' }` döner. Bu endpoint bu iterasyonda henüz bir kuyruğa iş bırakmaz (signing kuyruğu İterasyon 3'te eklenir) — `transitionTo` başarıyla dönünce senkron olarak `200` döner.
7. Unit test (`transfers.service.spec.ts`): step-up başarısız → `AUTH_STEP_UP_REQUIRED`; cross-network mismatch → `WALLET_CROSS_NETWORK_MISMATCH`; pasif network-asset → `NETWORK_ASSET_INACTIVE`; yetersiz bakiye → `WALLET_INSUFFICIENT_BALANCE`; başarılı geçiş + audit çağrısı. Unit test (`transfer-state-machine.service.spec.ts`): `draft` dışı bir durumdan `pending_signature`'a geçiş denemesi `TRANSFER_INVALID_TRANSITION` fırlatır. Integration test: `200` happy path.
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | — |
| Güncelle | `transfers/{transfers.controller.ts, transfers.service.ts, transfer-state-machine.service.ts}` (+`.spec.ts`), `packages/types/src/schemas/transfer.schema.ts` |
| Dokunma | `signing` kuyruğu (İterasyon 3'te eklenir, bu iterasyon henüz bir job kuyruğa almaz) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Cross-network guard yalnızca backend'de | `docs/07` §4, AUTH-004 | `confirm()` içinde adres-ağ karşılaştırması; frontend kontrolü UX amaçlıdır, bu kontrolü atlamaz |
| Step-up auth başarısız → geçiş yok | `docs/07` §4 diyagramı, SEC-008 | `AuthService.verifyPassword` önce, sonra guard'lar |
| Terminal/draft-dışı durumdan geçiş reddi | `docs/01` §5.2, §4 madde 8 | Whitelist kontrolü `TRANSFER_INVALID_TRANSITION` |
| Audit aynı transaction | `docs/04` §7 | `transitionTo()` içinde `$transaction` |

**Kalite kapıları:**
- [ ] Unit: step-up başarısız, cross-network mismatch, pasif network-asset, yetersiz bakiye — 4 deny senaryosu
- [ ] Unit: `draft` dışı durumdan geçiş denemesi reddi
- [ ] Integration: `200` happy path + audit kaydının yazıldığı
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `signing` kuyruğuna iş bırakma (İterasyon 3); imzalama/broadcast/confirmation'ın kendisi; frontend onay formu (İterasyon 7).

**Risk / dikkat:** Bakiye kontrolü burada yalnızca DB önbelleğinden (`BalanceCache`) okunur — gerçek zamanlı RPC çağrısı yapılmaz (`docs/mimari-kararlar.md` I-003). Bu, bakiyenin `confirm()` anından `signing` worker'ının çalıştığı ana kadar geçen kısa sürede değişmiş olabileceği anlamına gelir; roadmap bu ikinci kontrolü ("worker yeniden kontrolü") İterasyon 3'ün kapsamına bırakır, bu iterasyon yalnızca ilk (senkron, DB önbellekli) kontrolü yapar. Kontrol sırası önemlidir: step-up önce çalışmalı (yanlış şifreyle gelen bir istek diğer guard'ların hiçbirini tetiklemeden erken reddedilmeli) — sıra değişirse bir saldırgan şifre bilmeden cross-network/bakiye bilgisini (hata mesajı üzerinden) sızdırabilir.

**Stop:**
- [ ] `pnpm --filter api test -- transfers`
- [ ] `pnpm --filter api test -- transfer-state-machine`
- [ ] PR/onay → İterasyon 3
