### İterasyon 2 — HD Wallet Türetme + `POST /wallets/managed` (§4.2)

**Hedef:** `POST /wallets/managed` çalışır — backend bir sonraki HD türetme index'ini hesaplar, `IChainProvider.deriveWallet()` ile adres+private key üretir, `EnvelopeEncryptionService` ile şifreler, `wallets`'a yazar; private key'in yanıtta hiçbir zaman dönmediği testle kanıtlanır.

**Teslim çıktısı:**
- `wallets.encrypted_private_key` migration
- `packages/chain-providers`: `IChainProvider.deriveWallet()` + `EvmProvider`/`TronProvider` implementasyonları (+ `.spec.ts`)
- `apps/api/src/wallets/wallets.service.ts` → `createManaged()`, `wallets.controller.ts` → `POST /wallets/managed`, `wallets.repository.ts` → `findMaxDerivationIndex()`
- `packages/types/src/schemas/wallet.schema.ts` → `createManagedWalletSchema`
- `HD_WALLET_MNEMONIC` env değişkeni (`config/env.schema.ts`)

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (`EnvelopeEncryptionService` ≥%80 coverage)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §4.2 — kapsam
2. `docs/03_API_CONTRACTS.md` §5.2 `POST /wallets/managed` — request/response/hata kodları/audit event
3. `docs/01_DOMAIN_MODEL.md` §5.1 Cüzdan ekleme akışı (Managed) — türetme sırası
4. `docs/02_DATABASE_SCHEMA.md` §2.5 — `derivation_index`, `encrypted_dek`, `encrypted_private_key` kolonları
5. `docs/04_BACKEND_SPEC.md` §10 — `HD_WALLET_MNEMONIC` env değişkeni

