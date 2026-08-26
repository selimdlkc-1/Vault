### İterasyon 5 — Portföy Özet/Geçmiş Endpoint'leri + `portfolio-snapshot` Worker (§3.4b)

**Hedef:** `GET /portfolio/summary` kullanıcının tüm cüzdanlarının USDT toplamını döner; yeni `portfolio_snapshots` tablosu ve periyodik `portfolio-snapshot` worker'ı bu toplamı düzenli aralıklarla dondurup saklar; `GET /portfolio/history` bu snapshot'lardan okur (sorgu anında yeniden hesaplamaz — `mimari-kararlar` P-016).

**Teslim çıktısı:**
- `portfolio_snapshots` migration
- `apps/api/src/portfolio/{portfolio.module.ts, portfolio.controller.ts, portfolio.service.ts, portfolio.repository.ts}` (+ `.spec.ts`)
- `apps/api/src/workers/portfolio-snapshot/{portfolio-snapshot.module.ts, portfolio-snapshot.processor.ts}` (+ `.spec.ts`)

**Önkoşullar:**
- [ ] İterasyon 4 Stop tamam (`usdt-conversion.util.ts` mevcut, `GET /wallets` çalışıyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §3.4 — kapsam (b) kısmı
2. `docs/02_DATABASE_SCHEMA.md` §2.14 `portfolio_snapshots` — tam şema
3. `docs/03_API_CONTRACTS.md` §5.6 Portfolio — `GET /portfolio/summary`, `GET /portfolio/history` request/response
4. `docs/01_DOMAIN_MODEL.md` §2.12 `PortfolioSnapshot` — yaşam döngüsü
5. `docs/mimari-kararlar.md` P-016 (snapshot'a o anki fiyat+kaynak+zaman damgası yazılır, geçmiş yeniden hesaplanmaz)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/portfolio-summary-history` branch'i aç.
2. `add-prisma-migration` prosedürüyle `portfolio_snapshots` tablosunu (`docs/02` §2.14 birebir) ekle.
3. `portfolio/portfolio.repository.ts`: `findWalletsWithBalancesByUser(userId)` (İterasyon 4'ün `wallets.repository`'sine benzer, portföy modülü kendi sorgusunu tutar — `docs/04` §3 "bir modül başka bir modülün repository'sine doğrudan erişmez" kuralı), `createSnapshot(tx, { userId, totalValueUsdt, priceSource })`, `findSnapshotsByUserAndRange(userId, dateFrom, dateTo)`.
4. `portfolio/portfolio.service.ts`: `getSummary(userId)` — kullanıcının tüm cüzdan/varlık bakiyelerini `usdt-conversion.util.ts` (İterasyon 4) ile zenginleştirir, `docs/03` §5.6 şekline (`{ totalValueUsdt, wallets: [...] }`) maplar; fiyatı eksik olan varlıklar toplam hesaplamasına dahil edilmez (İterasyon 4'ün `null` kararının doğal sonucu), bu durum loglanır ama hata fırlatılmaz. `getHistory(userId, dateFrom, dateTo)` — `portfolio_snapshots`'tan okur, `VALIDATION_FAILED` (dateTo < dateFrom).
5. `portfolio/portfolio.controller.ts`: `GET /portfolio/summary`, `GET /portfolio/history` (`dateFrom`/`dateTo` query, zod şemasıyla doğrulanır).
6. `workers/portfolio-snapshot/portfolio-snapshot.processor.ts`: periyodik tetiklenir; tüm kullanıcıları (en az bir cüzdanı olanlar) tarar, her biri için `PortfolioService.getSummary(userId)`'yi çağırıp sonucu `portfolio_snapshots`'a insert eder (`priceSource: 'coingecko'`); `İterasyon 2`'nin idempotency kalıbı burada uygulanmaz çünkü snapshot append-only'dir ve her tur yeni bir kayıttır (idempotency anahtarı gerekmez, `docs/04` §8'in "job türüne göre" notu).
7. `workers/portfolio-snapshot/portfolio-snapshot.module.ts`: `BullModule.registerQueue({ name: 'portfolio-snapshot' })`, `PortfolioModule`/`UsersModule` (veya `AuthModule`'ün kullanıcı listesi kaynağı) import edilir.
8. Unit test (`portfolio.service`): `getSummary` doğru toplam + fiyat eksik varlığın dışlanması; `getHistory` tarih validasyonu. Unit test (`portfolio-snapshot.processor`): mock `PortfolioService` ile doğru insert. Integration test: `GET /portfolio/summary` `200` (İterasyon 1'in seed cüzdanıyla).
9. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | migration dosyası, `portfolio/{portfolio.module.ts, portfolio.controller.ts, portfolio.service.ts, portfolio.repository.ts}` (+`.spec.ts`), `workers/portfolio-snapshot/{portfolio-snapshot.module.ts, portfolio-snapshot.processor.ts}` (+`.spec.ts`) |
| Güncelle | `schema.prisma`, `apps/api/src/app.module.ts` |
| Dokunma | `usdt-conversion.util.ts` (yalnızca çağrılır, değiştirilmez) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `totalValueUsdt` `NUMERIC(38,18)` string temsili, asla `number` | `docs/03` §5.6 | `PortfolioService.getSummary` string döner |
| Geçmiş grafiği snapshot'lardan okunur, yeniden hesaplanmaz | `mimari-kararlar` P-016 | `getHistory` yalnızca `SELECT`, hesaplama yok |
| Geçersiz tarih aralığı | `docs/03` §5.6 | `VALIDATION_FAILED`, `dateTo >= dateFrom` |

**Kalite kapıları:**
- [ ] Unit test: `PortfolioService.getSummary`/`getHistory`, `portfolio-snapshot.processor`
- [ ] Integration test: `GET /portfolio/summary` `200`
- [ ] `pnpm --filter api exec prisma migrate dev` hatasız
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** Frontend tüketimi (İterasyon 6 — S-DASHBOARD grafiği), snapshot retention/silme politikası (yok, `docs/02` §7 ile uyumlu — demo veri seti küçük kalır).

**Risk / dikkat:** `PortfolioService`'in kendi `findWalletsWithBalancesByUser` sorgusunu tutması (İterasyon 4'ün `wallets.repository`'sini import etmemesi) `docs/04` §3'ün modül izolasyon kuralının bilinçli bir sonucudur — bu, hafif bir kod tekrarı pahasına modüller arası repository sızıntısını engeller; `WalletsModule`'ü `imports`+`exports` ile kullanmak yerine kendi sorgusunu yazmak burada doğru karardır.

**Stop:**
- [ ] `pnpm --filter api test -- portfolio`
- [ ] PR/onay → İterasyon 6
