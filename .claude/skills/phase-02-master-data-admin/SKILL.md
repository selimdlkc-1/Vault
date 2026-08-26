---
name: phase-02-master-data-admin
description: '[Faz 2] Network/Asset Master Data ve Admin Temeli — 5 iterasyon/chat (network/asset şema doğrulama + seed verisi genişletme → public network/asset okuma endpoint''leri → admin aktivasyon endpoint''i + audit_logs tablosu → admin layout + S-ADMIN-NETWORK-ASSETS ekranı → IChainProvider arayüzü + chain ID allowlist). Use when the user says "Faz 2", "Faz 2 — İterasyon N", veya network/asset master data, admin panel, audit log yazımı, chain provider allowlist eklemekten bahseder. Do NOT use for auth/roller (Faz 1), watch-only cüzdan/portföy (Faz 3), managed cüzdan/key storage (Faz 4), transfer state machine (Faz 5), mint/audit-log okuma/bildirim (Faz 6).'
---

# Faz 2: Network/Asset Master Data ve Admin Temeli

## Goal

Network/Asset kataloğu (`networks`, `assets`, `network_assets` — Faz 0'da şeması, bu fazda gerçek verisiyle) seed'den okunuyor; `GET /networks`, `GET /networks/:networkId/assets` çalışıyor; Admin bir `(network, asset)` çiftini `PATCH /admin/network-assets/:networkId/:assetId` ile pasif yapabiliyor ve bu değişiklik ilk kez oluşan `audit_logs` tablosuna tek transaction içinde yazılıyor; Admin bunu `/admin/network-assets` ekranından da yapabiliyor; `packages/chain-providers` ilk gerçek içeriğini (`IChainProvider` arayüzü + `EvmProvider`/`TronProvider` iskeletleri) kazanıyor ve mainnet chain ID'siyle başlatma denemesi allowlist tarafından reddediliyor (`docs/10_IMPLEMENTATION_ROADMAP.md` Faz 2 İnsan onay noktası).

## Faz 1'den taşınan iki entegrasyon notu

Bu skill yazılırken, Faz 2'nin doğrudan başlığına girmeyen ama docs'ta açıkça Faz 2'ye bağlanmış iki nokta tespit edildi — ikisi de aşağıdaki iterasyonlarda ele alınır, burada tekrar tartışılmaz:

1. **`LOGIN`/`LOGIN_FAILED` audit yazımı** — `docs/03_API_CONTRACTS.md` §5.1 ve §6, Faz 1'de bu iki olayın `audit_logs` tablosu olmadığı için audit'e yazılmadan çalıştığını, entegrasyonun "tabloyla birlikte" Faz 2'de tamamlanacağını açıkça not düşer. `audit_logs` bu fazda İterasyon 3'te oluştuğundan, `auth.service.ts`/`login-throttler.guard.ts`'e bu iterasyonda geri dönülüp audit çağrıları eklenir — Faz 1'in kendi skill'i bu işi bilerek yapmamıştı.
2. **Mock USDT `contract_address`'i bu fazda `NULL` kalır** — `docs/10_IMPLEMENTATION_ROADMAP.md` §4.4 ve Risk Kaydı, mock ERC-20/TRC-20 kontratlarının deploy'unun Faz 4'te yapıldığını ve adreslerin ancak o zaman `assets.contract_address`'e yazıldığını gösterir. İterasyon 1'in seed'i mock USDT satırlarını `contract_address: null` ile yazar; bu geçici bir eksiklik değil, planlanmış bir sıralamadır.

Ayrıca, araştırma sırasında `docs/03_API_CONTRACTS.md` §4'ün tüm state-değiştiren isteklerde zorunlu kıldığı `X-Requested-With` CSRF header kontrolünün `docs/04_BACKEND_SPEC.md` §4 Middleware Zinciri'nde hiç yer almadığı ve Faz 1'in çıktısında da uygulanmadığı görüldü — bu, Faz 2'nin kapsamına girmeyen, önceden var olan bir doküman-arası tutarsızlıktır; bu skill onu **çözmez**, yalnızca kaydeder. Kullanıcı isterse ayrı bir `write-adr`/docs güncellemesi oturumuyla ele alınmalıdır.

## Bu fazın çalışma modeli

- Tek sohbet fazı bitirmez; her chat başında **「Faz 2 — İterasyon M」** belirt.
- Agent yalnızca o iterasyonun **Docs okuma sırasını** okur, tüm spec'i değil.
- Backend tarafı iki modül açar: `apps/api/src/networks/` (§2.2-§2.3'ün tamamı; ayrı bir `admin/` modülü bu faz için açılmaz — admin aktivasyon endpoint'i `networks` modülünün bir parçasıdır çünkü `docs/04_BACKEND_SPEC.md` §2'de `admin/` yalnızca mint + audit okuma + kullanıcı verisi için ayrılmıştır, ikisi de Faz 4/6'da gelir) ve `apps/api/src/audit/` (`AuditService` — diğer tüm modüllerce enjekte edilecek ortak altyapı, İterasyon 3'te kurulur).
- `packages/chain-providers` (İterasyon 5) `TransferStateMachine` kadar olmasa da kritik modül sayılır (`docs/08_TESTING_STRATEGY.md` §3); ≥%80 coverage eşiği CI gate'i olarak Faz 7'de zorunlu hale gelir ama bu iterasyonun testleri baştan bu hedefi gözetir.

## İterasyon indeksi

| # | Teslim | §N.M |
| - | ------ | ---- |
| 1 | Network/Asset şema doğrulama + seed verisi genişletme (+ admin kullanıcı seed'i) | §2.1 |
| 2 | Public network/asset okuma endpoint'leri | §2.2 |
| 3 | Admin aktivasyon endpoint'i + `audit_logs` tablosu + Faz 1 audit retrofit'i | §2.3 |
| 4 | Admin layout + S-ADMIN-NETWORK-ASSETS | §2.4 |
| 5 | `IChainProvider` arayüzü + chain ID allowlist | §2.5 |

## Required Context

- `docs/10_IMPLEMENTATION_ROADMAP.md` §3 Faz 2 — tüm alt madde tanımları
- `docs/mimari-kararlar.md` A-004, AUTH-003 (network/asset aktivasyon kuralı), AP-001..004 (admin panelleri), SEC-005 (mainnet allowlist), I-001/I-002 (chain provider soyutlaması, veri kaynağı matrisi)
- `.claude/rules/00-*.md` … `04-*.md` — zaten yüklü, tekrar edilmez
- `.claude/skills/phase-01-auth-roles/SKILL.md` — komşu faz formatı referansı (bu skill aynı iterasyon şablonunu izler); ayrıca İterasyon 3'ün `auth.service.ts` retrofit'i bu skill'in çıktısına doğrudan dokunur

## Done Definition

- [ ] Admin gerçek tarayıcıda `/admin/network-assets`'te bir `(network, asset)` çiftini pasif yapabiliyor; DB'de `audit_logs`'a `NETWORK_ASSET_DEACTIVATED` kaydı düşüyor
- [ ] `User` rolü admin endpoint'ine erişmeye çalıştığında `403 FORBIDDEN_ROLE` ile reddediliyor, integration testle kanıtlı (zorunlu negatif senaryo #6)
- [ ] Mainnet chain ID ile `IChainProvider` başlatma denemesi reddediliyor, unit testle kanıtlı (zorunlu negatif senaryo #11)
- [ ] `GET /networks`, `GET /networks/:networkId/assets` seed verisiyle uçtan uca çalışıyor
- [ ] Faz 1'den ertelenen `LOGIN`/`LOGIN_FAILED` audit yazımı tamamlanmış, testle kanıtlı
- [ ] CI'ın 4 adımı (lint→typecheck→test→build) yeşil

## Explicit Don'ts

- `POST /admin/mint`, `mint_operations` tablosu, S-ADMIN-MINT — Faz 4 §4.4.
- `GET /admin/audit-logs` (audit log **okuma** endpoint'i), S-ADMIN-AUDIT-LOG, `GET /admin/users/:userId/wallets|transfers`, S-ADMIN-USER-DETAIL — Faz 6 §6.3/§6.4. Bu fazda `audit_logs`'a yalnızca **yazılır**, okuma ekranı/endpoint'i yoktur.
- S-FORBIDDEN-403 sistem ekranı — Faz 7 §7.4; bu fazda admin route'a yetkisiz erişim geçici olarak mevcut `/dashboard` placeholder'ına yönlenir (bkz. İterasyon 4).
- Watch-only/managed cüzdan oluşturma, `wallets` tablosu — Faz 3/4.
- `getBalance`/`broadcastTransaction`'ın gerçek implementasyonu — sırasıyla Faz 3 §3.2, Faz 5.
- Coverage gate'inin CI'a eklenmesi — Faz 7 §7.1.
- `docs/03_API_CONTRACTS.md` §4'teki `X-Requested-With` CSRF header kontrolü — yukarıda not edilen, bu fazın kapsamı dışında bırakılan doküman tutarsızlığı.

---

### İterasyon 1 — Network/Asset Şema Doğrulama + Seed Verisi Genişletme (§2.1)

**Hedef:** `networks`/`assets`/`network_assets` tabloları (Faz 0 §0.3'te tam alanlarıyla oluşturulmuştu) `docs/02_DATABASE_SCHEMA.md` §2.2-2.4 ile birebir olduğu doğrulanır; Faz 0 §0.5'te boş iskelet olarak kurulan `seed.ts`, üç ağ + native varlıklar + mock USDT (`is_active = true`) ve 1 admin kullanıcı ile doldurulur.

**Teslim çıktısı:**
- `apps/api/prisma/seed.ts` (dolu, idempotent upsert kalıbı korunarak)

**Önkoşullar:**
- [ ] Faz 0 §0.3/§0.5 tamamlanmış (şema ve boş seed iskeleti mevcut)
- [ ] Faz 1 §1.1 tamamlanmış (`PasswordService` admin şifresini hash'lemek için gerekli)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §2.1 — kapsam
2. `docs/02_DATABASE_SCHEMA.md` §2.2-2.4 — şema doğrulama
3. `docs/02_DATABASE_SCHEMA.md` §9 Seed Verisi — tam hedef seed tanımı (bu iterasyon admin kullanıcıyı da kapsar; demo kullanıcı + cüzdanlar Faz 3/4'e kalır)
4. `docs/mimari-kararlar.md` A-004, I-004 (confirmation threshold değerleri), I-008 (mock kontrat — henüz deploy yok)
5. `docs/09_DEV_WORKFLOW.md` §6 madde 4 (seed komutu)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/network-asset-seed-data` branch'i aç.
2. `schema.prisma`'daki `Network`/`Asset`/`NetworkAsset` modellerinin `docs/02` §2.2-2.4 ile birebir olduğunu doğrula (Faz 0 aynı kaynaktan üretti, sapma beklenmiyor).
3. `seed.ts`'e sabit network satırları ekle: Sepolia (`chain_type: evm`, `chain_id: '11155111'`, `confirmation_threshold: 12`), BSC Testnet (`evm`, `chain_id: '97'`, `15`), Tron Shasta (`tron`, `chain_id: 'shasta'`, `19`) — bu üç `chain_id` değeri, İterasyon 5'te `CHAIN_ID_ALLOWLIST` env'inin karşılaştıracağı değerlerle **birebir aynı string** olmalıdır (bkz. Risk/dikkat).
4. Her network için native asset (Sepolia/BSC Testnet: ETH/BNB `decimals: 18`; Tron Shasta: TRX `decimals: 6`, `contract_address: null`) + mock USDT (`decimals: 6`, `contract_address: null` — Faz 4 §4.4 deploy sonrası bu alan seed upsert ile güncellenecek, `coingecko_id: 'tether'`) upsert edilir.
5. Her `(network, asset)` çifti için `network_assets` upsert: `is_active: true`, `activated_at: now()`.
6. 1 admin kullanıcı upsert edilir: sabit test email'i, `PasswordService.hash()` ile üretilmiş sabit şifre, `role: 'admin'` — `PasswordService` Faz 1 §1.1'den beri mevcut, `seed.ts` bunu NestJS DI dışında doğrudan import ederek çağırır.
7. `pnpm --filter api run seed` çalıştırılır; ikinci kez çalıştırıldığında hata vermediği/yinelenen kayıt oluşturmadığı doğrulanır.
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Güncelle | `apps/api/prisma/seed.ts` |
| Dokunma | `schema.prisma` (yalnızca doğrulama), migration dosyaları (şema zaten Faz 0'da tam) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| 3 ağ, native varlıklar + mock USDT, tümü `is_active = true` | `docs/10` §2.1, `docs/02` §9 | `seed.ts` upsert zinciri |
| Confirmation threshold (12/15/19) | `mimari-kararlar` I-004 | `networks.confirmation_threshold` |
| 1 admin kullanıcı, argon2id hash | `docs/02` §9, `mimari-kararlar` A-003 | `PasswordService.hash()` seed içinde çağrılır |
| Mock USDT `contract_address` bu fazda `NULL` | `docs/10` §4.4, Risk Kaydı | Faz 4 §4.4'te seed upsert ile güncellenir |

**Kalite kapıları:**
- [ ] `pnpm --filter api run seed` hatasız, idempotent (iki kez çalıştırılabilir)
- [ ] 3 network, 6 asset (3 native + 3 mock USDT), 6 `network_assets` satırı (tümü aktif), 1 admin kullanıcı DB'de doğrulanmış
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** demo kullanıcı + watch-only/managed cüzdan seed'i (Faz 3/4 — managed cüzdan seed'i envelope encryption'a bağımlı, `phase-00-infra-scaffold` İterasyon 5'te de aynı gerekçeyle ertelenmişti), mock USDT `contract_address`'in gerçek değeri, migration değişikliği (şema zaten Faz 0'da tam).

**Risk / dikkat:** Bu iterasyonda seçilen `chain_id` string'leri (`'11155111'`, `'97'`, `'shasta'`) İterasyon 5'te `CHAIN_ID_ALLOWLIST` env'inin ayrıştıracağı değerlerle senkron tutulmalı. `docs/04_BACKEND_SPEC.md` §10'daki `CHAIN_ID_ALLOWLIST` örnek değeri (`sepolia,bsc-testnet,tron-shasta`) yalnızca **örnektir** — `docs/02_DATABASE_SCHEMA.md` §2.2 `chain_id` kolonunu "EVM için sayısal chain id string'i" ve "allowlist kontrolünün karşılaştıracağı değer" olarak tanımladığından, gerçek `.env` değeri bu iterasyondaki numerik/tanımlayıcı string'lerle (`11155111,97,shasta`) birebir eşleşmelidir; iki değer arasında bir merkezi sabit dosyası açılmaz (over-engineering'den kaçınmak için), senkronluk İterasyon 5'te ayrıca doğrulanır.

**Stop:**
- [ ] `pnpm --filter api run seed`
- [ ] PR/onay → İterasyon 2

---

### İterasyon 2 — Public Network/Asset Okuma Endpoint'leri (§2.2)

**Hedef:** `GET /networks`, `GET /networks/:networkId/assets` `docs/03_API_CONTRACTS.md` §5.3 ile birebir çalışır; `networks` modülü (`docs/04_BACKEND_SPEC.md` §2'de tanımlı konum) ilk kez kurulur.

**Teslim çıktısı:**
- `apps/api/src/networks/{networks.module.ts, networks.controller.ts, networks.service.ts, networks.repository.ts}` + ilgili `.spec.ts` dosyaları

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (seed verisi DB'de)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §2.2 — kapsam
2. `docs/03_API_CONTRACTS.md` §5.3 Networks/Assets — yalnızca `GET` iki satır
3. `docs/04_BACKEND_SPEC.md` §1 (katman mimarisi), §2 (`networks/` modül konumu)
4. `add-new-endpoint` skill (prosedür referansı)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/networks-read-endpoints` branch'i aç.
2. `networks.repository.ts`: `findAllNetworks()`, `findAssetsByNetwork(networkId, { activeOnly })` (Prisma üzerinden).
3. `networks.service.ts`: `listNetworks()` — repository sonucunu `docs/03` §5.3 response şekline maplar (`{ id, name, chainType, chainId, confirmationThreshold }`); `listAssetsForNetwork(networkId, activeOnly)` — network bulunamazsa `RESOURCE_NOT_FOUND` fırlatır, aksi halde `{ id, symbol, decimals, contractAddress, isActive }` listesi döner.
4. `networks.controller.ts`: `GET /networks` (ek `@Roles()` gerekmez — her authenticated kullanıcı erişebilir, global `JwtAuthGuard` yeterli); `GET /networks/:networkId/assets` (`:networkId` → `ParseUUIDPipe`; `activeOnly` query → `ParseBoolPipe` ile, `optional: true, default: true`).
5. `networks.module.ts` oluşturulup `app.module.ts`'e import edilir.
6. Unit test (`networks.service`): `activeOnly` filtresi doğru satırları döner; network bulunamazsa `RESOURCE_NOT_FOUND`. Integration test (controller→repo, test DB, İterasyon 1'in seed'ine benzer fixture): `200` + doğru şekil, geçersiz `networkId` için `404`.
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `networks/networks.module.ts`, `networks.controller.ts`, `networks.service.ts`, `networks.repository.ts` + `.spec.ts` dosyaları |
| Güncelle | `apps/api/src/app.module.ts` |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `GET /networks` tüm ağları döner, ağın kendisi aktif/pasif olmaz | `docs/03` §5.3 | yalnızca `(network, asset)` pasifleşir |
| `activeOnly` varsayılan `true` | `docs/03` §5.3 | `ParseBoolPipe` default |
| Network bulunamazsa `RESOURCE_NOT_FOUND` | `docs/03` §5.3, §3 | `NetworksService` |

**Kalite kapıları:**
- [ ] Unit test: filtre + `RESOURCE_NOT_FOUND` senaryosu
- [ ] Integration test: `200` happy path, `404` senaryosu
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** admin aktivasyon endpoint'i (`PATCH`, §2.3), `audit_logs` (§2.3), frontend tüketimi (§2.4).

**Risk / dikkat:** `activeOnly=false` yalnızca Admin panelinden kullanılacak olsa da bu endpoint `User` rolüne de tamamen açıktır (`docs/03` §5.3 bilinçli bir tasarımdır) — bu iterasyonda ek bir `@Roles()` kısıtı **eklenmemelidir**.

**Stop:**
- [ ] `pnpm --filter api test -- networks`
- [ ] PR/onay → İterasyon 3

---

### İterasyon 3 — Admin Aktivasyon Endpoint'i + `audit_logs` Tablosu (§2.3)

**Hedef:** `PATCH /admin/network-assets/:networkId/:assetId` `docs/03` §5.3 ile çalışır; `audit_logs` tablosu ilk kez migration ile oluşur; `AuditService` kurulur (`network_assets` güncelleme + `audit_logs` yazımı tek transaction — sonraki tüm audit yazımlarının temel kalıbı); Faz 1'den beri ertelenen `LOGIN`/`LOGIN_FAILED` audit yazımı bu iterasyonda tamamlanır (bkz. üstteki "Faz 1'den taşınan entegrasyon notu").

**Teslim çıktısı:**
- `audit_logs` migration (+ `actor_type` enum)
- `apps/api/src/audit/{audit.module.ts, audit.service.ts, audit.repository.ts}` + `.spec.ts`
- `packages/types/src/schemas/network-asset.schema.ts` (`patchNetworkAssetSchema`)
- `networks.controller.ts`/`networks.service.ts`/`networks.repository.ts` güncellemesi (PATCH route + `activateNetworkAsset`)
- `auth.service.ts`/`login-throttler.guard.ts` güncellemesi (`LOGIN`/`LOGIN_FAILED` audit çağrıları)

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §2.3 — kapsam
2. `docs/02_DATABASE_SCHEMA.md` §2.12 `audit_logs` — tam şema
3. `docs/03_API_CONTRACTS.md` §5.3 `PATCH /admin/network-assets`, §5.1 sıralama notu (`LOGIN`/`LOGIN_FAILED`), §6 rate limit sıralama notu (`reason: 'rate_limited'`)
4. `docs/04_BACKEND_SPEC.md` §7 Transaction Yönetimi ve Audit Yazımı — bu iterasyonun kurduğu kalıbın kaynağı
5. `docs/07_SECURITY_IMPLEMENTATION.md` §10 Audit Log (şema, kim görür)
6. `docs/mimari-kararlar.md` AP-001, AP-004
7. `add-prisma-migration` skill (migration adımı için)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/admin-network-asset-activation` branch'i aç.
2. `add-prisma-migration` prosedürüyle `audit_logs` tablosunu (+ `actor_type` enum: `user`\|`admin`\|`system`) şemaya ekle (`docs/02` §2.12 birebir), `prisma migrate dev --name add_audit_logs`.
3. `packages/types/src/schemas/network-asset.schema.ts`: `patchNetworkAssetSchema = z.object({ isActive: z.boolean() }).strict()`; `index.ts` barrel'ına ekle.
4. `audit/audit.repository.ts`: `create(tx: Prisma.TransactionClient, data)`.
5. `audit/audit.service.ts`: `record(tx: Prisma.TransactionClient, { actorType, actorId, action, entityType, entityId, metadata })` — kendi transaction'ını açmaz, repository'ye devreder (`docs/04` §7). `audit/audit.module.ts` — `AuditService` export edilir, ihtiyaç duyan modüller (`NetworksModule`, `AuthModule`) `imports`'a ekler.
6. `networks.repository.ts`: `updateActivation(tx, networkId, assetId, isActive)` — `network_assets.is_active` + `activated_at` günceller.
7. `networks.service.ts`: `activateNetworkAsset(networkId, assetId, isActive, adminUserId)` — `prisma.$transaction` içinde: `network_asset` güncellenir + `AuditService.record` ile `NETWORK_ASSET_ACTIVATED`/`NETWORK_ASSET_DEACTIVATED` (`metadata: { networkId, assetId }`) yazılır; çift bulunamazsa `RESOURCE_NOT_FOUND`.
8. `networks.controller.ts`: `PATCH /admin/network-assets/:networkId/:assetId` — `@Roles('admin')` (`RolesGuard`'ın Faz 1 §1.5'ten beri ilk gerçek kullanımı), `@UsePipes(new ZodValidationPipe(patchNetworkAssetSchema))`, `:networkId`/`:assetId` `ParseUUIDPipe`.
9. `auth.service.ts`: `login()` başarılı girişte `AuditService.record` ile `LOGIN` (`actorType: 'user'`, `actorId: user.id`) yazar; `validateCredentials` başarısız olduğunda `LOGIN_FAILED` (`actorType: 'user'`, `actorId: null` — kullanıcı henüz doğrulanmadığından, email `metadata`'da tutulur) yazılır. `login-throttler.guard.ts`: rate limit aşımında `LOGIN_FAILED` (`metadata: { reason: 'rate_limited' }`) yazılır. Bu üç çağrı bir state değişikliğine eşlik etmediğinden (bağımsız insert) `prisma.$transaction` gerektirmez — `PrismaService`, `Prisma.TransactionClient` tipinin bir üst kümesi olduğundan doğrudan `AuditService.record`'a geçirilebilir.
10. Unit test (`audit.service`): `record()` doğru parametrelerle repository'yi çağırıyor (mock). Unit test (`networks.service`): başarılı aktivasyon + audit çağrısı; çift bulunamazsa `RESOURCE_NOT_FOUND`. Integration test: `Admin` ile `PATCH` → `200` + `audit_logs` satırı; `User` ile aynı istek → `403` (zorunlu negatif senaryo #6). Integration test (`auth`): login sonrası `audit_logs`'ta `LOGIN`; yanlış şifre sonrası `LOGIN_FAILED`.
11. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `audit/audit.module.ts`, `audit.service.ts`, `audit.repository.ts` (+`.spec.ts`), `packages/types/src/schemas/network-asset.schema.ts` |
| Güncelle | `schema.prisma`, `networks.controller.ts`, `networks.service.ts`, `networks.repository.ts`, `networks.module.ts` (AuditModule import), `auth.service.ts`, `auth.module.ts` (AuditModule import), `login-throttler.guard.ts`, `packages/types/src/index.ts` |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `network_assets` update + `audit_logs` tek transaction | `docs/04` §7 | `prisma.$transaction` |
| `audit_logs` şeması | `docs/02` §2.12 | migration |
| `PATCH admin/network-assets` → `@Roles('admin')` | `docs/03` §5.3, `mimari-kararlar` AUTH-002 | `RolesGuard`'ın ilk gerçek endpoint kullanımı |
| Faz 1'de ertelenen `LOGIN`/`LOGIN_FAILED` audit | `docs/03` §5.1 sıralama notu, §6 | `auth.service.ts`/`login-throttler.guard.ts` retrofit |
| Zorunlu negatif senaryo #6 (`User` → Admin endpoint `403`) | `docs/08` §4 | integration test |

**Kalite kapıları:**
- [ ] Unit test: `AuditService.record`, `NetworksService.activateNetworkAsset` (başarı + `RESOURCE_NOT_FOUND`)
- [ ] Integration test: `PATCH admin/network-assets` admin ile `200` + `audit_logs` satırı; user ile `403` (senaryo #6)
- [ ] Integration test: login → `audit_logs` `LOGIN`; yanlış şifre → `LOGIN_FAILED`
- [ ] `prisma migrate dev` hatasız
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** frontend toggle ekranı (§2.4), `mint_operations` audit (Faz 4/6), transfer state event audit (Faz 5) — kalıp burada kurulur, diğer modüller kendi audit çağrılarını sonraki fazlarda ekler.

**Risk / dikkat:** `AuditService.record`'un kendi transaction'ını açmaması kritik bir kısıttır — bir servis yanlışlıkla `record()` içinde ayrı bir `prisma.$transaction` başlatırsa çağıranın transaction'ına katılmaz ve `docs/04` §7'nin atomiklik garantisi (state + audit birlikte yazılır/geri alınır) bozulur; code review'da özellikle bu noktaya bakılmalı.

**Stop:**
- [ ] `pnpm --filter api exec prisma migrate dev`
- [ ] `pnpm --filter api test -- audit`
- [ ] `pnpm --filter api test -- networks`
- [ ] `pnpm --filter api test -- auth`
- [ ] PR/onay → İterasyon 4

---

### İterasyon 4 — Admin Layout + S-ADMIN-NETWORK-ASSETS (§2.4)

**Hedef:** `(admin)` route group, admin nav bar, ağ/varlık aktivasyon ekranı gerçek tarayıcıda çalışır durumda; bu, Faz 2'nin İnsan onay noktasının frontend tarafıdır.

**Teslim çıktısı:**
- `apps/web/src/app/(admin)/layout.tsx`, `(admin)/network-assets/page.tsx`
- `middleware.ts` güncellemesi (`(admin)` path'leri için cookie varlık kontrolü)
- `hooks/useNetworks.ts`, `hooks/useNetworkAssets.ts`, `hooks/useToggleNetworkAsset.ts`

**Önkoşullar:**
- [ ] İterasyon 3 Stop tamam (backend admin endpoint uçtan uca çalışıyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §2.4 — kapsam
2. `docs/06_SCREEN_CATALOG.md` §4.4 S-ADMIN-NETWORK-ASSETS — alan listesi, UX state'leri, TR metin listesi
3. `docs/05_FRONTEND_SPEC.md` (`(admin)` route group, middleware, layout hiyerarşisi)
4. `add-new-screen` skill (prosedür referansı)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/admin-network-assets-screen` branch'i aç.
2. `middleware.ts`: `(admin)` path'leri için Faz 1 §1.7'deki `(authenticated)` kontrolüne ek olarak yalnızca refresh cookie varlığı kontrol edilir (cookie `httpOnly` olduğundan içeriği/rolü okunamaz — `docs/05` §2); asıl rol zorlaması backend'de zaten kesindir (`docs/07` §4 "yalnızca backend'de zorlanır" ilkesi).
3. `app/(admin)/layout.tsx`: admin nav bar — **bu iterasyonda yalnızca "Ağ / Varlık Yönetimi" linki gerçektir**; "Mock Mint" (Faz 4 §4.4), "Audit Log" (Faz 6 §6.3), "Kullanıcılar" (Faz 6 §6.4) henüz route'u olmadığından nav'a eklenmez — kendi fazları nav listesini genişletecektir. İçerik alanında `AuthContext`'ten okunan rol `admin` değilse (backend `403` dönmeden önce bir UX kısayolu olarak) `/dashboard`'a yönlendirilir — S-FORBIDDEN-403 henüz yok (Faz 7 §7.4), bu yüzden geçici hedef Faz 1 §1.7'nin placeholder dashboard'udur. `TestnetDisclaimer` eklenir.
4. `hooks/useNetworks.ts` (`GET /networks`), `hooks/useNetworkAssets.ts` (`GET /networks/:id/assets?activeOnly=false`), `hooks/useToggleNetworkAsset.ts` (`PATCH` mutation; optimistic update + başarısızlıkta rollback — `docs/06` §4.4 "başarısız olursa eski duruma geri döner").
5. `app/(admin)/network-assets/page.tsx` — network/asset tablosu, her satırda aktif/pasif switch, pasif çiftlerde "Mevcut cüzdanlar salt-okunur kalacak" bilgi notu, hata toast'ı ("Durum güncellenemedi, lütfen tekrar deneyin.").
6. Manuel doğrulama: admin ile giriş → `/admin/network-assets` → bir çifti pasif yap → DB'de `audit_logs`'a `NETWORK_ASSET_DEACTIVATED` satırı düştüğü doğrulanır (Faz 2 İnsan onay noktası).
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(admin)/layout.tsx`, `(admin)/network-assets/page.tsx`, `hooks/useNetworks.ts`, `useNetworkAssets.ts`, `useToggleNetworkAsset.ts` |
| Güncelle | `middleware.ts` |
| Dokunma | S-ADMIN-MINT/S-ADMIN-AUDIT-LOG/S-ADMIN-USER-DETAIL (Faz 4/6), S-FORBIDDEN-403 (Faz 7) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Alan listesi / TR metinler | `docs/06` §4.4 | "Ağ / Varlık Yönetimi", "Aktif", "Pasif", "Mevcut cüzdanlar salt-okunur kalacak.", "Durum güncellenemedi, lütfen tekrar deneyin." |
| Toggle anında `PATCH` tetikler, ayrı "Kaydet" yok | `docs/06` §4.4 | mutation `onError`'da eski state'e dön |
| Admin route yalnızca backend'de kesin korunur | `docs/07` §4 | middleware + client-side rol kontrolü yalnızca UX |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok — `docs/08` frontend birim testi tanımlamıyor (Faz 1 §1.7 ile aynı gerekçe), doğrulama e2e'de (Faz 7 §7.3) ve manuel adımda yapılır

**Bu iterasyonda yok:** S-ADMIN-MINT, S-ADMIN-AUDIT-LOG, S-ADMIN-USER-DETAIL sayfaları/nav linkleri (Faz 4/6), S-FORBIDDEN-403 (Faz 7 — bu fazda geçici olarak `/dashboard`'a yönlenilir).

**Risk / dikkat:** Admin nav bar'ın bu iterasyonda tek linkli kalması teknik borç değil, planlı bir ara durumdur — Faz 4/6 kendi sayfalarını eklerken nav listesini de genişletmelidir; bu not PR açıklamasında tekrarlanmalı ki unutulmasın (Faz 1'in dashboard placeholder'ı için uygulanan disiplinin aynısı).

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (admin login → toggle → `audit_logs` kaydı)
- [ ] PR/onay → İterasyon 5

---

### İterasyon 5 — `IChainProvider` Arayüzü ve Chain ID Allowlist (§2.5)

**Hedef:** `packages/chain-providers` (Faz 0'dan beri boş placeholder) ilk gerçek içeriğini kazanır: `IChainProvider` arayüzü metod imzalarıyla (gövdeler henüz yok) tanımlanır; `EvmProvider`/`TronProvider` sınıfları constructor'da `CHAIN_ID_ALLOWLIST` kontrolü yapar; mainnet chain ID'siyle başlatma denemesi reddedilir ve unit testle kanıtlanır (zorunlu negatif senaryo #11).

**Teslim çıktısı:**
- `packages/chain-providers/src/{i-chain-provider.ts, chain-id-allowlist.ts, evm-provider.ts, tron-provider.ts}` + `.spec.ts` dosyaları

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (seed'deki `chain_id` değerleri, allowlist testinin referans aldığı pozitif senaryo verisidir)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §2.5 — kapsam
2. `docs/mimari-kararlar.md` SEC-005 (allowlist zorunluluğu), I-001 (arayüz + iki implementasyon), I-002 (veri kaynağı matrisi — `getBalance` imzasının EVM/Tron farkını yansıtması için)
3. `docs/04_BACKEND_SPEC.md` §10 (`CHAIN_ID_ALLOWLIST` env formatı — örnek değerin İterasyon 1'deki risk notuna göre yorumlanacağını unutma)
4. `docs/08_TESTING_STRATEGY.md` §3-4 (kritik modül tanımı, zorunlu negatif senaryo #11)
5. `docs/mimari-kararlar.md` §14 TS-001 (ethers v6, tronweb)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/chain-provider-skeleton-allowlist` branch'i aç.
2. `ethers@^6`, `tronweb` paketlerini `packages/chain-providers`'a ekle.
3. `i-chain-provider.ts`: `interface IChainProvider { readonly chainType: 'evm' | 'tron'; getBalance(address: string, asset: { contractAddress: string | null; decimals: number }): Promise<string>; broadcastTransaction(signedTxHex: string): Promise<{ txHash: string }>; }` — dönüş tipleri sayısal tip disiplinine uyar (asla `number`, yalnızca `string`/`BigInt`).
4. `chain-id-allowlist.ts`: `assertChainIdAllowed(chainId: string, allowlist: string[])` — `allowlist` içinde yoksa `ChainIdNotAllowedException` fırlatır; `allowlist` parametresi `apps/api`'nin `ConfigService`'inden (`CHAIN_ID_ALLOWLIST`, virgülle ayrılmış) okunup çağırana geçirilir — `chain-providers` paketi kendi env okumaz, bağımsız/test edilebilir kalır.
5. `evm-provider.ts`: `class EvmProvider implements IChainProvider` — constructor'ın **ilk satırı** `assertChainIdAllowed(network.chainId, allowlist)` çağırır; `ethers.JsonRpcProvider` yalnızca saklanır (bu iterasyonda gerçek RPC çağrısı yapılmaz); `getBalance`/`broadcastTransaction` `NotImplementedException` fırlatan stub'lardır (Faz 3 §3.2 `getBalance`'ı, Faz 5 `broadcastTransaction`'ı dolduracak — arayüz burada sabitlendiğinden gövde değişiklikleri arayüzü etkilemeyecek).
6. `tron-provider.ts`: aynı kalıp, `tronweb` ile (Sepolia/BSC Testnet aynı `EvmProvider`'ı paylaşır — `mimari-kararlar` I-001 — Tron ayrı bir class'tır).
7. Unit test: İterasyon 1'in seed'indeki üç geçerli `chain_id` (`'11155111'`, `'97'`, `'shasta'`) ile provider başarıyla kurulur (pozitif senaryo); mainnet chain id (`'1'` — Ethereum mainnet) ile kurulum denemesi `ChainIdNotAllowedException` ile reddedilir (zorunlu negatif senaryo #11); boş/tanımsız `allowlist` fail-fast davranır.
8. `packages/chain-providers/src/index.ts` barrel güncellenir.
9. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `i-chain-provider.ts`, `chain-id-allowlist.ts`, `evm-provider.ts`, `tron-provider.ts` (+ `.spec.ts` dosyaları) |
| Güncelle | `packages/chain-providers/package.json` (`ethers`, `tronweb`), `src/index.ts` |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Mainnet chain ID reddi | `mimari-kararlar` SEC-005, `docs/08` senaryo #11 | `assertChainIdAllowed` constructor'ın ilk satırı |
| `EvmProvider` (ethers v6, Sepolia+BSC Testnet aynı kod) | `mimari-kararlar` I-001 | tek class, network config parametresiyle değişir |
| `TronProvider` (tronweb) | `mimari-kararlar` I-001 | ayrı class |
| Arayüz metodları bu fazda gövdesiz | `docs/10` §2.5 "henüz gerçek RPC çağrısı yapmadan" | `NotImplementedException` stub |

**Kalite kapıları:**
- [ ] Zorunlu negatif senaryo #11 testi geçiyor
- [ ] Geçerli 3 ağ için provider başarıyla kuruluyor (pozitif senaryo)
- [ ] lint/typecheck yeşil
- [ ] ≥%80 coverage bu pakette henüz CI gate'i olarak zorunlu değil (Faz 7 §7.1'de eklenir) ama testler baştan bu hedefi gözetir (`docs/08` §3 kritik modül önceliği)

**Bu iterasyonda yok:** `getBalance`/`broadcastTransaction`'ın gerçek implementasyonu (Faz 3 §3.2, Faz 5), coverage gate'inin CI'a eklenmesi (Faz 7 §7.1), BTC/XRP gibi yeni ağ implementasyonları (teknik borç kaydı — arayüz bunu engellemez ama şimdi eklenmez).

**Risk / dikkat:** "Allowlist genişletilmez" kuralı (`mimari-kararlar` CODE-004) — bu iterasyonda veya sonrasında hiçbir PR `CHAIN_ID_ALLOWLIST`'e mainnet chain id ekleyemez; code review'da özellikle kontrol edilir. Ayrıca İterasyon 1'de sabitlenen `chain_id` string'leriyle burada test edilen değerler arasında bir sapma olursa (ör. biri `'11155111'` diğeri `'sepolia'` yazarsa) allowlist kontrolü hiçbir zaman geçmez ve tüm provider'lar hep reddedilir — bu iki iterasyon arasında bilinçli bir çapraz kontrol gerektirir.

**Stop:**
- [ ] `pnpm --filter chain-providers test`
- [ ] PR/onay → Faz 2 Done Definition tamam; `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 2 işaretlenir; kullanıcı onayı → Faz 3
