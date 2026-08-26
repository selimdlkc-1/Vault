### İterasyon 6 — Frontend: Dashboard + Cüzdan Listesi (§3.5a)

**Hedef:** S-DASHBOARD (Faz 1 §1.7'nin geçici placeholder'ının yerini alır) ve S-WALLET-LIST gerçek tarayıcıda çalışır durumda; `UsdtValue` ve `TestnetDisclaimer` ortak bileşenleri kurulur, `(authenticated)` layout'una nav bar + `TestnetDisclaimer` eklenir.

**Teslim çıktısı:**
- `apps/web/src/app/(authenticated)/dashboard/page.tsx` (placeholder'ın yerini alır), `(authenticated)/wallets/page.tsx`
- `apps/web/src/app/(authenticated)/layout.tsx` güncellemesi (nav bar + `TestnetDisclaimer`)
- `components/UsdtValue.tsx`, `components/TestnetDisclaimer.tsx` (dosya yoksa oluşturulur — bkz. Risk/dikkat)
- `hooks/usePortfolioSummary.ts`, `hooks/usePortfolioHistory.ts`, `hooks/useWallets.ts`

**Önkoşullar:**
- [ ] İterasyon 4 Stop tamam (`GET /wallets` çalışıyor)
- [ ] İterasyon 5 Stop tamam (`GET /portfolio/summary`, `GET /portfolio/history` çalışıyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.5 — kapsam (a) kısmı ve `TestnetDisclaimer` notu
2. `docs/06_SCREEN_CATALOG.md` §4.2 S-DASHBOARD, S-WALLET-LIST — alan listesi, UX state'leri, TR metin listesi; §6 Ortak Bileşenler (`UsdtValue`, `TestnetDisclaimer`)
3. `docs/05_FRONTEND_SPEC.md` (layout hiyerarşisi, `use<Domain>` hook kalıbı, `staleTime: 30_000`, `UsdtValue` para birimi kuralı)
4. `add-new-screen` skill (prosedür referansı)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/dashboard-wallet-list-screens` branch'i aç.
2. `components/UsdtValue.tsx`: değeri her zaman `"1.234,56 USDT"` formatında (TR sayı biçimi) gösterir, `$` üretmez, `value: string | null` alır — `null` ise `"—"` render eder (İterasyon 4/5'in fiyat-eksik kararının UI karşılığı).
3. `components/TestnetDisclaimer.tsx`: dosya `(admin)` layout'undan (Faz 2 §2.4) zaten mevcutsa **oluşturulmaz**, yalnızca import edilir; yoksa "testnet varlıkları — gösterge değerdir" metnini sabit gösteren bileşen olarak oluşturulur.
4. `app/(authenticated)/layout.tsx` güncellenir: nav bar'a "Dashboard", "Cüzdanlarım", "Hareketler" (İterasyon 9'a kadar route'u boş/placeholder kalabilir — link eklenir ama sayfa İterasyon 9'da gelir), bildirim ikonu (Faz 6'ya kadar statik/pasif) eklenir; layout üstüne `TestnetDisclaimer` eklenir.
5. `hooks/usePortfolioSummary.ts` (`GET /portfolio/summary`, `staleTime: 30_000`), `hooks/usePortfolioHistory.ts` (`GET /portfolio/history`, tarih aralığı parametreli), `hooks/useWallets.ts` (`GET /wallets`, filtre parametreli).
6. `app/(authenticated)/dashboard/page.tsx`: toplam USDT değeri (`UsdtValue` ile), cüzdan bazlı varlık dağılımı, tarih aralığı filtreli geçmiş grafiği (`usePortfolioHistory`), "Cüzdan Ekle" CTA'sı (İterasyon 7'nin ekleme akışına götürür — bu iterasyonda yalnızca yönlendirme, form İterasyon 7'de). Boş durum: hiç cüzdan yoksa toplam değer ve grafik gizlenir, CTA ortada.
7. `app/(authenticated)/wallets/page.tsx`: ağ/tip filtreli tablo, her satırda ağ adı + tip badge'i ("İzleme"/"Yönetilen") + kısaltılmış adres + `UsdtValue` toplam; satıra tıklama İterasyon 7'nin S-WALLET-DETAIL'ine götürür (route önceden tanımlanır, sayfa içeriği İterasyon 7'de gelir).
8. Faz 1'in placeholder dashboard içeriği (`"Giriş başarılı" + çıkış butonu`) tamamen kaldırılır.
9. Manuel doğrulama: login → `/dashboard`'da İterasyon 1'in seed watch-only cüzdanının bakiyesi ve USDT karşılığı görünür.
10. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(authenticated)/dashboard/page.tsx`, `wallets/page.tsx`, `components/UsdtValue.tsx`, `TestnetDisclaimer.tsx` (yoksa), `hooks/usePortfolioSummary.ts`, `usePortfolioHistory.ts`, `useWallets.ts` |
| Güncelle | `app/(authenticated)/layout.tsx` |
| Dokunma | `app/(authenticated)/wallets/[id]/page.tsx`, `wallets/add/page.tsx` (İterasyon 7) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `UsdtValue` her yerde tek kaynak, `$` yasak | `docs/05` (para birimi gösterim kuralı), `mimari-kararlar` P-012 | `components/UsdtValue.tsx` |
| Boş durum: cüzdan yoksa toplam+grafik gizlenir | `docs/06` §4.2 S-DASHBOARD | koşullu render |
| Liste sorguları `staleTime: 30_000` | `docs/05` | TanStack Query hook seçenekleri |
| TR mesaj metinleri birebir | `docs/06` §4.2 | "Toplam Portföy Değeri", "Cüzdan Ekle", "Henüz bir cüzdanınız yok. Başlamak için bir cüzdan ekleyin.", vb. |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok — doğrulama e2e'de (Faz 7 §7.3) ve manuel adımda (`docs/08` frontend birim testi tanımlamıyor, Faz 1/2'yle aynı gerekçe)

**Bu iterasyonda yok:** S-WALLET-DETAIL, S-WALLET-ADD-WATCHONLY (İterasyon 7), S-MOVEMENTS (İterasyon 9 — nav linki bu iterasyonda eklenir ama sayfa henüz yok), `AddressDisplay` bileşeni (İterasyon 7'de ilk kullanım).

**Risk / dikkat:** `TestnetDisclaimer` dosyasının gerçekten Faz 2 İterasyon 4'te oluşturulup oluşturulmadığı bu iterasyonun başında **kontrol edilmeli** (`Glob apps/web/src/components/TestnetDisclaimer.tsx`) — varsa yeniden oluşturmak gereksiz bir çakışma/duplicate yaratır, yoksa (roadmap'in orijinal ataması buradaydı) burada oluşturulur. Nav bar'ın "Hareketler" linkinin İterasyon 9'a kadar boş bir route'a işaret etmesi Faz 1/2'nin placeholder disiplinine benzer geçici bir durumdur — PR açıklamasında not düşülmeli.

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (login → dashboard → cüzdan listesi)
- [ ] PR/onay → İterasyon 7
