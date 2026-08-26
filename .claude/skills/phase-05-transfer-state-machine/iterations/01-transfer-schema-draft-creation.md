### İterasyon 1 — Transfer Şeması + Draft Oluşturma (§5.1)

**Hedef:** `transfers`/`transfer_state_events` tabloları migration'la kuruldu; `TransferStateMachine` servisi yalnızca `draft` girişini destekliyor; `POST /transfers` bir `Idempotency-Key` header'ıyla çalışıp `201` (yeni) veya `200` (tekrar istek) döndürüyor.

**Teslim çıktısı:**
- `transfers`, `transfer_state_events` tabloları migration'ı (`transfer_state` enum)
- `apps/api/src/transfers/{transfers.module.ts, transfers.controller.ts, transfers.service.ts, transfers.repository.ts, transfer-state-machine.service.ts}` (+ `.spec.ts`)
- `packages/types/src/schemas/transfer.schema.ts` → `createTransferSchema`
- `idempotency_keys` benzeri bir mekanizma (aşağıda uygulama notu)

**Önkoşullar:**
- [ ] Faz 4'ün tüm alt maddeleri tamam (`wallets.encrypted_private_key`, `EnvelopeEncryptionService` `WalletsModule`'den `exports` ediliyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §5.1 — kapsam
2. `docs/01_DOMAIN_MODEL.md` §2.6-2.7 Transfer/TransferStateEvent, §5.2 `draft` durumu tanımı, §4 madde 7 (state bütünlüğü — yalnızca `TransferStateMachine` üzerinden yazım)
3. `docs/02_DATABASE_SCHEMA.md` §2.7 `transfers`, §2.8 `transfer_state_events` — kolon listesi, index'ler (`transfers_wallet_id_idx`, `transfers_state_idx`, `transfers_tx_hash_idx`)
4. `docs/03_API_CONTRACTS.md` §5.4 `POST /transfers` — request/response/hata kodları, §7 Idempotency ve Retry Semantiği (client-tarafı idempotency)
5. `docs/04_BACKEND_SPEC.md` §2 Klasör Yapısı (`transfers/` modülü dosya kümesi), §7 Transaction Yönetimi

