### İterasyon 5 — Frontend: S-ADMIN-AUDIT-LOG (§6.3b)

**Hedef:** `/admin/audit-log` ekranı çalışıyor — Admin, aktör tipi/eylem/tarih aralığı filtreleyip audit kayıtlarını listeleyebiliyor, bir satıra tıklayınca `metadata` JSON genişletilmiş görünümde açılıyor.

**Teslim çıktısı:**
- `app/(admin)/audit-log/page.tsx`
- `hooks/useAuditLogs.ts`
- Filtre formu + tablo bileşenleri (satır genişletme dahil)

**Önkoşullar:**
- [ ] İterasyon 4 Stop tamam
- [ ] `(admin)/layout.tsx` zaten var (Faz 2 §2.4); admin nav bar'ında "Audit Log" linki muhtemelen placeholder

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §6.3 — a/b bölünme notu
2. `docs/06_SCREEN_CATALOG.md` §5.2 S-ADMIN-AUDIT-LOG — amaç, ana aksiyonlar (filtre + satır genişletme)
3. `docs/03_API_CONTRACTS.md` §5.8 `GET /admin/audit-logs` — query/response şekli
4. `docs/05_FRONTEND_SPEC.md` §4 Veri Çekme Kalıbı — `use<Domain>` hook kalıbı (bu ekranda polling yok, yalnızca filtre/sayfa değişince refetch)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/frontend-admin-audit-log` branch'i aç.
2. `hooks/useAuditLogs.ts`: filtre state'ine (`actorType`, `entityType`, `action`, `dateFrom`, `dateTo`, `page`) bağlı TanStack Query — polling yok, yalnızca filtre/sayfa değişince refetch.
3. `audit-log/page.tsx`: filtre formu (select `actorType`, text `entityType`/`action`, tarih aralığı `dateFrom`/`dateTo`) + tablo (tarih, `actorType`, `actorId`, `action`, `entityType`, `entityId`) + satıra tıklama → inline genişleyen JSON görünümüyle `metadata`.
4. Boş state: filtreyle eşleşen kayıt yoksa "Bu filtrelerle eşleşen bir denetim kaydı bulunamadı." mesajı.
5. `(admin)/layout.tsx`'teki "Audit Log" nav linkini `/admin/audit-log`'a bağla (Faz 2 §2.4'te placeholder bırakılmışsa).
6. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `app/(admin)/audit-log/page.tsx`, `hooks/useAuditLogs.ts` |
| Güncelle | `app/(admin)/layout.tsx` (nav linki, placeholder ise) |
| Dokunma | `admin.controller.ts` (İterasyon 4'te tamamlandı) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Filtre alanları | `docs/06` S-ADMIN-AUDIT-LOG | aktör tipi/eylem/tarih aralığı |
| Satır → JSON genişletme | `docs/06` S-ADMIN-AUDIT-LOG | yalnızca görüntüleme, düzenleme yok |
| Salt-okunur | `docs/03` §5.8 | mutation yok, yalnızca `GET` |

**Kalite kapıları:**
- [ ] `pnpm --filter web build` hatasız
- [ ] lint/typecheck yeşil
- [ ] Otomatik frontend testi yok (Faz 3/5 ile aynı gerekçe); manuel + Faz 7 e2e

**Bu iterasyonda yok:** Audit kaydı export/CSV indirme (roadmap'te yok), kayıt silme/düzenleme (append-only, hiçbir zaman UI'dan mümkün değil).

**Risk / dikkat:** `metadata` alanı olay tipine göre farklı şekil taşır (ör. `NETWORK_ASSET_ACTIVATED` için `{networkId, assetId}`, `MINT_EXECUTED` için `{walletId, assetId, amount}`) — sabit bir şema varsayılmaz, ham JSON olduğu gibi gösterilir, alan bazlı özel render yapılmaz (over-engineering yasağı).

**Stop:**
- [ ] `pnpm --filter web build`
- [ ] Manuel doğrulama (filtre + satır genişletme)
- [ ] Faz 6 devam → İterasyon 6
