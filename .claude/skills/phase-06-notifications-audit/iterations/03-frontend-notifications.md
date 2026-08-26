### İterasyon 3 — Frontend: S-NOTIFICATIONS (§6.2b)

**Hedef:** `/notifications` ekranı çalışıyor — kullanıcı bildirim listesini görüyor, birine tıklayınca okundu işaretlenip ilgili transfer/cüzdana yönleniyor, "Tümünü Okundu İşaretle" çalışıyor; `(authenticated)` layout'undaki bildirim ikonu artık gerçek `unreadCount` rozeti gösteriyor.

**Teslim çıktısı:**
- `app/(authenticated)/notifications/page.tsx`
- `hooks/useNotifications.ts` (15sn polling)
- `(authenticated)/layout.tsx` güncellemesi — bildirim ikonu rozeti

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam
- [ ] `(authenticated)/layout.tsx` zaten var (Faz 1 §1.7); bildirim ikonu şu ana dek statik/placeholder

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §6.2 — a/b bölünme notu
2. `docs/06_SCREEN_CATALOG.md` §5.2 S-NOTIFICATIONS — amaç, ana aksiyonlar, endpoint'ler
3. `docs/05_FRONTEND_SPEC.md` §4 Veri Çekme Kalıbı — `useNotifications` `refetchInterval: 15_000` kalıbı (birebir isim, satırda tanımlı)
4. `docs/03_API_CONTRACTS.md` §5.7 — `payload` alanına göre yönlendirme (`type`'a göre `transferId`/`walletId`)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/frontend-notifications` branch'i aç.
2. `hooks/useNotifications.ts`: TanStack Query, `refetchInterval: 15_000`, `GET /notifications` döner (`{data, pagination, unreadCount}`); `markRead` mutation (tek id) + `markAllRead` (okunmamışların id listesi üzerinde `Promise.all` ile tek tek `PATCH` — İterasyon 2 Risk notu, yeni endpoint yok).
3. `notifications/page.tsx`: liste — her satır `type`'a göre ikon/metin (`tx_confirmed`/`tx_failed`/`incoming_transfer_detected` için TR metin), okunmamışlar görsel olarak vurgulu; satıra tıklama → `markRead` + `payload.transferId` varsa `/transfers/[id]`'e, `payload.walletId` varsa `/wallets/[id]`'e yönlendirir; "Tümünü Okundu İşaretle" butonu.
4. Boş state: bildirim yoksa "Henüz bir bildiriminiz yok." mesajı.
5. `(authenticated)/layout.tsx`: bildirim ikonuna `useNotifications().unreadCount` rozet olarak bağlanır (sade sayı gösterimi yeterli, üst sınır/"9+" gibi bir gösterim docs'ta tanımlı değilse eklenmez — over-engineering yasağı).
6. Manuel doğrulama: bir `tx_confirmed` bildirimi üretecek şekilde (Faz 5 akışıyla) bir transfer `confirmed`'e ulaştır → 15sn içinde `/notifications`'ta ve nav rozetinde görünür.
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(authenticated)/notifications/page.tsx`, `hooks/useNotifications.ts` |
| Güncelle | `app/(authenticated)/layout.tsx` (bildirim ikonu rozeti) |
| Dokunma | `transfers/[id]/page.tsx`, `wallets/[id]/page.tsx` (yalnızca yönlendirme hedefi, değiştirilmez) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Ana aksiyonlar (tıklama→yönlendirme, tümünü okundu) | `docs/06` S-NOTIFICATIONS | `payload`'a göre `router.push` |
| 15sn polling | `docs/05` §4 | `refetchInterval: 15_000` |
| Sessiz arka plan yenileme | `docs/06` satır 485 (Yükleniyor durumu standardı) | polling'te ayrı loading göstergesi yok |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Otomatik frontend testi yok (Faz 3/5 ile aynı gerekçe, `docs/08` §1); doğrulama manuel + Faz 7 e2e

**Bu iterasyonda yok:** Bildirim tercihleri/ayarları ekranı (roadmap'te yok), email/SMS entegrasyonu (N-001 kapsam dışı).

**Risk / dikkat:** `markAllRead`, backend'de tek bir toplu endpoint olmadığından N adet `PATCH` isteği anlamına gelir; demo ölçeğinde bu sorun yaratmaz ama isteklerin paralel (`Promise.all`) gönderildiği ve backend'in aynı anda gelen isteklere dayanıklı olduğu (idempotent `PATCH`, ikinci çağrı no-op) unutulmaz.

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel doğrulama (bildirim üretimi → liste + rozet + tıklama yönlendirmesi)
- [ ] PR/onay → İterasyon 4
