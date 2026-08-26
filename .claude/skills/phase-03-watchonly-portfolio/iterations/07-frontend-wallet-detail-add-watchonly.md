### İterasyon 7 — Frontend: Cüzdan Detay + Watch-only Ekleme (§3.5b)

**Hedef:** S-WALLET-DETAIL ve S-WALLET-ADD-WATCHONLY gerçek tarayıcıda çalışır durumda; kullanıcı `/wallets/add?type=watch-only` üzerinden gerçek bir Sepolia testnet adresini ekleyip S-WALLET-DETAIL'e yönlendirilebiliyor — bu, Faz 3 İnsan onay noktasının cüzdan-ekleme tarafıdır.

**Teslim çıktısı:**
- `apps/web/src/app/(authenticated)/wallets/[id]/page.tsx`, `wallets/add/page.tsx`
- `components/AddressDisplay.tsx`
- `hooks/useWallet.ts`, `hooks/useCreateWatchOnlyWallet.ts`, `hooks/useNetworks.ts` (yoksa — Faz 2 İterasyon 4'ten devralınabilir)

**Önkoşullar:**
- [ ] İterasyon 6 Stop tamam (dashboard/liste ekranları, `UsdtValue`, layout nav bar hazır)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.5 — kapsam (b) kısmı
2. `docs/06_SCREEN_CATALOG.md` §4.2 S-WALLET-DETAIL, S-WALLET-ADD-WATCHONLY; §6 Ortak Bileşenler `AddressDisplay`
3. `docs/03_API_CONTRACTS.md` §5.2 `GET /wallets/:id`, `POST /wallets/watch-only`, §5.3 `GET /networks`
4. `add-new-screen` skill (prosedür referansı)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/wallet-detail-add-watchonly-screens` branch'i aç.
2. `components/AddressDisplay.tsx`: adresi kısaltılmış gösterir (`0x1234...abcd`), tam adres tooltip'te, "kopyala" ikonu (`navigator.clipboard`).
3. `hooks/useWallet.ts` (`GET /wallets/:id`), `hooks/useCreateWatchOnlyWallet.ts` (`POST /wallets/watch-only` mutation), `hooks/useNetworks.ts` (Faz 2 İterasyon 4'te oluşturulduysa yeniden kullanılır, yoksa burada oluşturulur).
4. `app/(authenticated)/wallets/[id]/page.tsx`: adres (`AddressDisplay`), ağ, tip badge'i, varlık bazlı bakiye tablosu (sembol, miktar, `UsdtValue`), son 5 hareket (İterasyon 8 tamamlanana kadar bu liste boştur — backend zaten boş dizi döner, İterasyon 4'ün notu); "Transfer Gönder" butonu yalnızca `type = managed` cüzdanlarda görünür (Faz 3'te hiçbir managed cüzdan olmadığından bu buton pratikte hiç görünmez, ama koşul spec'e göre baştan doğru yazılır — Faz 4 sonrası devreye girer); "Tüm Hareketleri Gör" linki (İterasyon 9'a kadar boş bir route'a işaret eder). Yetkisiz durum: kendi cüzdanı değilse `docs/06`'ya göre S-FORBIDDEN-403'e yönlendirilir — bu ekran Faz 7 §7.4'e kadar henüz yoktur, bu iterasyon geçici olarak `/dashboard`'a yönlendirir (Faz 1/2'nin placeholder disiplini).
5. `app/(authenticated)/wallets/add/page.tsx` (`?type=watch-only`): Ağ (yalnızca aktif ağlar, `useNetworks`) + Adres alanı; "Cüzdanı Ekle" → `useCreateWatchOnlyWallet` mutation → başarıda `/wallets/[id]`'e yönlendirme; "Vazgeç" → `/wallets`'e döner.
6. Hata eşlemesi: `WALLET_ADDRESS_INVALID_FORMAT` → "Adres formatı bu ağ için geçerli değil." (adres alanı altında); `NETWORK_ASSET_INACTIVE` → "Bu ağ şu anda kullanıma kapalı."; `409 WALLET_ADDRESS_ALREADY_EXISTS` → "Bu adres zaten sisteme kayıtlı."
7. Manuel doğrulama: `/wallets/add?type=watch-only` → gerçek bir Sepolia testnet adresi gir → `/wallets/[id]`'e yönlen → birkaç dakika sonra (worker turu) bakiye/USDT karşılığı görünür (Faz 3 İnsan onay noktasının ilk yarısı).
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(authenticated)/wallets/[id]/page.tsx`, `wallets/add/page.tsx`, `components/AddressDisplay.tsx`, `hooks/useWallet.ts`, `useCreateWatchOnlyWallet.ts` |
| Güncelle | `hooks/useNetworks.ts` (yoksa oluşturulur) |
| Dokunma | S-MOVEMENTS bağlantısı (İterasyon 9'a kadar boş route), S-WALLET-ADD-MANAGED (Faz 4 §4.3) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Adres format hata eşlemesi | `docs/06` §4.2 S-WALLET-ADD-WATCHONLY | 3 hata kodu → 3 TR mesaj |
| "Transfer Gönder" yalnızca managed'da görünür | `docs/06` §4.2 S-WALLET-DETAIL | `wallet.type === 'managed'` koşulu |
| Sahiplik olmayan cüzdana erişim | `docs/07` §4 "yalnızca backend'de zorlanır" | Backend zaten `403` döner; bu geçici yönlendirme yalnızca UX |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok (Faz 1/2/İterasyon 6 ile aynı gerekçe); doğrulama e2e'de (Faz 7 §7.3 "watch-only cüzdan ekleme" journey'si) ve manuel adımda

**Bu iterasyonda yok:** S-WALLET-ADD-MANAGED (Faz 4 §4.3), S-FORBIDDEN-403 (Faz 7 — bu iterasyonda `/dashboard`'a geçici yönlendirme), S-MOVEMENTS'in gerçek içeriği (İterasyon 9).

**Risk / dikkat:** "Transfer Gönder" butonunun koşulu (`type === 'managed'`) bu fazda test edilemez çünkü sistemde hiç managed cüzdan yok (Faz 4'e kadar) — kod doğru yazılsa da manuel doğrulaması ancak Faz 4 sonrası mümkündür; PR açıklamasında bu sınırlama not düşülmeli.

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (watch-only cüzdan ekleme → detay ekranı)
- [ ] PR/onay → İterasyon 8
