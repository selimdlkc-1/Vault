### İterasyon 9 — Frontend: S-MOVEMENTS (§3.6b)

**Hedef:** S-MOVEMENTS gerçek tarayıcıda çalışır durumda; İterasyon 6'da nav bar'a eklenen "Hareketler" linki artık gerçek bir sayfaya götürür. Bir watch-only cüzdan eklenip gerçek bir Sepolia testnet adresinin hareket geçmişi doğru görüntülenebiliyor — bu, **Faz 3 İnsan onay noktasının tamamlanmasıdır**.

**Teslim çıktısı:**
- `apps/web/src/app/(authenticated)/movements/page.tsx`
- `hooks/useMovements.ts`
- `components/ExplorerLink.tsx`

**Önkoşullar:**
- [ ] İterasyon 8 Stop tamam (`GET /movements` çalışıyor)
- [ ] İterasyon 7 Stop tamam (`AddressDisplay` mevcut, bu ekranda yeniden kullanılır)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.6 — kapsam (b) kısmı
2. `docs/06_SCREEN_CATALOG.md` §4.2/§4.3 S-MOVEMENTS; §6 Ortak Bileşenler `ExplorerLink`
3. `docs/03_API_CONTRACTS.md` §5.5 `GET /movements` — filtre parametreleri, response şekli
4. `add-new-screen` skill (prosedür referansı)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/movements-screen` branch'i aç.
2. `components/ExplorerLink.tsx`: ağa göre doğru blok gezgini base URL'i üretir (Sepolia: `sepolia.etherscan.io`, BSC Testnet: `testnet.bscscan.com`, Tron Shasta: `shasta.tronscan.org` — tam URL formatları kullanılabilir güncel dokümantasyona göre doğrulanır), tx hash gösteren her yerde kullanılır.
3. `hooks/useMovements.ts` (`GET /movements`, filtre parametreleri: `walletId?`, `networkId?`, `assetId?`, `direction?`, `dateFrom?`, `dateTo?`, `state?` — bu fazda `state` filtresi backend'de anlamsız kalır çünkü `source: 'system'` yok, ama alan spec'e göre baştan eklenir).
4. `app/(authenticated)/movements/page.tsx`: cüzdan/ağ/varlık/yön/tarih aralığı/durum filtreleri; her satırda tarih, yön ikonu, varlık+miktar, `UsdtValue` (o anki snapshot değeri — bu fazda hesaplama anlık fiyattan yapılır, `chain_movements`'in kendi bir `valueUsdtAtTime` alanı yoktur; backend `docs/03` §5.5 response'unda bu alanı döner, İterasyon 8'in servisi bunu `usdt-conversion.util.ts` ile türetir), `AddressDisplay`/`ExplorerLink` ile tx hash, kaynak badge'i (bu fazda her zaman "Zincir Hareketi" — "Sistem Transferi" Faz 5 sonrası görünür).
5. Boş durum: filtre yoksa "Henüz bir hareket yok.", filtre varsa "Bu filtrelerle eşleşen hareket bulunamadı." + "Filtreleri Temizle" (`docs/06` §6 boş durum standardı — iki farklı mesaj karıştırılmaz).
6. Nav bar'daki "Hareketler" linkinin artık gerçek bir route'a gittiği doğrulanır (İterasyon 6'nın geçici notu kapanır).
7. Manuel doğrulama (Faz 3 İnsan onay noktası): `/wallets/add?type=watch-only` ile gerçek bir Sepolia adresi ekle → İterasyon 8'in Alchemy webhook'u (veya Tron ise polling worker'ı) bir hareket indexlediğinde `/movements`'te satır olarak görünür.
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(authenticated)/movements/page.tsx`, `hooks/useMovements.ts`, `components/ExplorerLink.tsx` |
| Dokunma | S-TRANSFER-DETAIL'e satır tıklama yönlendirmesi (Faz 5 — bu fazda `source` her zaman `'chain'` olduğundan tıklamada yalnızca `ExplorerLink` harici sekmede açılır, dahili yönlendirme yoktur) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Boş durum iki farklı mesaj (filtre yok / filtre eşleşmedi) | `docs/06` §6 | koşullu render, iki ayrı TR metin |
| Kaynak badge'i | `docs/06` §4.2 S-MOVEMENTS | bu fazda her zaman "Zincir Hareketi" |
| `chain` kaynağı satırına tıklama → explorer harici sekmede | `docs/06` §4.2 | `source: 'system'` dalı Faz 5'e kadar hiç tetiklenmez |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok (önceki frontend iterasyonlarıyla aynı gerekçe); doğrulama Faz 3 İnsan onay noktasının manuel adımıyla yapılır

**Bu iterasyonda yok:** `source: 'system'` satırları ve S-TRANSFER-DETAIL'e dahili yönlendirme (Faz 5), `state` filtresinin gerçek etkisi (Faz 5 sonrası anlamlı hale gelir).

**Risk / dikkat:** Alchemy webhook'unun (İterasyon 8) tetiklenmesi, eklenen adrese gerçekten testnet üzerinde bir hareket olmasına bağlıdır — İnsan onay noktasının doğrulanması için manuel olarak Sepolia faucet'inden test adresine küçük bir miktar gönderilmesi gerekebilir; bu bir kod eksikliği değil, doğrulamanın doğası gereği dış bir bağımlılıktır.

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (watch-only cüzdan → gerçek testnet hareketi → `/movements`'te görünür)
- [ ] Faz 3 Done Definition tamam; `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 3 işaretlenir; kullanıcı onayı → Faz 4