**Uygulama planı:**
1. `git-phase-branch` ile `feat/transfer-schema-draft-creation` branch'i aç.
2. `add-prisma-migration` prosedürüyle `transfer_state` enum'ı (`draft, pending_signature, signed, broadcast, confirming, confirmed, failed, dropped`), `transfers` tablosu (`wallet_id, network_id, asset_id, to_address, amount TEXT, state, tx_hash, failure_reason, created_at, updated_at`, default `state = 'draft'`) ve append-only `transfer_state_events` tablosu (`transfer_id, from_state NULL, to_state, occurred_at, actor, metadata JSONB`) ekle — `docs/02` §2.7-2.8 birebir.
3. `packages/types/src/schemas/transfer.schema.ts`: `createTransferSchema = z.object({ walletId: z.string().uuid(), toAddress: z.string(), assetId: z.string().uuid(), amount: z.string().regex(/^\d+$/) }).strict()` (`docs/04` §5 sayısal tip disiplini — `amount` asla `z.number()` değil).
4. `transfer-state-machine.service.ts`: `TransferStateMachine.enter(prisma: Prisma.TransactionClient, data): Promise<Transfer>` — yalnızca `draft` giriş durumunu destekleyen ilk metod; `$transaction` içinde `transfers` insert + `transfer_state_events` insert (`fromState: null, toState: 'draft', actor: 'user'`) yapar, audit yazmaz (`docs/03` §5.4 notu — draft oluşturma audit'e yazılmaz). İzin verilen geçiş tablosunu (whitelist) bu iterasyonda `{ null: ['draft'] }` olarak başlat — İterasyon 2-5 buraya yeni satır ekleyecek, mevcut yapı bozulmadan genişletilir.
5. `transfers.repository.ts`: `findByIdempotencyKey(userId, idempotencyKey)` — aynı `(userId, idempotencyKey)` çiftiyle daha önce oluşturulmuş bir `Transfer` var mı kontrolü. Idempotency anahtarı ayrı bir tablo yerine `transfers` tablosuna eklenen nullable `idempotency_key TEXT` kolonu + `(user_id, idempotency_key)` UNIQUE partial index ile tutulur (24 saatlik TTL bir cron değil, sorgu sırasında `created_at`'e göre değerlendirilir — `docs/03` §7); bu kolon migration'a eklenir (madde 2'ye dahil).
6. `transfers.service.ts`: `createDraft(userId, dto, idempotencyKey)` — sırasıyla: managed cüzdan sahiplik kontrolü (`WalletsModule`'den `findOwnedManagedWallet`, yoksa `FORBIDDEN_NOT_OWNER` veya `WALLET_NOT_MANAGED`), `idempotencyKey` ile mevcut kayıt varsa onu `{ transfer, isNew: false }` olarak döner, yoksa `TransferStateMachine.enter()` çağırır. Bu iterasyonda cross-network guard/aktivasyon/bakiye kontrolü **yok** (İterasyon 2'nin kapsamı) — yalnızca sahiplik ve idempotency.
7. `transfers.controller.ts`: `POST /transfers` — `@Headers('Idempotency-Key') idempotencyKey: string` zorunlu (yoksa `VALIDATION_FAILED`), `ZodValidationPipe(createTransferSchema)`; `isNew` `true` ise `201`, `false` ise `200` döner.
8. Unit test (`transfer-state-machine.service.spec.ts`): `enter()` başarılı draft oluşturma + `transfer_state_events` satırının `fromState: null` ile yazıldığı. Unit test (`transfers.service.spec.ts`): sahiplik reddi, watch-only cüzdan reddi (`WALLET_NOT_MANAGED`), idempotency tekrar isteğinde aynı transfer'in döndüğü (yeni satır açılmadığı). Integration test: `201` happy path + aynı `Idempotency-Key` ile ikinci istek `200` + aynı `id`.
9. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `transfers/{transfers.module.ts, transfers.controller.ts, transfers.service.ts, transfers.repository.ts, transfer-state-machine.service.ts}` (+`.spec.ts`), `packages/types/src/schemas/transfer.schema.ts` |
| Güncelle | `schema.prisma`, `app.module.ts` (`TransfersModule` import) |
| Dokunma | `wallets.service.ts` (yalnızca `findOwnedManagedWallet` gibi bir okuma metodu tüketilir, değiştirilmez) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `Transfer.state` yalnızca `TransferStateMachine` üzerinden yazılır | `docs/04` §1 kesin kural | `enter()` dışında hiçbir kod yolu `transfers.state`'e `UPDATE` yazmaz |
| Draft oluşturma audit'e yazılmaz | `docs/03` §5.4 | `TransferStateMachine.enter()` `AuditService.record` çağırmaz |
| Client-tarafı idempotency | `docs/03` §7 | `(user_id, idempotency_key)` UNIQUE + tekrar istekte `200` |
| Sayısal tip disiplini (`amount`) | `docs/04` §5 | `TEXT` kolon + zod `regex(/^\d+$/)` |

**Kalite kapıları:**
- [ ] Unit: `TransferStateMachine.enter()` draft oluşturma + audit yazmadığının doğrulanması
- [ ] Unit: `TransfersService.createDraft` sahiplik reddi + watch-only reddi + idempotency tekrar isteği
- [ ] Integration: `201` + aynı `Idempotency-Key` ile `200` (aynı `id`)
- [ ] `pnpm --filter api exec prisma migrate dev` hatasız
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** Cross-network guard, step-up auth, bakiye kontrolü, `draft → pending_signature` geçişi (İterasyon 2); signing/broadcast/confirmation worker'ları (İterasyon 3-5); frontend (İterasyon 6-7).

**Risk / dikkat:** İzin verilen geçiş tablosunu (`{ null: ['draft'] }`) burada sabit/kapalı bir yapı olarak yazmamaya dikkat et — İterasyon 2-5 her biri kendi geçişini (`draft → pending_signature`, `pending_signature → signed`, vb.) bu tabloya ekleyecek; tablo İterasyon 1'de tek satırla başlar ama genişleyebilir tasarlanır (ör. `Record<TransferState | null, TransferState[]>`). Idempotency kolonunun `transfers` tablosuna eklenmesi yerine ayrı bir tablo da düşünülebilirdi, ama tek kullanıcı-anahtar çiftinin tek transfer'e karşılık gelmesi zaten 1-1 ilişki olduğundan ayrı bir tablo gereksiz normalizasyon olurdu (`.claude/rules/01-coding-philosophy.md` over-engineering yasağı).

**Stop:**
- [ ] `pnpm --filter api test -- transfer-state-machine`
- [ ] `pnpm --filter api test -- transfers`
- [ ] PR/onay → İterasyon 2
