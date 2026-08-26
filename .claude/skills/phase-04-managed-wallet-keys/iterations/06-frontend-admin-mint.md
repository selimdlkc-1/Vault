### İterasyon 6 — Frontend: S-ADMIN-MINT (§4.4c)

**Hedef:** S-ADMIN-MINT gerçek tarayıcıda çalışır durumda — Admin bir kullanıcıyı email ile arayıp seçiyor, o kullanıcının cüzdanlarından birini ve cüzdanın ağındaki aktif bir varlığı seçip mint edebiliyor; bu, Faz 4 İnsan onay noktasının "yönetilen cüzdan + mint uçtan uca çalışıyor" tarafını tamamlar.

**Teslim çıktısı:**
- `apps/web/src/app/(admin)/mint/page.tsx`
- `hooks/{useAdminUserSearch.ts, useAdminUserWallets.ts, useMint.ts}`

**Önkoşullar:**
- [ ] İterasyon 5 Stop tamam (`POST /admin/mint`, `GET /admin/users` çalışıyor)
- [ ] `(admin)` layout ve route guard'ı Faz 2 §2.4'te zaten kuruldu

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §4.4 (c kısmı) — kapsam
2. `docs/06_SCREEN_CATALOG.md` S-ADMIN-MINT — alan listesi (Kullanıcı/Cüzdan/Varlık/Tutar, kademeli aktifleşme), aksiyonlar, UX state'leri, TR mesaj metinleri
3. `docs/03_API_CONTRACTS.md` §5.8 `GET /admin/users`, `POST /admin/mint`; §5.2 `GET /wallets?userId=`
4. `add-new-screen` skill (prosedür referansı)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/frontend-admin-mint` branch'i aç.
2. `hooks/useAdminUserSearch.ts` (`GET /admin/users?email=`, debounced arama), `hooks/useAdminUserWallets.ts` (`GET /wallets?userId=<seçiliUserId>`, yalnızca bir kullanıcı seçiliyken `enabled`), `hooks/useMint.ts` (`POST /admin/mint` mutation).
3. `app/(admin)/mint/page.tsx`: dört alan kademeli aktifleşir (`docs/06` S-ADMIN-MINT UX state'leri) — Kullanıcı (arama/select) seçilmeden Cüzdan alanı `disabled`; Cüzdan seçilmeden Varlık alanı `disabled` (seçili cüzdanın `networkId`'sine göre aktif varlıklar `useNetworkAssets` — Faz 2 İterasyon 4'ten devralınır); Tutar (pozitif, ondalık ayracı nokta — `docs/06` validation notu). "Mint Et" → `useMint` → başarıda "X USDT mint edildi." toast'ı + form sıfırlanır + son 10 mint işlemi listesi güncellenir (bu liste yalnızca bu ekranın kendi state'inde tutulan son başarılı mint yanıtlarının bir özeti — ayrı bir `GET /admin/mint-operations` endpoint'i **yoktur**, `docs/03`'te tanımlı değildir, bu iterasyon icat etmez).
4. Hata eşlemesi: `CHAIN_PROVIDER_UNAVAILABLE` → "Zincir sağlayıcıya şu anda ulaşılamıyor, lütfen tekrar deneyin."; `RESOURCE_NOT_FOUND` → "Seçilen cüzdan veya varlık bulunamadı."
5. Manuel doğrulama: `/admin/mint` → kullanıcı ara/seç → cüzdan seç → varlık seç → tutar gir → "Mint Et" → toast + bakiyenin (bir sonraki `balance-sync` worker turunda, Faz 3'ün worker'ı) o kullanıcının dashboard'unda arttığını doğrula — bu, Faz 4 İnsan onay noktasının ikinci yarısıdır.
6. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(admin)/mint/page.tsx`, `hooks/{useAdminUserSearch.ts, useAdminUserWallets.ts, useMint.ts}` |
| Güncelle | — |
| Dokunma | `useNetworkAssets` (Faz 2'de oluşturuldu, yalnızca tüketilir) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Kademeli alan aktifleşmesi (Kullanıcı → Cüzdan → Varlık) | `docs/06` S-ADMIN-MINT alan listesi | `disabled` koşulları seçili üst alana bağlı |
| İki hata kodu → iki TR mesaj | `docs/06` S-ADMIN-MINT | `CHAIN_PROVIDER_UNAVAILABLE`, `RESOURCE_NOT_FOUND` |
| Son 10 mint işlemi görünürlüğü | `docs/06` S-ADMIN-MINT "Başarı" UX state'i | İstemci-taraflı, ayrı bir backend listeleme endpoint'i yok |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok (Faz 3/İterasyon 3 ile aynı gerekçe); doğrulama manuel adımda ve Faz 4 İnsan onay noktasında

**Bu iterasyonda yok:** `GET /admin/audit-logs` ekranı (Faz 6 §6.3 — mint işlemi zaten `MINT_EXECUTED` olarak audit'e yazılıyor ama bu ekrandan **okunamaz**, yalnızca kendi son-10 listesi görünür); S-ADMIN-USER-DETAIL (Faz 6 §6.4).

**Risk / dikkat:** "Son 10 mint işlemi" listesinin yalnızca istemci-taraflı (bu oturumda yapılan mint'lerin bir özeti) olduğu, sayfa yenilendiğinde sıfırlandığı — bu, `docs/06`'nın "başarı" UX state'inin minimal bir yorumudur; kalıcı bir mint geçmişi ekranı istenirse bu Faz 6 §6.3'ün (audit log okuma) kapsamına girer, bu iterasyonda genişletilmez.

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (kullanıcı ara → cüzdan/varlık seç → mint et → bakiye artışı)
- [ ] Faz 4 Done Definition'ın tamamı karşılandı → Faz 4 İnsan onay noktası (private key sızıntısı manuel kod incelemesi dahil) → Faz 5
