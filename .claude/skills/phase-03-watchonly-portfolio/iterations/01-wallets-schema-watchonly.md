### İterasyon 1 — Wallets Şeması + Watch-only Oluşturma (§3.1)

**Hedef:** `wallets` tablosu (+ `wallet_type` enum) migration ile oluşur; `POST /wallets/watch-only` çalışır — ağa özel adres format doğrulaması (`packages/chain-providers`'ta, kritik modül) + `(network, asset)` aktiflik kontrolü + `audit_logs`'a `WALLET_CREATED` yazımı tek transaction içinde.

**Teslim çıktısı:**
- `wallets` migration
- `packages/chain-providers/src/address-validator.ts` (+ `.spec.ts`)
- `apps/api/src/wallets/{wallets.module.ts, wallets.controller.ts, wallets.service.ts, wallets.repository.ts}` (+ `.spec.ts` dosyaları)
- `packages/types/src/schemas/wallet.schema.ts` (`createWatchOnlyWalletSchema`)
- `apps/api/prisma/seed.ts` güncellemesi (1 demo kullanıcı + 1 watch-only cüzdan)

**Önkoşullar:**
- [ ] Faz 2 tüm alt maddeleri tamam (özellikle §2.3 `AuditService`, §2.5 `IChainProvider`/`CHAIN_ID_ALLOWLIST`)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.1 — kapsam
2. `docs/02_DATABASE_SCHEMA.md` §2.5 `wallets` — tam şema, `(network_id, address)` UNIQUE constraint, application-layer CHECK notu
3. `docs/03_API_CONTRACTS.md` §5.2 `POST /wallets/watch-only` — request/response/hata kodları/audit event
4. `docs/mimari-kararlar.md` §6 Süreç Mimarisi (watch-only akış adımları) ve `docs/08_TESTING_STRATEGY.md` §1, §4 senaryo #12 ve #2 — adres format doğrulama neden `chain-providers`'ta yaşıyor
5. `docs/09_DEV_WORKFLOW.md` §6 madde 4 (seed komutu)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/wallets-watchonly-creation` branch'i aç.
2. `add-prisma-migration` prosedürüyle `wallets` tablosunu (+ `wallet_type` enum: `watch_only`\|`managed`) `docs/02` §2.5 ile birebir ekle; `(network_id, address)` üzerinde `UNIQUE`. `type = 'watch_only'` iken `derivation_index`/`encrypted_dek` `NULL` kalmalıdır — bu, DB CHECK constraint'i değil, servis katmanında zorlanan bir kuraldır (Prisma koşullu CHECK desteklemez, `docs/02` §2.5 notu).
3. `packages/chain-providers/src/address-validator.ts`: `isValidAddress(chainType: 'evm' | 'tron', address: string): boolean` — EVM için `ethers.isAddress()` (EIP-55 checksum, mixed-case'de doğrular; tümü küçük harfse standart davranışla kabul eder), Tron için `TronWeb`'in adres doğrulama yardımcısı (base58check). Tek bir ortak regex kullanılmaz (`mimari-kararlar` §6). `IChainProvider` arayüzüne dokunulmaz — bu bağımsız, dışa aktarılan bir yardımcı fonksiyondur.
4. `packages/types/src/schemas/wallet.schema.ts`: `createWatchOnlyWalletSchema = z.object({ networkId: z.string().uuid(), address: z.string().min(1) }).strict()`; `index.ts` barrel'ına ekle.
5. `wallets/wallets.repository.ts`: `create(tx, data)`, `findByNetworkAndAddress(networkId, address)` (uniqueness ön kontrolü/hata mesajı için).
6. `wallets/wallets.service.ts`: `createWatchOnly(userId, { networkId, address })` — sırasıyla: network'ün `chainType`'ını okuyup `isValidAddress` ile format kontrolü (başarısızsa `WalletAddressInvalidFormatException`), `(network, asset)` aktiflik kontrolü (Faz 2'nin `NetworksService`'i üzerinden — en az bir aktif asset var mı; yoksa `NetworkAssetInactiveException`), `prisma.$transaction` içinde `wallets` insert + `AuditService.record` ile `WALLET_CREATED` (`metadata: { type: 'watch_only' }`, `docs/04` §7 kalıbı, Faz 2 İterasyon 3'ün devamı). Adres zaten kayıtlıysa Prisma `P2002` → `409 WalletAddressAlreadyExistsException` (`docs/04` §6 mapping kalıbı).
7. `wallets/wallets.controller.ts`: `POST /wallets/watch-only` — `@Roles()` gerekmez (her `User` erişebilir), body `ZodValidationPipe(createWatchOnlyWalletSchema)`.
8. `wallets/wallets.module.ts` oluşturulup `app.module.ts`'e import edilir; `AuditModule`, `NetworksModule` import edilir.
9. `seed.ts`'e 1 demo kullanıcı (`role: 'user'`, `PasswordService.hash()`) ve bu kullanıcıya ait 1 watch-only cüzdan (Sepolia, gerçek/örnek bir EIP-55 adresi) eklenir — managed cüzdan seed'i Faz 4'e kalır (`docs/02` §9 notu).
10. Unit test (`address-validator`): geçerli/geçersiz EVM ve Tron adresleri (senaryo #12). Unit test (`wallets.service`): başarılı oluşturma + audit çağrısı; geçersiz adres formatı reddi; pasif `(network, asset)` reddi (senaryo #2). Integration test: `201` happy path; `422 WALLET_ADDRESS_INVALID_FORMAT`; `409 WALLET_ADDRESS_ALREADY_EXISTS`.
11. `pnpm --filter api run seed` çalıştırılıp idempotent olduğu doğrulanır.
12. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `chain-providers/src/address-validator.ts` (+`.spec.ts`), `types/src/schemas/wallet.schema.ts`, `wallets/{wallets.module.ts, wallets.controller.ts, wallets.service.ts, wallets.repository.ts}` (+`.spec.ts` dosyaları) |
| Güncelle | `schema.prisma`, `apps/api/src/app.module.ts`, `packages/types/src/index.ts`, `apps/api/prisma/seed.ts` |
| Dokunma | `balance_caches` (İterasyon 2), `GET /wallets` (İterasyon 4) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| EVM: EIP-55 checksum, Tron: base58check, ortak regex yok | `mimari-kararlar` §6, `docs/08` senaryo #12 | `address-validator.ts`, `chainType` parametreli dallanma |
| Pasif `(network, asset)` çiftinde cüzdan eklenemez | `docs/01` §4 madde 1, `docs/08` senaryo #2 | `NetworksService` üzerinden aktiflik kontrolü |
| `wallets` insert + `audit_logs` tek transaction | `docs/04` §7 | `prisma.$transaction`, Faz 2 İterasyon 3 kalıbının tekrarı |
| `409 WALLET_ADDRESS_ALREADY_EXISTS` | `docs/03` §5.2, §3 | Prisma `P2002` → `DomainException` mapping |

**Kalite kapıları:**
- [ ] Unit test: `isValidAddress` (EVM+Tron, pozitif+negatif — senaryo #12), `WalletsService.createWatchOnly` (başarı + iki deny senaryosu)
- [ ] Integration test: `201`, `422`, `409 WALLET_ADDRESS_ALREADY_EXISTS`, pasif network-asset → hata
- [ ] `pnpm --filter api exec prisma migrate dev` hatasız
- [ ] `pnpm --filter api run seed` idempotent
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `GET /wallets`/`GET /wallets/:id` (İterasyon 4), managed cüzdan oluşturma (Faz 4), `balance_caches` tablosu (İterasyon 2 — bu iterasyonda bir watch-only cüzdan eklenir ama bakiyesi henüz senkronize edilmez).

**Risk / dikkat:** `ethers.isAddress()` hem checksum'lı hem tamamen küçük harfli EVM adreslerini geçerli sayar (EIP-55 spesifikasyonunun kendisi böyledir — checksum yalnızca karışık büyük/küçük harf kullanıldığında zorunludur); bu bir gevşeklik değildir, adres formatının kendisidir. `TronWeb`'in adres doğrulama fonksiyonunun tam adı sürüme göre değişebilir (`tronweb` paketinin o anki sürümünün dokümantasyonuna bakılmalı) — İterasyon 5'te (Faz 2) eklenen `tronweb` bağımlılığı zaten mevcuttur, yeni bir paket eklenmez.

**Stop:**
- [ ] `pnpm --filter chain-providers test -- address-validator`
- [ ] `pnpm --filter api test -- wallets`
- [ ] PR/onay → İterasyon 2