**Uygulama planı:**
1. `git-phase-branch` ile `feat/hd-wallet-managed-endpoint` branch'i aç.
2. `add-prisma-migration` prosedürüyle `wallets.encrypted_private_key` (`TEXT`, nullable) kolonunu ekle — additive migration, mevcut watch-only satırları etkilenmez (`docs/02` §2.5 notu).
3. `config/env.schema.ts`'e `HD_WALLET_MNEMONIC: z.string().refine(ethers.Mnemonic.isValidMnemonic, 'invalid BIP-39 mnemonic')` ekle (ethers v6'nın kendi mnemonic doğrulayıcısı kullanılır, yeni bir `bip39` bağımlılığı eklenmez).
4. `packages/chain-providers`: `IChainProvider` arayüzüne `deriveWallet(mnemonic: string, index: number): { address: string; privateKey: string }` ekle. `EvmProvider.deriveWallet`: `ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, \`m/44'/60'/0'/0/${index}\`)` → `{ address: hdNode.address, privateKey: hdNode.privateKey }` (coinType 60, Sepolia ve BSC Testnet ortak). `TronProvider.deriveWallet`: aynı secp256k1 türetmeyi `m/44'/195'/0'/0/${index}` path'iyle yapıp (`ethers.HDNodeWallet.fromPhrase` — türetme zincir-agnostiktir, yalnızca adres kodlaması farklıdır), çıkan raw private key'i `TronWeb.address.fromPrivateKey()` ile Tron base58check adresine çevirir.
5. `wallets.repository.ts`: `findMaxDerivationIndex(coinType: 60 | 195): Promise<number | null>` — `type = 'managed'` ve ilgili `network.chainType`'a ait satırlar arasında `MAX(derivation_index)`. Sonraki index tüm ağlar arası (Sepolia+BSC Testnet aynı coinType 60'ı paylaşır) **tek bir global sayaçtır** — kullanıcı bazlı veya ağ bazlı ayrı sayaç tutulmaz; bu, `m/44'/<coinType>'/0'/0/<index>` path'inin yalnızca coinType'a bağlı olmasının doğal sonucudur (bkz. Risk).
6. `wallets.service.ts`: `createManaged(userId, { networkId })` — sırasıyla: `NetworksService` üzerinden aktiflik kontrolü (en az bir aktif asset var mı; yoksa `NetworkAssetInactiveException` — Faz 3 İterasyon 1'deki watch-only kalıbının aynısı), `chainProviderFactory`'den `network.chainType`'a göre provider seçimi, `findMaxDerivationIndex` ile sıradaki index, `deriveWallet(mnemonic, index)`, `EnvelopeEncryptionService.encryptPrivateKey(privateKey)`, `prisma.$transaction` içinde `wallets` insert (`select` yalnızca `id, address, networkId, type, createdAt` — `encryptedDek`/`encryptedPrivateKey` asla select edilmez, `docs/02` §6 kısıtı) + `AuditService.record` ile `WALLET_CREATED` (`metadata: { type: 'managed' }`).
7. `wallets.controller.ts`: `POST /wallets/managed` — body `ZodValidationPipe(createManagedWalletSchema)` (`{ networkId: z.string().uuid() }.strict()`).
8. Unit test (`chain-providers`): `deriveWallet` aynı mnemonic+index için deterministik aynı adresi üretir; farklı index farklı adres üretir; EVM ve Tron farklı adres formatı döner. Unit test (`wallets.service`): başarılı oluşturma (mock `EnvelopeEncryptionService`/`deriveWallet`) + audit çağrısı; pasif network-asset reddi. Integration test: `201` happy path — **yanıt body'sinde `privateKey`, `encryptedDek`, `encryptedPrivateKey` alanlarının hiçbirinin bulunmadığı** ayrıca assert edilir (bu, Faz 4 İnsan onay noktasının otomatik testle karşılığıdır).
9. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `types/src/schemas/wallet.schema.ts` güncellemesi (`createManagedWalletSchema`) |
| Güncelle | `schema.prisma`, `config/env.schema.ts`, `chain-providers/src/{evm-provider.ts, tron-provider.ts, i-chain-provider.ts}` (+`.spec.ts`), `wallets/{wallets.service.ts, wallets.controller.ts, wallets.repository.ts}` (+`.spec.ts`) |
| Dokunma | `envelope-encryption.service.ts` (İterasyon 1'de tamamlandı, yalnızca tüketilir) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `m/44'/<coinType>'/0'/0/<index>` türetme | `docs/01` §5.1, `mimari-kararlar` W-001 | `deriveWallet()`, coinType 60 (EVM) / 195 (Tron) |
| Pasif `(network, asset)` çiftinde managed cüzdan eklenemez | `docs/01` §4 madde 1 | `NetworksService` aktiflik kontrolü (Faz 3 kalıbı) |
| Private key hiçbir API yanıtında dönmez | `docs/03` §5.2 | `select` alan listesi + integration test assert |
| `wallets` insert + `audit_logs` tek transaction | `docs/04` §7 | `prisma.$transaction`, Faz 2/3 kalıbının tekrarı |

**Kalite kapıları:**
- [ ] Unit: `deriveWallet` determinizm + EVM/Tron adres format farkı (`packages/chain-providers` coverage'ı ≥%80 hedefine katkı sağlar)
- [ ] Unit: `WalletsService.createManaged` başarı + pasif network-asset deny senaryosu
- [ ] Integration: `201` + yanıt body'sinde private key/DEK alanı **yok** assert'i
- [ ] `pnpm --filter api exec prisma migrate dev` hatasız
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** Frontend formu (İterasyon 3); mock kontrat/mint (İterasyon 4-6); Faz 5'in signing worker'ının `decryptPrivateKey`'i gerçekten çağırması (bu iterasyon yalnızca şifreleme yönünü kullanır, çözme yönü Faz 5'e kadar hiçbir kod yolunda tetiklenmez).

**Risk / dikkat:** Sıradaki index'in hesaplanması ile `wallets` insert'i arasında bir transaction/lock yoktur — eşzamanlı iki managed cüzdan oluşturma isteği (aynı coinType için) teorik olarak aynı index'i hesaplayabilir; bu, demo ölçeğinde (birkaç manuel test kullanıcısı, `mimari-kararlar` S-001) kabul edilen bir kalıntı risktir, `(network_id, address)` UNIQUE constraint'i çakışmayı en azından ikinci isteği `409`'a düşürerek yakalar. `HDNodeWallet.fromPhrase` her çağrıda mnemonic'i yeniden parse eder — performans kritik değildir (kullanıcı başına nadir bir işlem), önceden hesaplanmış bir `HDNodeWallet` instance'ı cache'lenmez çünkü mnemonic'i bellekte gereksiz yere uzun tutmamak tercih edilir.

**Stop:**
- [ ] `pnpm --filter chain-providers test -- derive-wallet`
- [ ] `pnpm --filter api test -- wallets`
- [ ] PR/onay → İterasyon 3
