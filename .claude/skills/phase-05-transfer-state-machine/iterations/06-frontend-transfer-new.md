### İterasyon 6 — Frontend: S-TRANSFER-NEW (§5.6a)

**Hedef:** S-TRANSFER-NEW gerçek tarayıcıda çalışıyor — kullanıcı S-WALLET-DETAIL'deki (artık ilk kez bir route'a bağlanan) "Transfer Gönder" butonuyla veya doğrudan `/transfers/new` ile gelip gönderen managed cüzdan, varlık, hedef adres, tutar girip draft oluşturabiliyor; başarıda `/transfers/[id]`'e (İterasyon 7'nin onay adımına) yönlendiriliyor.

**Teslim çıktısı:**
- `apps/web/src/app/(authenticated)/transfers/new/page.tsx`
- `hooks/useCreateTransfer.ts`
- `packages/types/src/schemas/transfer.schema.ts` şemasının frontend formunda birebir kullanımı

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (`POST /transfers` çalışıyor)
- [ ] Faz 3 İterasyon 7'nin S-WALLET-DETAIL'i ve "Transfer Gönder" butonu (şimdiye dek placeholder route) mevcut

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §5.6 — kapsam ve a/b bölünme notu
2. `docs/06_SCREEN_CATALOG.md` S-TRANSFER-NEW — alan listesi, aksiyonlar, UX state'leri, TR mesaj metinleri
3. `docs/03_API_CONTRACTS.md` §5.4 `POST /transfers` — request/response/hata kodları, `Idempotency-Key` header
4. `docs/05_FRONTEND_SPEC.md` §Hooks — `use<Domain>` ailesi kalıbı, `hooks/` altında yaşama kuralı

**Uygulama planı:**
1. `git-phase-branch` ile `feat/frontend-transfer-new` branch'i aç.
2. `hooks/useCreateTransfer.ts`: `POST /transfers` mutation — `crypto.randomUUID()` ile üretilen bir `Idempotency-Key` header'ı her mutation çağrısında **yeniden** üretilir (form her yeni "Devam Et" tıklamasında farklı bir taslak denemesi sayılır; bir önceki başarısız denemenin key'i tekrar kullanılmaz — bu, backend'in retry-aynı-taslak senaryosundan farklıdır, kullanıcı formu değiştirip tekrar gönderiyorsa yeni bir key doğaldır).
3. `transfers/new/page.tsx`: `?walletId=` query'siyle önceden seçili gelebilen bir form — Gönderen Cüzdan (select, yalnızca `useWallets({ type: 'managed' })`'den dönen cüzdanlar), Varlık (select, seçili cüzdanın ağındaki aktif varlıklar — `useNetworkAssets(networkId)` Faz 2'den yeniden kullanılır), Hedef Adres (text), Tutar (text, sayısal). "Devam Et" → `useCreateTransfer` tetikler, başarıda `/transfers/${transfer.id}`'e yönlendirir. "Vazgeç" → `router.back()` veya `/wallets`.
4. Boş state: `useWallets({ type: 'managed' })` boş dönerse form yerine "Transfer göndermek için önce yönetilen bir cüzdan oluşturmalısınız." mesajı + S-WALLET-ADD-MANAGED linki (`docs/06` S-TRANSFER-NEW boş state notu).
5. Hata eşlemesi: `WALLET_CROSS_NETWORK_MISMATCH` → "Hedef adres, seçili cüzdanın ağıyla uyuşmuyor."; `NETWORK_ASSET_INACTIVE` → "Bu varlık şu anda transfer için kullanılamıyor."; `VALIDATION_FAILED` → ilgili alan altında mesaj (`docs/06` TR mesaj metinleri birebir).
6. S-WALLET-DETAIL'deki "Transfer Gönder" butonunu (Faz 3 İterasyon 7'de placeholder/disabled bırakılmıştı) `/transfers/new?walletId=${wallet.id}`'e bağla — bu, Faz 3'ün o zamanki notunun ("Faz 5 §5.6'ya kadar disabled") ilk kez gerçek bir route'a kavuştuğu noktadır.
7. Manuel doğrulama: S-WALLET-DETAIL → "Transfer Gönder" → form önceden seçili cüzdanla açılır → alanları doldur → "Devam Et" → `/transfers/[id]`'e yönlenir (İterasyon 7 henüz yazılmadıysa bu adım geçici bir 404/boş sayfa gösterebilir, yalnızca yönlendirmenin doğru id'ye gittiği kontrol edilir).
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(authenticated)/transfers/new/page.tsx`, `hooks/useCreateTransfer.ts` |
| Güncelle | `app/(authenticated)/wallets/[id]/page.tsx` ("Transfer Gönder" butonunun `href`'i) |
| Dokunma | `transfers/[id]/page.tsx` (İterasyon 7'de yazılır) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Alan listesi (4 alan) | `docs/06` S-TRANSFER-NEW | Gönderen Cüzdan/Varlık/Hedef Adres/Tutar |
| Boş state (managed cüzdan yok) | `docs/06` S-TRANSFER-NEW UX state'leri | Form yerine uyarı + link |
| Her mutation'da yeni `Idempotency-Key` | `docs/03` §7 | `crypto.randomUUID()` her submit'te |
| Hata kodu → TR mesaj eşlemesi | `docs/06` S-TRANSFER-NEW | 3 hata kodu (cross-network, inactive, validation) |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok (Faz 3/4 ile aynı gerekçe — `docs/08` §1); doğrulama Faz 7 §7.3 e2e journey'sinde ve manuel adımda

**Bu iterasyonda yok:** S-TRANSFER-CONFIRM (step-up formu), S-TRANSFER-DETAIL (izleme) — İterasyon 7; `TransferStateBadge`/`ExplorerLink` bileşenleri (İterasyon 7'de S-TRANSFER-DETAIL ile birlikte tanıtılır, bu ekran yalnızca form gösterir, badge göstermez).

**Risk / dikkat:** Tutar alanı client-side yalnızca bir ön kontroldür (pozitif, ondalık ayracı nokta, bakiyeyi aşamaz) — asıl kontrol backend'dedir (`docs/06` S-TRANSFER-NEW Tutar validation notu); bu ekran bakiye yetersizliğini burada reddetmez, o kontrol İterasyon 2'nin `confirm()` adımına aittir (kullanıcı draft oluşturabilir, onay adımında reddedilebilir — bu kasıtlı bir tasarımdır, roadmap §5.1/§5.2 ayrımının doğal sonucu).

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (S-WALLET-DETAIL → Transfer Gönder → form → Devam Et → yönlendirme)
- [ ] PR/onay → İterasyon 7
