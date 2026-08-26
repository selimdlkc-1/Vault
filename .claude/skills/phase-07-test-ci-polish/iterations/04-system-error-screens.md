### İterasyon 4 — Sistem Ekranları (§7.4)

**Hedef:** S-ERROR-404, S-ERROR-500, S-FORBIDDEN-403 ekranları üretilmiş; role-göre "panele dön" yönlendirme mantığı (auth olmuş kullanıcı → `/dashboard`, olmayan → `/login`) tüm asıl ekranlar mevcut olduğundan tam bağlamla çalışıyor.

**Teslim çıktısı:**
- `apps/web/src/app/not-found.tsx` — S-ERROR-404
- `apps/web/src/app/error.tsx` (global error boundary) — S-ERROR-500
- `apps/web/src/app/forbidden/page.tsx` (veya route grubuna uygun eşdeğer) — S-FORBIDDEN-403
- Mevcut yetkisiz-erişim yönlendirme noktalarının (`docs/06` §5.3 satır 94-95: S-WALLET-DETAIL, S-ADMIN-NETWORK-ASSETS gibi) S-FORBIDDEN-403'e bağlanması

**Önkoşullar:**
- [ ] İterasyon 3 Stop tamam
- [ ] Faz 0-6'nın tüm asıl ekranları (21 ekranın kalanı) üretilmiş — bu iterasyon yönlendirme hedeflerinin (`/dashboard`, `/login`) gerçek route'lar olduğunu varsayar

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §7.4 — iterasyon kapsamı ve gerekçe (neden bu noktaya kadar bekletildi)
2. `docs/06_SCREEN_CATALOG.md` §5.3 Sistem Ekranları — 3 ekranın route/yetki/amaç/ana aksiyon tanımı (satır 450-473 civarı)
3. `docs/06_SCREEN_CATALOG.md` — "Hata durumu standardı" ve "Yetkisiz durum standardı" (dosya sonu civarı) — genel UX kuralı, bu 3 ekranın da uyması gereken çerçeve
4. `docs/05_FRONTEND_SPEC.md` §8 — form/link'lerin klavye erişilebilir olması (bu ekranlardaki "Panele Dön"/"Tekrar Dene" butonları dahil)

**Uygulama planı:**
1. `apps/web/src/app/not-found.tsx` — Next.js App Router konvansiyonuyla, eşleşmeyen route'larda otomatik tetiklenir; "Panele Dön" aksiyonu `docs/06` §5.3 mantığıyla (authenticate → `/dashboard`, değilse → `/login`) client-side auth state kontrolü.
2. `apps/web/src/app/error.tsx` — Next.js global error boundary konvansiyonu; ham hata/stack trace asla render edilmez (`docs/06` Hata durumu standardı), "Sayfayı Yenile" (`reset()` prop) ve "Panele Dön" iki aksiyon.
3. S-FORBIDDEN-403 için route grubuna uygun bir sayfa oluştur (proje route yapısına göre `apps/web/src/app/forbidden/page.tsx` veya benzeri) — herkese açık, asıl korunan kaynağın kendisi değil.
4. `docs/06` §5.3'te "Yetkisiz durum standardı" gereği: bir kaynağa erişim `403` ile reddedildiğinde sayfa içi banner + eski içerik render etmeye devam eden ara durum **yasak** — mevcut ekranların (S-WALLET-DETAIL, S-TRANSFER-CONFIRM/DETAIL, S-ADMIN-NETWORK-ASSETS, S-ADMIN-MINT gibi `docs/06` içinde "Yetkisiz" UX state'i tanımlı ekranlar) yetkisiz durumunu tam yönlendirmeye (router.push) çevir, banner'lı ara hal varsa kaldır.
5. Her 3 ekranı manuel olarak (auth'lu/auth'suz, admin/user) tarayıcıda doğrula.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `apps/web/src/app/not-found.tsx`, `apps/web/src/app/error.tsx`, `apps/web/src/app/forbidden/page.tsx` |
| Güncelle | S-WALLET-DETAIL, S-TRANSFER-CONFIRM, S-TRANSFER-DETAIL, S-ADMIN-NETWORK-ASSETS, S-ADMIN-MINT bileşenlerinin yetkisiz-durum handling'i (yönlendirmeye çevir) |
| Dokunma | Auth guard/middleware mantığının kendisi (Faz 1 §1.7'de kuruldu) — bu iterasyon yalnızca hedef ekranları ekler, guard mantığını değiştirmez |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| S-ERROR-404 route `*` | `docs/06` §5.3 | Next.js `not-found.tsx` konvansiyonu |
| S-ERROR-500 global error boundary | `docs/06` §5.3 | Next.js `error.tsx`, ham hata asla gösterilmez |
| S-FORBIDDEN-403 route `*` (yetkisiz) | `docs/06` §5.3 | Herkese açık sayfa; asıl kaynak korunur, bu sayfa değil |
| "Panele Dön" role göre hedef | `docs/06` §5.3 | Authenticate → `/dashboard`, değilse → `/login` |
| Ara hal yasağı | `docs/06` Yetkisiz durum standardı | Ya tam yetkili içerik ya tam yönlendirme |

**Kalite kapıları:**
- [ ] 3 ekranın her biri manuel senaryoda (404 route, tetiklenmiş runtime hata, yetkisiz erişim) doğru render oluyor
- [ ] "Panele Dön" yönlendirmesi hem auth'lu hem auth'suz durumda doğru hedefe gidiyor (regresyon testi veya E2E'ye ek assertion)
- [ ] Lint + typecheck + build yeşil
- [ ] En az bir otomatik test (component/integration) S-FORBIDDEN-403 yönlendirmesini doğruluyor

**Bu iterasyonda yok:**
- Yeni bir auth guard/middleware mantığı yazmak — Faz 1 §1.7'nin ürettiği mekanizma kullanılır, değiştirilmez
- Hata loglama/monitoring entegrasyonu — proje deploy edilmiyor, monitoring MVP dışı (`docs/00`)
- Diğer 18 ekranın kendi UX state'lerini (boş/yükleniyor/hata) yeniden gözden geçirmek — bu, İterasyon 5'in a11y geçişiyle karışmaz, kapsamı yalnızca yetkisiz-durum yönlendirmesidir

**Risk / dikkat:**
- `error.tsx` bir Client Component olmalıdır (Next.js App Router zorunluluğu) — sunucu tarafı hatalarda bile client'ta render edilir, bu davranış yanlış anlaşılmamalı.
- Ham hata mesajı/stack trace'in yanlışlıkla `error.tsx`'e prop olarak geçip render edilmesi (`docs/06` Hata durumu standardı ihlali) — yalnızca sadeleştirilmiş TR mesaj gösterilmeli.

**Stop:**
- [ ] Manuel: `/var-olmayan-route` → S-ERROR-404, bilinçli fırlatılmış hata → S-ERROR-500, yetkisiz erişim → S-FORBIDDEN-403
- [ ] `pnpm turbo lint typecheck test build` yeşil
- [ ] PR/onay → İterasyon 5
