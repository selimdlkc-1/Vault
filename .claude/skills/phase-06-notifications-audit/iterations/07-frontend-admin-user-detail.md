### İterasyon 7 — Frontend: S-ADMIN-USER-DETAIL (§6.4b)

**Hedef:** `/admin/users/[id]` ekranı çalışıyor — Admin bir kullanıcının cüzdanlarını (satır tıklamayla bakiye detayı genişler) ve transferlerini görüyor; transfer satırına tıklama S-TRANSFER-DETAIL'in Admin salt-okunur görünümüne gidiyor; private key hiçbir yerde görünmüyor.

**Teslim çıktısı:**
- `app/(admin)/users/[id]/page.tsx`
- `hooks/useAdminUserWallets.ts`, `hooks/useAdminUserTransfers.ts`

**Önkoşullar:**
- [ ] İterasyon 6 Stop tamam
- [ ] S-TRANSFER-DETAIL'in Admin salt-okunur görünümü Faz 5 §5.6b'de zaten mevcut (Admin, sahiplik kontrolünden muaf olarak `GET /transfers/:id`'e erişebiliyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §6.4 — a/b bölünme notu
2. `docs/06_SCREEN_CATALOG.md` §5.2 S-ADMIN-USER-DETAIL — amaç, ana aksiyonlar (cüzdan genişletme, transfer→S-TRANSFER-DETAIL)
3. `docs/03_API_CONTRACTS.md` §5.8 — response şeması (§5.2/§5.4 ile birebir aynı)
4. `docs/03_API_CONTRACTS.md` §5.8 `GET /admin/users` notu (Faz 4 §4.4c) — kullanıcı listesinden bu ekrana geçiş referansı

**Uygulama planı:**
1. `git-phase-branch` ile `feat/frontend-admin-user-detail` branch'i aç.
2. `hooks/useAdminUserWallets.ts` + `useAdminUserTransfers.ts`: `GET /admin/users/:userId/wallets` ve `/transfers`.
3. `users/[id]/page.tsx`: cüzdan tablosu (satıra tıklama → inline bakiye detayı genişler, S-WALLET-DETAIL'in Faz 3'teki bakiye gösterim bileşenleri yeniden kullanılır); transfer tablosu (satıra tıklama → mevcut `/transfers/[id]` route'una, Admin zaten yetkili). Ayrı bir kullanıcı özet endpoint'i yoktur (roadmap'te tanımlı değil) — route param'daki `id` ile doğrudan cüzdan/transfer listeleri gösterilir.
4. Private key hiçbir alanda gösterilmez — `WalletsService` zaten bu alanı döndürmüyor (İterasyon 6), frontend ek bir gizleme mantığı yazmaz, yalnızca dönmeyen alanı render etmez.
5. Boş state: kullanıcının hiç cüzdanı/transferi yoksa "Bu kullanıcının henüz bir cüzdanı/transferi yok." mesajı.
6. `(admin)/users` listesi (Faz 4 §4.4c'de S-ADMIN-MINT'in kullanıcı arama akışıyla var) kullanıcı satırından `/admin/users/[id]`'e linki bağla.
7. Manuel doğrulama: private key'in network tab/DOM'da hiçbir yerde görünmediğinin manuel kontrolü (Faz 4 §4.2 testinin frontend karşılığı).
8. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(admin)/users/[id]/page.tsx`, `hooks/useAdminUserWallets.ts`, `hooks/useAdminUserTransfers.ts` |
| Güncelle | S-ADMIN-MINT kullanıcı listesi bileşeni (satır → `/admin/users/[id]` linki) |
| Dokunma | `transfers/[id]/page.tsx` (Admin görünümü Faz 5'te zaten var, değiştirilmez) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Cüzdan genişletme | `docs/06` S-ADMIN-USER-DETAIL | inline bakiye detayı |
| Transfer → S-TRANSFER-DETAIL | `docs/06` S-ADMIN-USER-DETAIL | mevcut route'a yönlendirme |
| Private key erişimi yok | `docs/06` S-ADMIN-USER-DETAIL amacı | backend zaten döndürmüyor, frontend ek render yok |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Otomatik frontend testi yok; manuel doğrulama (private key sızıntı kontrolü dahil) + Faz 7 e2e

**Bu iterasyonda yok:** Kullanıcı düzenleme/silme (roadmap'te yok, `docs/10` Teknik Borç Kaydı — soft-delete akışı), ayrı bir `GET /admin/users/:userId` (kullanıcı özet) endpoint'i icat etmek.

**Risk / dikkat:** Bu ekran projenin "Admin her şeyi görür ama hiçbir zaman key'e dokunamaz" ilkesinin frontend'deki son doğrulama noktasıdır (Faz 4 İnsan onay noktasının frontend karşılığı) — manuel doğrulama adımı atlanmaz.

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel doğrulama (cüzdan/transfer görüntüleme + private key sızıntı kontrolü)
- [ ] Faz 6 Done Definition; `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 6 işaretlenir.
