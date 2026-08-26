### İterasyon 5 — `mint_operations` + `POST /admin/mint` (§4.4b)

**Hedef:** Admin, `POST /admin/mint` ile bir kullanıcının cüzdanına mock test bakiyesi mint edebiliyor — kontratın `mint()` fonksiyonu gerçekten zincirde çağrılıyor, sonuç `mint_operations` + `audit_logs`'a tek transaction içinde yazılıyor. Ayrıca `GET /admin/users` (email arama) eklenir — S-ADMIN-MINT'in kullanıcı seçim alanının bağımlı olduğu, daha önce hiçbir fazda tanımlanmamış bir okuma endpoint'i (`docs/03_API_CONTRACTS.md` §5.8 notu).

**Teslim çıktısı:**
- `mint_operations` migration
- `packages/chain-providers`: `IChainProvider.mintToken()` (+ `.spec.ts`)
- `apps/api/src/admin/{admin.module.ts, admin.controller.ts, mint.service.ts, mint.repository.ts, admin-users.service.ts}` (+ `.spec.ts` dosyaları) — bu fazda ilk kez oluşturulan yeni bir modül (Faz 2 §2.3'ün `PATCH /admin/network-assets`'i `networks/` modülünde yaşar, `admin/` değil — `docs/04_BACKEND_SPEC.md` §2)
- `packages/types/src/schemas/mint.schema.ts`
- `GET /admin/users` (email arama) — `docs/03` §5.8

