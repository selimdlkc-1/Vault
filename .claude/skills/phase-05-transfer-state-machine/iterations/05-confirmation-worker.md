### İterasyon 5 — Confirmation Worker (§5.5)

**Hedef:** `broadcast` durumundaki bir transfer, sürekli çalışan confirmation worker tarafından izleniyor — ilk bloğa girince `confirming`'e, ağa özel N-blok eşiği (Sepolia 12, BSC Testnet 15, Tron Shasta 19) geçilince `confirmed`'e, süre aşımında `dropped`'a, revert/`FAILED` sonucunda `failed`'e geçiyor; eşik altı derinlikte bir reorg tespit edilirse sayaç sıfırlanmadan `confirming`'de kalınıyor.

**Teslim çıktısı:**
- `apps/api/src/workers/confirmation/{confirmation-queue.module.ts, confirmation.processor.ts}` (+ `.spec.ts`)
- `packages/chain-providers`: `IChainProvider.getTransactionReceipt()` + ağa özel `CONFIRMATION_THRESHOLD` sabiti
- `broadcast.processor.ts` → başarılı broadcast'in sonuna `confirmation` kuyruğuna job ekleme
- `transfer-state-machine.service.ts` → `broadcast: ['confirming', 'failed']`, `confirming: ['confirmed', 'dropped', 'failed']` whitelist genişlemesi

**Önkoşullar:**
- [ ] İterasyon 4 Stop tamam (`broadcast` durumu + `tx_hash` üretiliyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §5.5 — kapsam, ağa özel N-blok eşiği
2. `docs/01_DOMAIN_MODEL.md` §5.2 `broadcast → confirming`, `confirming → confirmed/dropped/failed` geçişleri; §6 "Transfer ilerleme yüzdesi" türetilmiş alan
3. `docs/mimari-kararlar.md` I-004 (eşik değerleri: Sepolia 12, BSC Testnet 15, Tron Shasta 19), I-007 (reorg toleransı)
4. `docs/04_BACKEND_SPEC.md` §8 Reorg toleransı paragrafı — "state geçişi değil, aynı durumda kalınarak iç sayaç güncellenir"

**Uygulama planı:**
1. `git-phase-branch` ile `feat/confirmation-worker` branch'i aç.
2. `packages/chain-providers`: `CONFIRMATION_THRESHOLDS: Record<NetworkSlug, number> = { sepolia: 12, 'bsc-testnet': 15, 'tron-shasta': 19 }` sabiti (`docs/mimari-kararlar` I-004 birebir). `IChainProvider.getTransactionReceipt(txHash: string): Promise<{ status: 'pending' | 'success' | 'reverted'; blockNumber: number | null; blockHash: string | null; currentBlockHeight: number }>` — `EvmProvider`: `provider.getTransactionReceipt(txHash)` + `provider.getBlockNumber()`; `TronProvider`: `tronWeb.trx.getTransactionInfo(txHash)`.
3. `confirmation-queue.module.ts`: `BullModule.registerQueue({ name: 'confirmation' })`, `imports: [TransfersModule]`.
4. `confirmation.processor.ts` (`@Processor('confirmation')`, tekrarlayan/repeatable job olarak kısa aralıklı polling — `docs/04` §8 "sürekli veya kısa aralıklı polling"): job payload `{ transferId, txHash }`, job id `transferId:confirmation-poll` (her poll turunda aynı id, `removeOnComplete` ile önceki tamamlanmış çalıştırma temizlenir). İşleyici mantığı:
   - Transfer `state` terminal ise (`confirmed`/`failed`/`dropped`) sessizce çık.
   - `getTransactionReceipt(txHash)` çağır; `status: 'pending'` ve `blockNumber: null` ise (henüz bloğa girmedi) — bir "ilk görülme zamanı" (transfer'in `updated_at`'i veya ayrı bir iç sayaç alanı) ile şu anki zaman arasındaki fark, ağa özel bir zaman aşımı eşiğini aşarsa `transitionTo(..., 'dropped', 'worker:confirmation')`; aşmadıysa hiçbir şey yapmadan çık (bir sonraki poll turu tekrar dener).
   - `blockNumber` doluysa ve transfer hâlâ `broadcast` durumundaysa `transitionTo(..., 'confirming', 'worker:confirmation')` (ilk bloğa giriş).
   - `confirming` durumundaysa: `depth = currentBlockHeight - blockNumber`. `status: 'reverted'` ise `transitionTo(..., 'failed', 'worker:confirmation', { reason: 'İşlem zincir tarafından reddedildi.' })`. `depth >= CONFIRMATION_THRESHOLDS[network]` ise `transitionTo(..., 'confirmed', 'worker:confirmation')`. Reorg tespiti: önceki poll turunda kaydedilen `blockHash` şimdiki `blockHash`'ten farklıysa (block hash mismatch), bu bir state geçişi **değildir** — yalnızca iç `metadata.lastKnownBlockHash` güncellenir, sayaç (`depth` hesaplaması zaten `blockNumber`'a göre yeniden yapıldığından) otomatik olarak doğru derinlikten devam eder, `confirming`'den çıkılmaz (`docs/04` §8 reorg paragrafı).
