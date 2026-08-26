### İterasyon 7 — Frontend: S-TRANSFER-CONFIRM + S-TRANSFER-DETAIL (§5.6b)

**Hedef:** `/transfers/[id]` route'u, transfer `draft` durumundayken step-up onay formunu (S-TRANSFER-CONFIRM), diğer her durumda 5 saniyelik polling ile canlı izleme görünümünü (S-TRANSFER-DETAIL) gösteriyor; 8 durumun TR badge karşılığı `TransferStateBadge` bileşeninde merkezi; hareket geçmişinde tekilleştirme davranışı doğrulanmış.

**Teslim çıktısı:**
- `apps/web/src/app/(authenticated)/transfers/[id]/page.tsx`
- `components/TransferStateBadge.tsx`
- `hooks/{useTransfer.ts, useConfirmTransfer.ts, useDeleteTransfer.ts}`

**Önkoşullar:**
- [ ] İterasyon 6 Stop tamam (S-TRANSFER-NEW draft oluşturup `/transfers/[id]`'e yönlendiriyor)
- [ ] İterasyon 2 Stop tamam (`POST /transfers/:id/confirm` çalışıyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §5.6 — kapsam ve a/b bölünme notu
2. `docs/06_SCREEN_CATALOG.md` S-TRANSFER-CONFIRM + S-TRANSFER-DETAIL — alan listesi, aksiyonlar, UX state'leri, TR mesaj metinleri (8 durum badge metni), `TransferStateBadge`/`ExplorerLink` ortak bileşen notları (§ Ortak Bileşenler)
3. `docs/03_API_CONTRACTS.md` §5.4 `GET /transfers/:id`, `POST /transfers/:id/confirm`, `DELETE /transfers/:id`
4. `docs/05_FRONTEND_SPEC.md` — `useTransfer(id)` polling kuralı (`refetchInterval: 5_000`, terminal durumda durur)
5. `docs/01_DOMAIN_MODEL.md` §6 — hareket geçmişinde tekilleştirme (yalnızca doğrulama amaçlı okunur, bu iterasyon tekilleştirme mantığını yazmaz, Faz 3'te zaten kuruldu)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/frontend-transfer-confirm-detail` branch'i aç.
2. `components/TransferStateBadge.tsx`: 8 durumun sabit TR etiket + renk eşlemesi (`docs/06` § Ortak Bileşenler notu — "her ekran kendi badge metnini yeniden yazmaz"): Taslak, Onay Bekliyor, İmzalandı, Ağa Gönderildi, "Onaylanıyor (k/N blok)" (bu tek durum için ayrıca `confirmedBlocks`/`threshold` prop'u alır), Tamamlandı, Başarısız, Düştü.
3. `hooks/useTransfer.ts`: `GET /transfers/:id` — `refetchInterval: (data) => ['confirmed','failed','dropped'].includes(data?.state) ? false : 5_000` (terminal durumda polling durur, `docs/05` kuralı birebir).
4. `hooks/useConfirmTransfer.ts`: `POST /transfers/:id/confirm` mutation (`{ currentPassword }`). `hooks/useDeleteTransfer.ts`: `DELETE /transfers/:id` mutation (yalnızca `draft` durumunda kullanılabilir).
5. `transfers/[id]/page.tsx`: `useTransfer(id)` ile veri çek; `state === 'draft'` ise S-TRANSFER-CONFIRM alt görünümünü render et (özet: cüzdan/hedef/tutar salt-okunur + Mevcut Şifre alanı + "Onayla ve Gönder"/"İptal Et"), aksi halde S-TRANSFER-DETAIL alt görünümünü render et (salt-okunur, `TransferStateBadge`, `confirming` durumunda ilerleme çubuğu, `failed`/`dropped` durumunda sadeleştirilmiş `failureReason`, tx hash + `ExplorerLink` — Faz 3'te zaten var, buradan yeniden kullanılır, tam `transferStateEvents` denetim izi zaman çizelgesi olarak altta listelenir).
6. S-TRANSFER-CONFIRM aksiyonları: "Onayla ve Gönder" → `useConfirmTransfer`, başarıda "Transferiniz onaylandı, işleniyor." toast'ı + aynı sayfada S-TRANSFER-DETAIL görünümüne geçiş (state artık `pending_signature`, `useTransfer` yeniden fetch eder). "İptal Et" → `useDeleteTransfer`, başarıda `/wallets`'a döner. Hata eşlemesi: `AUTH_STEP_UP_REQUIRED` → "Şifreniz hatalı." (yalnızca şifre alanı sıfırlanır); `WALLET_INSUFFICIENT_BALANCE` → "Bakiyeniz bu işlem için yetersiz."; `TRANSFER_INVALID_TRANSITION` → "Bu transfer artık onaylanamaz." + aynı sayfa zaten S-TRANSFER-DETAIL'e düşer (state değişmiş demektir, `useTransfer` yeniden fetch ile bunu yansıtır).
7. S-TRANSFER-DETAIL aksiyonları: "Hareketlere Dön" → `/movements`. `dropped` durumunda "Yeniden Dene" → `/transfers/new?walletId=...&assetId=...&toAddress=...&amount=...` (aynı parametrelerle önceden doldurulmuş, yeni bir `draft` oluşturur — İterasyon 6'nın formunun query-param ön-doldurma desteğiyle çalışır, eski kayıt değişmez).
8. Manuel doğrulama: draft oluştur → onay formuna gir → yanlış şifre dene (hata mesajı) → doğru şifre → `pending_signature`'a geçiş + izleme görünümü + polling'in çalıştığı (backend worker'ları çalışıyorsa state'in ilerlediği gözlemlenir).
9. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(authenticated)/transfers/[id]/page.tsx`, `components/TransferStateBadge.tsx`, `hooks/{useTransfer.ts, useConfirmTransfer.ts, useDeleteTransfer.ts}` |
| Güncelle | — |
| Dokunma | `components/ExplorerLink.tsx`, `components/AddressDisplay.tsx`, `components/UsdtValue.tsx` (Faz 3'te tamamlandı, yalnızca tüketilir) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| 8 durumun TR badge karşılığı, merkezi bileşen | `docs/06` § Ortak Bileşenler | `TransferStateBadge` — S-MOVEMENTS de bu bileşeni kullanacak (Faz 6 dokunuşu, bu iterasyonda değil) |
| Terminal durumda polling durur | `docs/05` | `useTransfer` `refetchInterval` koşullu fonksiyon |
| Step-up hata mesajı yalnızca şifre alanını sıfırlar | `docs/06` S-TRANSFER-CONFIRM | Diğer form alanları korunur |
| `dropped` → Yeniden Dene, yeni draft | `docs/06` S-TRANSFER-DETAIL | Eski transfer kaydı değişmez, yalnızca yönlendirme |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Bu iterasyonda otomatik frontend testi yok (Faz 3/4 ile aynı gerekçe); doğrulama Faz 7 §7.3 e2e journey'sinde ("... → transfer başlat → step-up onayla → transfer detay ekranında `pending_signature` durumunu gör") ve manuel adımda

**Bu iterasyonda yok:** Bildirim (Faz 6 §6.1 — bu ekran yalnızca kendi polling'iyle güncellenir, bir `notifications` tetiklemesi beklemez); S-MOVEMENTS'in `TransferStateBadge`'i kullanacak şekilde güncellenmesi (Faz 6 kapsamında, bu iterasyon yalnızca bileşeni tanıtır); Admin'in salt-okunur S-TRANSFER-DETAIL erişimi (`/admin/users/[id]` üzerinden, Faz 6 §6.4 — bu iterasyon yalnızca `User` sahiplik akışını kapsar).

**Risk / dikkat:** `state === 'draft'` mı değil mi ayrımı, aynı route içinde iki farklı ekranı (`docs/06`'da ayrı `S-*` ID'leriyle tanımlı) tek bir dosyada birleştirir — bu bilinçli bir tasarımdır (backend de aynı route'u `/transfers/[id]` altında birleşik ele alır, `docs/06` route notu), iki ayrı dosyaya bölünmez çünkü ikisi de aynı `useTransfer(id)` sorgusuna bağımlıdır ve state değişimi arasında (onaydan hemen sonra) kesintisiz bir geçiş beklenir. Polling'in terminal durumda gerçekten durduğu, sonsuz döngüye giren bir `useEffect`/interval yazılmadığı ayrıca gözden geçirilmeli (TanStack Query'nin `refetchInterval` fonksiyon formu, her fetch sonrası yeniden değerlendirilir).

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel tarayıcı doğrulaması (draft → yanlış şifre → doğru şifre → izleme görünümü → polling)
- [ ] PR/onay → İterasyon 8