**Önkoşullar:**
- [ ] İterasyon 4 Stop tamam (üç ağda mock kontrat deploy edildi, `assets.contract_address` dolu, `MINT_OPERATOR_PRIVATE_KEY` = İterasyon 4'ün `CONTRACT_DEPLOYER_PRIVATE_KEY`'i `apps/api/.env`'e eklendi)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §4.4 (b kısmı) — kapsam
2. `docs/02_DATABASE_SCHEMA.md` §2.11 `mint_operations` — tam şema
3. `docs/03_API_CONTRACTS.md` §5.8 `POST /admin/mint` ve `GET /admin/users`, §6 rate limit tablosu (`adminId` anahtarlı, 20 istek/dk)
4. `docs/01_DOMAIN_MODEL.md` §2.10 MintOperation — yaşam döngüsü ("bir `Transfer` kaydı değildir, ayrı bir varlıktır")
5. `docs/04_BACKEND_SPEC.md` §7 Transaction Yönetimi (admin mint işlemi `$transaction` kalıbı, madde 2'de zaten örneklenmiş)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/admin-mint-endpoint` branch'i aç.
2. `add-prisma-migration` prosedürüyle `mint_operations` tablosunu `docs/02` §2.11 ile birebir ekle.
3. `packages/chain-providers`: `IChainProvider`'a `mintToken(contractAddress: string, toAddress: string, amountRaw: string, operatorPrivateKey: string): Promise<{ txHash: string }>` ekle. `EvmProvider.mintToken`: `new ethers.Contract(contractAddress, MOCK_ERC20_ABI, new ethers.Wallet(operatorPrivateKey, provider))` üzerinden `mint(toAddress, amountRaw)` çağrısı, `tx.wait()` sonrası `txHash` döner; RPC hatasında (ör. `CALL_EXCEPTION`, ağ zaman aşımı) `ChainProviderUnavailableException` fırlatır. `TronProvider.mintToken`: aynı akışın `tronweb` karşılığı (`tronWeb.contract(abi, contractAddress).mint(toAddress, amountRaw).send()`). `MOCK_ERC20_ABI` sabiti (`['function mint(address to, uint256 amount) external']`) `packages/chain-providers/src/abi/mock-erc20.abi.ts`'te tutulur — İterasyon 4'ün Solidity kaynağıyla elle senkron tutulur (kontrat arayüzü sabit, otomatik ABI üretimi bu ölçekte gerekmez).
4. `packages/types/src/schemas/mint.schema.ts`: `mintSchema = z.object({ walletId: z.string().uuid(), assetId: z.string().uuid(), amount: z.string().regex(/^\d+$/) }).strict()` — tutar disiplini `docs/04` §5 ile aynı (asla `z.number()`).
5. `mint.repository.ts`: `create(tx, data)`; `mint.service.ts`: `mint(adminId, { walletId, assetId, amount })` — sırasıyla: `wallet`/`asset` var mı (yoksa `ResourceNotFoundException`), `network.chainType`'a göre provider seçimi, `chainProvider.mintToken(asset.contractAddress, wallet.address, amount, config.MINT_OPERATOR_PRIVATE_KEY)`, başarılı `txHash` ile `prisma.$transaction` içinde `mint_operations` insert + `AuditService.record` ile `MINT_EXECUTED` (`metadata: { walletId, assetId, amount }`, `docs/04` §7 kalıbı).
6. `admin.controller.ts`: `POST /admin/mint` — `@Roles('admin')`, body `ZodValidationPipe(mintSchema)`, `@Throttle({ default: { limit: 20, ttl: 60_000 } })` (`docs/03` §6, `adminId` anahtarlı — `ThrottlerGuard`'ın custom key üretimi `req.user.id` kullanır).
7. `admin-users.service.ts`: `search(email?: string, page, pageSize)` — `prisma.user.findMany({ where: email ? { email: { contains: email, mode: 'insensitive' } } : undefined, select: { id, email, role, createdAt } })` (`password_hash` asla select edilmez); `admin.controller.ts`'e `GET /admin/users` (`@Roles('admin')`) eklenir.
8. `admin.module.ts` oluşturulup `app.module.ts`'e import edilir; `AuditModule`, `WalletsModule` (cüzdan/varlık okuma için), `NetworksModule` import edilir.
9. Unit test (`chain-providers`): `mintToken` başarı (mock RPC yanıtı) + RPC hatasında `ChainProviderUnavailableException`. Unit test (`mint.service`): başarılı mint + audit çağrısı; cüzdan/varlık bulunamama; provider hatası `CHAIN_PROVIDER_UNAVAILABLE`'a düşer. Unit test (`admin-users.service`): email filtresiyle/filtresiz arama, `password_hash`'in dönüşte olmadığı assert'i. Integration test: `201` happy path (mock chain provider); `403 FORBIDDEN_ROLE` (`User` rolü); `404 RESOURCE_NOT_FOUND`; `GET /admin/users?email=` `200`.
10. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `chain-providers/src/abi/mock-erc20.abi.ts`, `types/src/schemas/mint.schema.ts`, `admin/{admin.module.ts, admin.controller.ts, mint.service.ts, mint.repository.ts, admin-users.service.ts}` (+`.spec.ts` dosyaları) |
| Güncelle | `schema.prisma`, `apps/api/src/app.module.ts`, `packages/types/src/index.ts`, `chain-providers/src/{evm-provider.ts, tron-provider.ts, i-chain-provider.ts}` (+`.spec.ts`), `config/env.schema.ts` (`MINT_OPERATOR_PRIVATE_KEY`) |
| Dokunma | `GET /wallets?userId=` (Faz 3'te zaten var, bu iterasyon dokunmaz — İterasyon 6'da frontend tarafından tüketilir) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Mint bir `Transfer` kaydı değildir, ayrı bir varlıktır | `docs/01` §2.10 | `mint_operations` tablosu, `transfers`'a hiç dokunmaz |
| Kontratın `mint()` fonksiyonu gerçekten çağrılır | `docs/01` §2.10, `mimari-kararlar` AP-002/I-008 | `IChainProvider.mintToken()` |
| `mint_operations` + `audit_logs` tek transaction | `docs/04` §7 | `prisma.$transaction`, Faz 2/3 kalıbının tekrarı |
| `20 istek/dk`, `adminId` anahtarlı rate limit | `docs/03` §6 | `@Throttle()` custom key |
| `CHAIN_PROVIDER_UNAVAILABLE` | `docs/03` §5.8 | RPC hatası → domain exception mapping |
| Kullanıcı arama, `password_hash` sızdırmaz | `docs/03` §5.8 `GET /admin/users` | Prisma `select` alan listesi |

**Kalite kapıları:**
- [ ] Unit test: `IChainProvider.mintToken` (başarı + RPC hatası — `packages/chain-providers` ≥%80 coverage hedefine katkı)
- [ ] Unit test: `MintService.mint` (başarı + `RESOURCE_NOT_FOUND` + `CHAIN_PROVIDER_UNAVAILABLE`)
- [ ] Unit test: `AdminUsersService.search` (filtreli/filtresiz, `password_hash` yok)
- [ ] Integration test: `201`, `403 FORBIDDEN_ROLE`, `404 RESOURCE_NOT_FOUND`, `GET /admin/users?email=` `200`
- [ ] `pnpm --filter api exec prisma migrate dev` hatasız
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** S-ADMIN-MINT frontend ekranı (İterasyon 6); `GET /admin/users/:userId/wallets` path-param alias'ı (Faz 6 §6.4 — bu iterasyon ve İterasyon 6, mevcut `GET /wallets?userId=`'i kullanır); audit log **okuma** endpoint'i (`GET /admin/audit-logs`, Faz 6 §6.3 — bu iterasyon yalnızca yazar).

**Risk / dikkat:** `mintToken` çağrısı senkron olarak `POST /admin/mint`'in HTTP yaşam döngüsü içinde beklenir (`tx.wait()`) — Faz 5'in `signing`/`broadcast` worker'larının aksine burada bir kuyruğa devredilmez, çünkü mint akışı Transfer state machine'in bir parçası değildir ve gecikmesi (birkaç saniye, testnet blok süresi) admin panelinde kabul edilebilir bir bekleme sayılır (`docs/06_SCREEN_CATALOG.md` S-ADMIN-MINT "Mint ediliyor..." UX state'i zaten bunu varsayar). `MINT_OPERATOR_PRIVATE_KEY`'in İterasyon 4'ün deploy eden cüzdanıyla **aynı** olmadığı durumda kontrat `mint()` çağrısı `onlyOwner` revert'iyle başarısız olur — bu bir `CHAIN_PROVIDER_UNAVAILABLE` olarak mı yoksa ayrı bir hata olarak mı sınıflandırılacağı `docs/03`'te ayrıca detaylandırılmamıştır; bu iterasyon revert'i de `CHAIN_PROVIDER_UNAVAILABLE`'a eşler (en yakın mevcut hata kodu, yeni bir kod icat edilmez).

**Stop:**
- [ ] `pnpm --filter chain-providers test -- mint-token`
- [ ] `pnpm --filter api test -- admin`
- [ ] PR/onay → İterasyon 6
