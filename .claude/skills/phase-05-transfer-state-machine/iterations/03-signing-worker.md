### İterasyon 3 — Signing Worker (§5.3)

**Hedef:** `TransfersService.confirm()` artık `pending_signature`'a geçişten sonra `signing` kuyruğuna bir job bırakıyor; `SigningProcessor` bu job'u işleyip private key'i yalnızca bellek-içi akışta decrypt ederek raw tx'i imzalıyor ve `pending_signature → signed` geçişini tetikliyor; imzalama başarısızsa `failed`'e düşüyor.

**Teslim çıktısı:**
- `apps/api/src/workers/signing/{signing-queue.module.ts, signing.processor.ts}` (+ `.spec.ts`)
- `transfers.service.ts` → `confirm()` sonuna `signing` kuyruğuna job ekleme
- `transfer-state-machine.service.ts` → `pending_signature: ['signed', 'failed']` whitelist genişlemesi
- `packages/chain-providers`: `IChainProvider.signTransaction()` arayüz metodu + `EvmProvider`/`TronProvider` implementasyonları

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam (`POST /transfers/:id/confirm` çalışıyor, `pending_signature` state'i üretiyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §5.3 — kapsam
2. `docs/01_DOMAIN_MODEL.md` §5.2 `pending_signature → signed` geçişi (backend/data/UI)
3. `docs/07_SECURITY_IMPLEMENTATION.md` §5 Decrypt akışının sınırları — yalnızca bellek-içi, hiçbir log'a yazılmaz; §9 Secrets Yönetimi
4. `docs/04_BACKEND_SPEC.md` §8 Background Job/Worker Kalıbı — kuyruk tanımı kalıbı (`BullModule.registerQueue()` alt-modül), idempotent job id, §6 worker exception handling farkı
5. `docs/09_DEV_WORKFLOW.md` §… (varsa) — yoksa atla, bu adımın zorunlu değildir

**Uygulama planı:**
1. `git-phase-branch` ile `feat/signing-worker` branch'i aç.
2. `packages/chain-providers`: `IChainProvider` arayüzüne `signTransaction(privateKey: string, tx: RawTransactionInput): Promise<string>` (imzalı raw tx hex/bytes döner, ağa göndermez) ekle. `EvmProvider.signTransaction`: `ethers.Wallet(privateKey, provider).signTransaction(tx)`. `TronProvider.signTransaction`: `tronWeb.trx.sign(tx, privateKey)`.
3. `apps/api/src/workers/signing/signing-queue.module.ts`: `BullModule.registerQueue({ name: 'signing' })` + `imports: [TransfersModule, WalletsModule]`, `providers: [SigningProcessor]` (`docs/04` §3, §8 kalıbı — kuyruk tanımı ile domain mantığı ayrı dosyada).
4. `signing.processor.ts` (`@Processor('signing')`): job payload `{ transferId }`; job id `transferId:signed` (bileşik anahtar, `docs/mimari-kararlar` I-005) — aynı anahtarla ikinci job BullMQ tarafından deduplication ile otomatik yok sayılır. İşleyici: transfer'i çek, `state !== 'pending_signature'` ise (ör. bir restart sonrası tekrar işlenmişse) sessizce çık (terminal-state idempotency, `docs/04` §8). Aksi halde `WalletsService`'ten cüzdanın `encryptedPrivateKey`/`encryptedDek`'ini çek, `EnvelopeEncryptionService.decryptPrivateKey()` ile **yalnızca bu fonksiyon kapsamındaki bir yerel değişkende** decrypt et, raw tx'i (`to, amount, assetId`'den türetilen ağa özel işlem yapısı) `IChainProvider.signTransaction()` ile imzala, `TransferStateMachine.transitionTo(prisma, transferId, 'signed', 'worker:signing')` çağır. Decrypt edilmiş private key değişkeni hiçbir `this.logger.*` çağrısına argüman olarak geçirilmez (`docs/07` §5, `docs/04` §9 — code review'da denetlenen agent kısıtı); fonksiyon dönünce referans bırakılır.
5. Hata durumu: imzalama sırasında bir exception fırlarsa (`try/catch` processor içinde), `TransferStateMachine.transitionTo(prisma, transferId, 'failed', 'worker:signing', { reason: sadeleştirilmiş mesaj })` çağrılır — BullMQ'nun kendi job-retry mekanizması burada **kullanılmaz** (`docs/01` §5.2 `pending_signature → signed` notu: "Başarısızsa doğrudan `failed`'e geçer" — imzalama hatası genelde kalıcıdır, geçici ağ hatası değildir, bu nedenle broadcast/RPC katmanındaki retry semantiğinden farklıdır).
6. `transfer-state-machine.service.ts`: whitelist'e `pending_signature: ['signed', 'failed']` ekle.
7. `transfers.service.ts` → `confirm()`'in sonuna (İterasyon 2'de `transitionTo` başarılı döndükten hemen sonra) `signingQueue.add('sign', { transferId }, { jobId: \`${transferId}:signed\` })` ekle.
8. Unit test (`chain-providers`): `signTransaction` deterministik imza üretir (sabit private key + sabit tx girdisiyle), EVM ve Tron farklı imza formatı döner. Unit test (`signing.processor.spec.ts`): mock `EnvelopeEncryptionService`/`IChainProvider` ile başarılı imzalama + `signed` geçişi; imzalama hatasında `failed` geçişi; zaten `signed`/terminal durumdaki bir transfer üzerinde job çalıştığında hiçbir state değişikliği yapmadan çıktığı (idempotency).
9. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `workers/signing/{signing-queue.module.ts, signing.processor.ts}` (+`.spec.ts`) |
| Güncelle | `transfers/{transfers.service.ts, transfer-state-machine.service.ts}`, `chain-providers/src/{i-chain-provider.ts, evm-provider.ts, tron-provider.ts}` (+`.spec.ts`), `app.module.ts` (`SigningQueueModule` import) |
| Dokunma | `envelope-encryption.service.ts` (Faz 4'te tamamlandı, yalnızca tüketilir) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Decrypt yalnızca bellek-içi, log'a yazılmaz | `docs/07` §5 | Yerel değişken, `logger.*` çağrısına argüman geçirilmez |
| Worker idempotency | `docs/04` §8, I-005 | Job id `transferId:signed` + state kontrolüyle erken çıkış |
| İmzalama hatası → doğrudan `failed` | `docs/01` §5.2 | BullMQ retry değil, `try/catch` ile `transitionTo('failed', ...)` |
| Kuyruk tanımı domain mantığından ayrı dosyada | `docs/04` §3 | `signing-queue.module.ts` yalnızca `registerQueue`, iş mantığı `signing.processor.ts` |

**Kalite kapıları:**
- [ ] Unit: `IChainProvider.signTransaction` EVM/Tron determinizm (`chain-providers` coverage'a katkı)
- [ ] Unit: `SigningProcessor` başarı + imzalama hatası (`failed`) + terminal-state idempotency (3 senaryo)
- [ ] `pnpm --filter chain-providers test -- sign-transaction`
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** Broadcast (İterasyon 4); confirmation (İterasyon 5); frontend (İterasyon 6-7); bakiyenin worker tarafından yeniden kontrolü (roadmap §5.2'nin "worker yeniden kontrolü" notu — bu iterasyonun imzalama işiyle karışmasın diye burada uygulanmaz; mevcut demo ölçeğinde İterasyon 2'nin senkron DB-önbellekli kontrolü yeterli kabul edilir, ayrı bir re-check adımı eklenmez).

**Risk / dikkat:** `signing.processor.ts` içinde decrypt edilmiş private key'i tutan değişken, fonksiyon kapsamı dışına (ör. bir class field'ına) **asla** atanmaz — yalnızca yerel `const` olarak tutulur ve imzalama tamamlanır tamamlanmaz kapsam dışına çıkar (`docs/10` Risk Kaydı: "Private key'in yanlışlıkla loglanması" riski). BullMQ job'ları restart sonrası tekrar kuyruktan alınabilir (`docs/04` §8) — madde 4'teki state kontrolü (`state !== 'pending_signature'` ise çık) bu senaryoyu tam olarak kapsar, ayrıca bir "processing lock" mekanizması eklenmez (demo ölçeğinde over-engineering).

**Stop:**
- [ ] `pnpm --filter api test -- signing`
- [ ] `pnpm --filter chain-providers test -- sign-transaction`
- [ ] PR/onay → İterasyon 4
