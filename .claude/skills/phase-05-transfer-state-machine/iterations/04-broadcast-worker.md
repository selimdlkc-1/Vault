### İterasyon 4 — Broadcast Worker (§5.4)

**Hedef:** `signed` durumuna ulaşan bir transfer, `broadcast` kuyruğundaki worker tarafından `IChainProvider.broadcastTransaction()` ile ağa gönderiliyor; kalıcı RPC hatası (`signed → failed`) ile geçici ağ hatası (exponential backoff retry, N deneme sonrası `failed`) birbirinden ayrı sınıflandırılıyor; başarıda `tx_hash` doluyor ve `signed → broadcast` geçişi tetikleniyor.

**Teslim çıktısı:**
- `apps/api/src/workers/broadcast/{broadcast-queue.module.ts, broadcast.processor.ts}` (+ `.spec.ts`)
- `packages/chain-providers`: `IChainProvider.broadcastTransaction()` + hata sınıflandırma yardımcı fonksiyonu (`classifyRpcError`)
- `signing.processor.ts` → başarılı imzalamanın sonuna `broadcast` kuyruğuna job ekleme
- `transfer-state-machine.service.ts` → `signed: ['broadcast', 'failed']` whitelist genişlemesi

**Önkoşullar:**
- [ ] İterasyon 3 Stop tamam (`signed` durumu üretiliyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §5.4 — kapsam
2. `docs/01_DOMAIN_MODEL.md` §5.2 `signed → broadcast` geçişi — RPC hatası/geçici ağ hatası ayrımı
3. `docs/04_BACKEND_SPEC.md` §8 — `attempts` + `backoff: { type: 'exponential', delay: 1000 }` BullMQ job seçenekleri, idempotency (`(chain, txHash)` bileşik anahtarı bu aşamada henüz `txHash` yokken `transferId:broadcast` job id'si kullanılır)
4. `docs/mimari-kararlar.md` I-006 (retry/backoff), I-005 (idempotency)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/broadcast-worker` branch'i aç.
2. `packages/chain-providers`: `IChainProvider.broadcastTransaction(signedTx: string): Promise<{ txHash: string }>` — `EvmProvider`: `provider.broadcastTransaction(signedTx)`; `TronProvider`: `tronWeb.trx.sendRawTransaction(signedTx)`. Ayrıca `classifyRpcError(error: unknown): 'permanent' | 'transient'` yardımcı fonksiyonu: nonce/gas/yetersiz bakiye gibi hatalar (`INSUFFICIENT_FUNDS`, `NONCE_EXPIRED` gibi ethers/tronweb hata kodları) `'permanent'`, timeout/bağlantı hataları `'transient'` döner — bu sınıflandırma her iki provider'da ortak bir yardımcıda yaşar, worker bu fonksiyonu çağırır.
3. `apps/api/src/workers/broadcast/broadcast-queue.module.ts`: `BullModule.registerQueue({ name: 'broadcast' })`, `imports: [TransfersModule]`.
4. `broadcast.processor.ts` (`@Processor('broadcast')`, `{ attempts: 5, backoff: { type: 'exponential', delay: 1000 } }` job seçenekleriyle kuyruğa eklenecek — bu seçenek `signing.processor.ts`'in `queue.add()` çağrısında tanımlanır, processor'ın kendisinde değil): job payload `{ transferId, signedTx }`; job id `transferId:broadcast`. İşleyici: transfer'i çek, `state !== 'signed'` ise sessizce çık (idempotency). `IChainProvider.broadcastTransaction(signedTx)` çağır; başarıda `TransferStateMachine.transitionTo(prisma, transferId, 'broadcast', 'worker:broadcast', { txHash })` — bu geçişte `transfers.tx_hash` de aynı `$transaction` içinde doldurulur (`transitionTo` metoduna opsiyonel bir `extraFields` parametresi eklenir, yalnızca bu geçiş `txHash` taşır). Hata durumunda `classifyRpcError` ile sınıflandır: `'permanent'` ise doğrudan `transitionTo(..., 'failed', ..., { reason })`; `'transient'` ise exception'ı **yeniden fırlat** (BullMQ processor'da fırlatılan hata job'u `failed` job durumuna düşürür ve queue seviyesindeki `attempts`/`backoff` devreye girer, `docs/04` §6 worker exception handling farkı); son deneme de tükenirse (BullMQ'nun `onFailed` event'i veya `attemptsMade === attempts` kontrolüyle) `transitionTo(..., 'failed', 'worker:broadcast', { reason: 'Ağ zaman aşımı' })` çağrılır.
5. `transfer-state-machine.service.ts`: whitelist'e `signed: ['broadcast', 'failed']` ekle.
6. `signing.processor.ts`'in başarılı imzalama dalının sonuna `broadcastQueue.add('broadcast', { transferId, signedTx }, { jobId: \`${transferId}:broadcast\`, attempts: 5, backoff: { type: 'exponential', delay: 1000 } })` ekle.
7. Unit test (`chain-providers`): `broadcastTransaction` başarı senaryosu (mock RPC); `classifyRpcError` kalıcı/geçici hata ayrımı için en az iki örnek hata koduyla. Unit test (`broadcast.processor.spec.ts`): başarılı broadcast + `txHash` yazımı; kalıcı hata → tek denemede `failed`; geçici hata → exception yeniden fırlatılır (BullMQ'ya devredilir, processor kendi içinde retry döngüsü yazmaz); terminal-state idempotency.
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `workers/broadcast/{broadcast-queue.module.ts, broadcast.processor.ts}` (+`.spec.ts`) |
| Güncelle | `transfers/transfer-state-machine.service.ts`, `workers/signing/signing.processor.ts`, `chain-providers/src/{i-chain-provider.ts, evm-provider.ts, tron-provider.ts}` (+`.spec.ts`), `app.module.ts` |
| Dokunma | `confirmation` kuyruğu (İterasyon 5'te eklenir) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Kalıcı RPC hatası → `failed` | `docs/01` §5.2 | `classifyRpcError` `'permanent'` dalı |
| Geçici ağ hatası → exponential backoff, N deneme sonrası `failed` | `docs/01` §5.2, I-006 | BullMQ `attempts: 5, backoff: exponential` — worker kendi retry döngüsünü yazmaz |
| `tx_hash` `broadcast` durumunda dolar | `docs/02` §2.7 | `transitionTo` `extraFields: { txHash }` |
| Worker idempotency | I-005 | Job id `transferId:broadcast` + state kontrolü |

**Kalite kapıları:**
- [ ] Unit: `broadcastTransaction` başarı + `classifyRpcError` kalıcı/geçici ayrımı
- [ ] Unit: kalıcı hata tek denemede `failed`; geçici hata BullMQ'ya devredilir (exception fırlatılır, doğrudan `failed`'e düşmez)
- [ ] Unit: terminal-state idempotency
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** Confirmation (blok derinliği izleme, İterasyon 5); frontend (İterasyon 6-7); reorg toleransı (İterasyon 5'in kapsamı, broadcast aşamasında henüz blok yok).

**Risk / dikkat:** `classifyRpcError`'ın hangi hata kodunu `'permanent'` sayacağı ağa göre farklıdır (EVM `INSUFFICIENT_FUNDS`/`NONCE_EXPIRED` vs Tron kendi hata string'leri) — bu sınıflandırmanın eksik/yanlış olması, aslında kalıcı bir hatanın gereksiz yere 5 kez denenmesine (kullanıcı deneyimini yavaşlatır ama veri bütünlüğünü bozmaz) veya geçici bir hatanın erken `failed`'e düşmesine (kullanıcının aslında başarılı olabilecek bir transferi kaybetmesi hissi) yol açabilir; bu iterasyonun test seti en azından birer örnek kalıcı/geçici hata kodunu kapsamalı, tüm RPC hata evrenini kapsamak bu ölçekte hedeflenmez.

**Stop:**
- [ ] `pnpm --filter api test -- broadcast`
- [ ] `pnpm --filter chain-providers test -- broadcast-transaction`
- [ ] PR/onay → İterasyon 5
