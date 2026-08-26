### İterasyon 3 — Frontend: S-WALLET-ADD-MANAGED (§4.3)

**Hedef:** S-WALLET-ADD-MANAGED gerçek tarayıcıda çalışır durumda; kullanıcı `/wallets/add?type=managed` üzerinden bir ağ seçip yönetilen cüzdan oluşturabiliyor, S-WALLET-DETAIL'e yönlendiriliyor ve orada artık "Transfer Gönder" butonu görünüyor.

**Teslim çıktısı:**
- `apps/web/src/app/(authenticated)/wallets/add/page.tsx` güncellemesi (`?type=managed` dalı)
- `hooks/useCreateManagedWallet.ts`

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam (`POST /wallets/managed` çalışıyor)
- [ ] Faz 3 İterasyon 7'nin `wallets/add/page.tsx`'i (watch-only dalı) ve `useNetworks.ts` mevcut

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §4.3 — kapsam
2. `docs/06_SCREEN_CATALOG.md` S-WALLET-ADD-MANAGED — alan listesi, aksiyonlar, UX state'leri, TR mesaj metinleri
3. `docs/03_API_CONTRACTS.md` §5.2 `POST /wallets/managed`

**Uygulama planı:**
1. `git-phase-branch` ile `feat/frontend-add-managed-wallet` branch'i aç.
2. `hooks/useCreateManagedWallet.ts`: `POST /wallets/managed` mutation (`{ networkId }`), başarıda yeni cüzdanın `id`'sini döner.
3. `wallets/add/page.tsx`: mevcut `?type=watch-only` dalının yanına `?type=managed` dalı eklenir — tek alan (Ağ, `useNetworks` ile yalnızca aktif ağlar), "Cüzdan Oluştur" butonu `useCreateManagedWallet`'ı tetikler; buton metni işlem sürerken "Oluşturuluyor..." (backend'de private key türetme/şifreleme sürdüğü için bu bekleme kullanıcıya açıkça gösterilir, `docs/06` S-WALLET-ADD-MANAGED UX state notu). Başarıda `/wallets/[id]`'e yönlendirme + "Yönetilen cüzdanınız oluşturuldu." toast'ı; "Vazgeç" → `/wallets`.
4. Hata eşlemesi: `NETWORK_ASSET_INACTIVE` → "Bu ağ şu anda kullanıma kapalı."
5. Cüzdan tipi seçim modalı (Faz 3 İterasyon 7'de watch-only'e giden) her iki seçeneği de (`S-WALLET-ADD-WATCHONLY` / `S-WALLET-ADD-MANAGED`) artık gösterir — bu modal Faz 3'te zaten oluşturulmuştu, bu iterasyonda yalnızca managed seçeneğinin hedef route'u (`?type=managed`) doğrulanır.
6. Manuel doğrulama: `/wallets/add?type=managed` → ağ seç → "Cüzdan Oluştur" → `/wallets/[id]`'e yönlen → S-WALLET-DETAIL'de artık "Transfer Gönder" butonu görünür (Faz 3 İterasyon 7'nin `type === 'managed'` koşulu artık ilk kez test edilebilir hale gelir).
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `hooks/useCreateManagedWallet.ts` |
| Güncelle | `app/(authenticated)/wallets/add/page.tsx` |
| Dokunma | `wallets/[id]/page.tsx` (Faz 3'te yazıldı, değişmez — yalnızca koşulu artık gözlemlenebilir) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Tek alan: Ağ (yalnızca aktif ağlar) | `docs/06` S-WALLET-ADD-MANAGED | `useNetworks` yeniden kullanımı |
| "Oluşturuluyor..." bekleme state'i | `docs/06` S-WALLET-ADD-MANAGED UX state'leri | Mutation `isPending` → buton metni |
| `NETWORK_ASSET_INACTIVE` hata mesajı | `docs/06` S-WALLET-ADD-MANAGED | Tek hata kodu → TR mesaj |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok (Faz 3 ile aynı gerekçe); doğrulama Faz 7 §7.3 e2e journey'sinde ("login → yönetilen cüzdan oluştur → ...") ve manuel adımda

**Bu iterasyonda yok:** S-ADMIN-MINT (İterasyon 6); transfer akışının kendisi (Faz 5) — bu iterasyon yalnızca "Transfer Gönder" butonunun artık görünür olmasını sağlar, buton henüz bir route'a bağlanmaz (Faz 5 §5.6'ya kadar `disabled` veya placeholder route).

**Risk / dikkat:** "Oluşturuluyor..." state'i sırasında backend'de HD türetme + envelope encryption gerçekten senkron çalışır (worker'a devredilmez, İterasyon 2 notu) — bu, kullanıcı için birkaç yüz milisaniyelik gözle görülür bir bekleme yaratabilir; bu kabul edilen bir davranıştır, ayrı bir loading/polling mekanizması eklenmez.

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (managed cüzdan oluşturma → detay ekranında "Transfer Gönder" görünürlüğü)
- [ ] PR/onay → İterasyon 4
