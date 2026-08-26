### İterasyon 8 — Terminal Durum ve Idempotency Testleri (§5.7)

**Hedef:** §5.1-5.5'te kurulan tüm geçişlerin, `docs/08_TESTING_STRATEGY.md` §4'teki 12 zorunlu negatif senaryodan transfer'e özel olan 5'inin (cross-network mismatch, terminal state'ten geçiş denemesi, step-up başarısız, yetersiz bakiye, watch-only'den transfer denemesi) regresyon testi olarak toplu ve tekrar doğrulanabilir biçimde eklenmesi; `TransferStateMachine` ve `packages/chain-providers` kümülatif coverage'ının ≥%80 olduğu son bir raporla teyit edilmesi.

**Teslim çıktısı:**
- `apps/api/src/transfers/transfer-state-machine.service.spec.ts` güncellemesi — terminal state matrisi (3 terminal durumdan her denemenin reddi)
- `apps/api/test/transfers.e2e-spec.ts` (integration) — 5 negatif senaryonun uçtan uca (HTTP isteği üzerinden) tekrar doğrulanması
- Coverage raporu özeti (PR açıklamasında)

**Önkoşullar:**
- [ ] İterasyon 1-7 Stop tamam (tüm state geçişleri + frontend akışı çalışıyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §5.7 — kapsam, hangi 5 senaryonun listelendiği
2. `docs/08_TESTING_STRATEGY.md` §4 — 12 senaryonun tam listesi (madde 1, 3, 4, 7, 8 bu iterasyonun kapsamı), §2 coverage hedefleri, §5 factory/fixture stratejisi (`createTestTransfer({ state: 'confirming' })` gibi)
3. `docs/01_DOMAIN_MODEL.md` §4 iş kuralları (3 cross-network, 5 watch-only, 7 state bütünlüğü, 8 terminal durum)
4. `.claude/rules/01-coding-philosophy.md` Test-first ve doğrulama bölümü — "kritik modül testi eklemeden PR açmak" yasağı

**Uygulama planı:**
1. `git-phase-branch` ile `test/transfer-terminal-state-idempotency` branch'i aç.
2. Test factory'lerini gözden geçir/tamamla: `createTestTransfer({ state })` (İterasyon 1-5'in spec dosyalarında ad-hoc oluşturulan transfer fixture'ları burada tek bir paylaşılan factory'ye toplanır, `docs/08` §5 kalıbı) — her terminal state (`confirmed`, `failed`, `dropped`) için ayrı ayrı üretilebilir olmalı.
3. `transfer-state-machine.service.spec.ts`'e **terminal state matrisi** ekle: üç terminal durumun (`confirmed`, `failed`, `dropped`) her birinden whitelist'teki *her* hedef duruma (`pending_signature`, `signed`, `broadcast`, `confirming`, ve birbirlerine) geçiş denemesi parametrize edilmiş bir test ile döngüyle denenir, hepsi `TRANSFER_INVALID_TRANSITION` fırlatmalı — bu, İterasyon 1-5'te her whitelist genişlemesinde tek tek doğrulanan terminal-reddi senaryosunun artık **tam matris** olarak tek yerde toplanmış hâlidir (senaryo 3).
4. `transfers.e2e-spec.ts` (integration, test DB'ye karşı): 
   - Senaryo 1 (cross-network): farklı ağ formatında bir `toAddress` ile `confirm()` çağrısı → `409 WALLET_CROSS_NETWORK_MISMATCH`.
   - Senaryo 3 (terminal state): `createTestTransfer({ state: 'confirmed' })` üzerinde `POST /transfers/:id/confirm` → `409 TRANSFER_INVALID_TRANSITION`.
   - Senaryo 4 (step-up başarısız): yanlış `currentPassword` ile `confirm()` → `401 AUTH_STEP_UP_REQUIRED`, transfer hâlâ `draft`.
   - Senaryo 7 (watch-only'den transfer): `POST /transfers` body'sinde watch-only bir `walletId` → `409 WALLET_NOT_MANAGED`.
   - Senaryo 8 (yetersiz bakiye): `BalanceCache`'i tutarın altında bir değerle fixture'layıp `confirm()` → `409 WALLET_INSUFFICIENT_BALANCE`.
5. Idempotency regresyonu: aynı `Idempotency-Key` ile `POST /transfers`'ı iki kez çağırıp ikinci yanıtın `200` + aynı `id` döndürdüğünü, `transfers` tablosunda tek satır olduğunu doğrula (İterasyon 1'in testinin burada da tekrar edildiği, tek bir yerde toplanan regresyon paketinin parçası olduğu — kopya yazılmaz, mevcut test dosyası bu pakete taşınır/referans verilir).
6. Worker idempotency regresyonu: `signing`/`broadcast`/`confirmation` processor'larının her biri için, zaten terminal durumdaki bir transfer üzerinde job'un ikinci kez çalıştırılmasının hiçbir state değişikliği yapmadığı (İterasyon 3-5'te yazılan testlerin var olduğu doğrulanır, eksikse tamamlanır).
7. Coverage raporunu çalıştır (`pnpm --filter api test -- --coverage transfer-state-machine`, `pnpm --filter chain-providers test -- --coverage`); ikisi de ≥%80 değilse eksik dalları (özellikle nadiren tetiklenen hata yolları) kapatacak ek testler ekle.
8. PR aç — açıklamada coverage yüzdesini ve 5 senaryonun her birinin hangi test dosyasında olduğunu tabloyla özetle.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `apps/api/test/transfers.e2e-spec.ts`, ortak `createTestTransfer` factory (`apps/api/test/factories/transfer.factory.ts`) |
| Güncelle | `transfers/transfer-state-machine.service.spec.ts` (terminal state matrisi) |
| Dokunma | İterasyon 1-5'in kendi `.spec.ts` dosyaları (yalnızca factory'ye taşınan tekrarlar kaldırılır, mantık değişmez) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Cross-network mismatch reddi | `docs/08` §4 madde 1 | Integration: `409 WALLET_CROSS_NETWORK_MISMATCH` |
| Terminal state'ten geçiş reddi (tam matris) | `docs/08` §4 madde 3 | Unit: 3 terminal durum × tüm hedefler |
| Step-up başarısız reddi | `docs/08` §4 madde 4 | Integration: `401 AUTH_STEP_UP_REQUIRED` |
| Watch-only'den transfer reddi | `docs/08` §4 madde 7 | Integration: `409 WALLET_NOT_MANAGED` |
| Yetersiz bakiye reddi | `docs/08` §4 madde 8 | Integration: `409 WALLET_INSUFFICIENT_BALANCE` |

**Kalite kapıları:**
- [ ] Unit: terminal state matrisi (3×N kombinasyon) tamamı `TRANSFER_INVALID_TRANSITION`
- [ ] Integration: 5 senaryonun tamamı doğru HTTP status + error code ile geçiyor
- [ ] `packages/chain-providers` coverage raporu ≥%80
- [ ] `TransferStateMachine` coverage raporu ≥%80
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** Kalan 7 negatif senaryo (yetkisiz erişim, admin-only reddi, refresh replay, rate limit, mainnet allowlist, geçersiz adres formatı, pasif network-asset — bunlar önceki fazlarda zaten kapsandı veya Faz 7 §7.2'nin kapsamındadır, roadmap §5.7 yalnızca bu 5'ini transfer'e özel olarak listeler); coverage gate'inin CI'a otomatik reddeden bir adım olarak eklenmesi (Faz 7 §7.1 — bu iterasyon yalnızca hedefi karşıladığını PR'da manuel raporlar).

**Risk / dikkat:** Terminal state matrisinin "tüm hedefler" kapsamı whitelist'in kendisinden türetilmelidir (ör. `Object.values(TransferState)` üzerinde döngü) — sabit/elle yazılmış bir liste, gelecekte whitelist'e yeni bir durum eklendiğinde (bu fazda beklenmez ama ilke olarak) sessizce eksik kalabilir; döngü whitelist sabitinin kendisine referans vererek yazılmalı. Idempotency ve worker idempotency testlerinin bu iterasyonda "tekrar edilmesi", İterasyon 1/3/4/5'te yazılanların **kopyalanması değil** — mevcut testlerin var olduğunun doğrulanması ve eksikse tamamlanmasıdır (`.claude/rules/01-coding-philosophy.md` "testler geçti" gerekçesiyle atlama yasağı, tersi yönde de geçerlidir: zaten var olan testi kopyalamak).

**Stop:**
- [ ] `pnpm --filter api test -- transfers`
- [ ] `pnpm --filter api test -- --coverage transfer-state-machine`
- [ ] `pnpm --filter chain-providers test -- --coverage`
- [ ] PR/onay → Faz 5 Done Definition; `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 5 işaretlenir; roadmap işareti → Faz 6.