5. `transfer-state-machine.service.ts`: whitelist'e `broadcast: ['confirming', 'failed']`, `confirming: ['confirmed', 'dropped', 'failed']` ekle.
6. `broadcast.processor.ts`'in başarılı broadcast dalının sonuna `confirmationQueue.add('poll', { transferId, txHash }, { jobId: \`${transferId}:confirmation-poll\`, repeat: { every: 15_000 } })` ekle (15 saniyelik polling aralığı — `docs/mimari-kararlar` I-004'ün ötesinde bir uygulama detayı, doküman kapsamında sabit bir değer olarak seçilir).
7. Unit test (`chain-providers`): `getTransactionReceipt` mock RPC yanıtlarıyla `pending`/`success`/`reverted` durumlarını doğru parse eder. Unit test (`confirmation.processor.spec.ts`): ilk bloğa giriş → `confirming`; eşik aşımı → `confirmed`; revert → `failed`; zaman aşımı → `dropped`; reorg senaryosu (block hash değişimi) → durum `confirming`'de kalır, terminal'e düşmez; terminal-state idempotency.
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `workers/confirmation/{confirmation-queue.module.ts, confirmation.processor.ts}` (+`.spec.ts`) |
| Güncelle | `transfers/transfer-state-machine.service.ts`, `workers/broadcast/broadcast.processor.ts`, `chain-providers/src/{i-chain-provider.ts, evm-provider.ts, tron-provider.ts, constants.ts}` (+`.spec.ts`), `app.module.ts` |
| Dokunma | Frontend (İterasyon 6-7'de bu worker'ın ürettiği durumları okur, bu iterasyon frontend'e dokunmaz) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Ağa özel N-blok eşiği | I-004, `docs/10` §5.5 | `CONFIRMATION_THRESHOLDS` sabiti (12/15/19) |
| Reorg toleransı — sayaç sıfırlanmadan yeniden doğrulama | I-007, `docs/04` §8 | Block hash mismatch → state geçişi yok, yalnızca iç `metadata` güncellenir |
| `confirming → dropped` zaman aşımı | `docs/01` §5.2 | Bloğa girmeden geçen süre eşiği |
| `confirming → failed` revert/`FAILED` | `docs/01` §5.2 | `status: 'reverted'` dalı |

**Kalite kapıları:**
- [ ] Unit: `getTransactionReceipt` durum parse'ı (3 durum)
- [ ] Unit: `confirming`→`confirmed`/`dropped`/`failed` üç ayrı geçiş + reorg senaryosunda geçiş **olmadığı**
- [ ] Unit: terminal-state idempotency
- [ ] `TransferStateMachine` + `packages/chain-providers` kümülatif coverage kontrolü — bu iterasyon sonunda ≥%80 hedefine ulaşılmış olmalı (`docs/08` §2)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** Frontend (İterasyon 6-7); bildirim tetikleme (`tx confirmed`/`tx failed` — Faz 6 §6.1, bu worker yalnızca state geçirir); hareket geçmişinde tekilleştirme mantığının kendisi (`docs/01` §6 — bu, `GET /movements` okuma tarafının sorumluluğudur, zaten Faz 3'te kurulan `chain_movements` ile `txHash` eşleşmesine dayanır; bu worker yalnızca `confirmed` durumuna ulaştırır, birleştirme sorgusuna dokunmaz).

**Risk / dikkat:** Bu worker'ın polling aralığı (15sn) ile RPC sağlayıcı rate limit'i arasında bir gerilim vardır — çok sayıda eşzamanlı `confirming` transfer varsa istek sayısı artar; `docs/mimari-kararlar` I-009'un merkezi rate-limiter'ı (BullMQ concurrency/`bottleneck`) bu worker'a da uygulanır, ama bu iterasyon yalnızca doğru state mantığını kurar, kapasite ayarlamasını (concurrency limiti tuning) demo ölçeğinde over-engineering sayıp varsayılan BullMQ ayarlarıyla bırakır. Reorg testinin mock kurgusu: iki ardışık `getTransactionReceipt` çağrısının farklı `blockHash` ama aynı/artan `blockNumber` döndürdüğü bir senaryo kurulmalı — gerçek bir reorg RPC sağlayıcısında test edilemez (`docs/08` §5 "chain provider testleri gerçek testnet'e karşı çalışmaz").

**Stop:**
- [ ] `pnpm --filter api test -- confirmation`
- [ ] `pnpm --filter chain-providers test -- transaction-receipt`
- [ ] `pnpm --filter chain-providers test -- --coverage` → ≥%80
- [ ] `pnpm --filter api test -- transfer-state-machine --coverage` → ≥%80
- [ ] PR/onay → İterasyon 6
