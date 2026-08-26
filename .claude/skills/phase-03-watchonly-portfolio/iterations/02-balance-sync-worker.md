### İterasyon 2 — Balance-sync Worker + `getBalance()` İmplementasyonu (§3.2)

**Hedef:** `balance_caches` tablosu oluşur; sistemin ilk BullMQ worker'ı (`balance-sync`) her aktif cüzdan/varlık çifti için RPC/TronGrid'den bakiye okuyup `balance_caches`'i günceller; `EvmProvider`/`TronProvider.getBalance()` (Faz 2 §2.5'ten beri `NotImplementedException` stub'u) ilk kez gerçek RPC çağrısı yapar.

**Teslim çıktısı:**
- `balance_caches` migration
- `packages/chain-providers/src/{evm-provider.ts, tron-provider.ts}` güncellemesi (`getBalance()` gövdesi)
- `apps/api/src/workers/balance-sync/{balance-sync.module.ts, balance-sync.processor.ts}` (+ `.spec.ts`)
- `wallets/wallets.repository.ts` güncellemesi (aktif cüzdan/varlık çiftlerini listeleme sorgusu)

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (`wallets` tablosu ve en az bir watch-only cüzdan seed'de mevcut)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.2 — kapsam
2. `docs/02_DATABASE_SCHEMA.md` §2.6 `balance_caches` — tam şema, bileşik PK
3. `docs/04_BACKEND_SPEC.md` §8 Background Job/Worker Kalıbı — kuyruk tablosu, idempotency, retry/backoff (bu iterasyon bu kalıbın ilk somut örneğidir)
4. `docs/mimari-kararlar.md` I-002 (veri kaynağı matrisi — EVM: RPC, Tron: TronGrid), I-003 (RPC sayfa yüklemesinde asla çağrılmaz), I-006 (retry/backoff), I-009 (rate limit stratejisi)
5. `docs/08_TESTING_STRATEGY.md` §5 — chain provider testleri gerçek RPC'ye karşı değil mock/stub yanıtlarla çalışır

**Uygulama planı:**
1. `git-phase-branch` ile `feat/balance-sync-worker` branch'i aç.
2. `add-prisma-migration` prosedürüyle `balance_caches` tablosunu (`docs/02` §2.6 birebir, `(wallet_id, asset_id)` bileşik PK) ekle.
3. `chain-providers/src/evm-provider.ts`: `getBalance(address, asset)` — `asset.contractAddress` `null` ise `provider.getBalance(address)` (native), doluysa minimal ERC-20 ABI (`balanceOf`) ile kontrat çağrısı; dönüş `BigInt`'in `toString()`'i (asla `number`).
4. `chain-providers/src/tron-provider.ts`: aynı mantık `tronweb` ile — native TRX için `trx.getBalance`, TRC-20 için kontrat `balanceOf`.
5. `wallets/wallets.repository.ts`: `findActiveWalletAssetPairs()` — tüm cüzdanları, kendi ağlarındaki aktif (`network_assets.is_active = true`) varlıklarla `JOIN` ederek döner (Prisma sorgusu).
6. `workers/balance-sync/balance-sync.processor.ts`: BullMQ processor, periyodik tetiklenir (kısa aralık — `docs/04` §8 "periyodik (kısa aralıklı)"); her `(wallet, asset)` çifti için ilgili `IChainProvider` (network'ün `chainType`'ına göre `EvmProvider`/`TronProvider`) enjekte edilir, `getBalance()` çağrılır, sonuç `balance_caches`'e `upsert` edilir. Job id `(walletId, assetId)` bileşik anahtarından türetilir (`docs/04` §8 idempotency).
7. `workers/balance-sync/balance-sync.module.ts`: `BullModule.registerQueue({ name: 'balance-sync' })`, `WalletsModule`/`NetworksModule` import edilir (Faz 2 İterasyon 5'in `IChainProvider` implementasyonlarına erişim için).
8. RPC/TronGrid çağrılarında merkezi rate-limiter (BullMQ concurrency limiti veya `bottleneck`) uygulanır (`mimari-kararlar` I-009) — worker'ın `concurrency` seçeneği ile sınırlanır, ayrı bir dış kütüphane eklenmeden.
9. Unit test (`evm-provider`/`tron-provider`): mock RPC/TronGrid client ile `getBalance()` doğru string döner (native + kontrat). Unit test (`balance-sync.processor`): mock provider ile `balance_caches` doğru upsert edilir; RPC hatası job'u `failed`'e düşürür (exception fırlatır, worker retry'a bırakır).
10. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `workers/balance-sync/{balance-sync.module.ts, balance-sync.processor.ts}` (+`.spec.ts`) |
| Güncelle | `schema.prisma`, `chain-providers/src/evm-provider.ts`, `tron-provider.ts` (+ mevcut `.spec.ts` dosyaları), `wallets/wallets.repository.ts` (+`.spec.ts`), `apps/api/src/app.module.ts` |
| Dokunma | `price-sync` worker (İterasyon 3), `GET /wallets` (İterasyon 4 — bu iterasyon yalnızca veriyi üretir, henüz okuma endpoint'i yok) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Bakiye asla sayfa yüklemesinde RPC ile hesaplanmaz | `mimari-kararlar` I-003 | Worker DB'ye yazar, UI DB'den okur (İterasyon 4) |
| `(chain, txHash)`/`(transferId, targetState)` tarzı idempotent job id | `docs/04` §8 | `(walletId, assetId)` bileşik anahtar |
| Exponential backoff (1s,2s,4s… maks 5) | `mimari-kararlar` I-006 | BullMQ `attempts`+`backoff` job seçenekleri |
| Tutar her zaman string/BigInt, asla `number` | `docs/04` §5, `CLAUDE.md` §02 | `getBalance()` dönüşü `.toString()` |

**Kalite kapıları:**
- [ ] Unit test: `getBalance()` native + kontrat, mock RPC/TronGrid (chain-providers kritik modül coverage'ına katkı)
- [ ] Unit test: `balance-sync.processor` başarı + hata senaryosu
- [ ] Chain provider testleri gerçek testnet'e karşı çalışmaz — sabit mock/stub yanıt (`docs/08` §5)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** `broadcastTransaction()`'ın implementasyonu (Faz 5), `GET /wallets`'in bu bakiyeyi API'de sunması (İterasyon 4), fiyat/USDT dönüşümü (İterasyon 3 sonrası, İterasyon 4/5).

**Risk / dikkat:** Bu, sistemin ilk gerçek worker'ıdır — burada kurulan kuyruk kayıt/modül/DI kalıbı (`BullModule.registerQueue` + processor kendi alt-modülünde) İterasyon 3, 5, 8'in de temelini oluşturur; kalıptan sapma sonraki iterasyonlarda tutarsızlığa yol açar. RPC sağlayıcı kesintisi/rate limit riski kabul edilmiş bir dış risktir (`docs/10` §5 Risk Kaydı) — testler bu riske karşı mock ile izole edilir, gerçek sağlayıcı kararlılığı bu iterasyonun sorumluluğu değildir.

**Stop:**
- [ ] `pnpm --filter chain-providers test -- provider`
- [ ] `pnpm --filter api test -- balance-sync`
- [ ] PR/onay → İterasyon 3
