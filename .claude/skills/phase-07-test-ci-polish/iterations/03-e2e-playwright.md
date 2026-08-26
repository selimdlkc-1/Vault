### İterasyon 3 — Playwright E2E (§7.3)

**Hedef:** Playwright kurulu; `docs/08_TESTING_STRATEGY.md` §6'daki 2 E2E senaryosu (ana kullanıcı akışı, watch-only cüzdan ekleme) gerçek frontend + gerçek backend + test veritabanına karşı geçiyor.

**Teslim çıktısı:**
- Playwright kurulumu (`apps/web/playwright.config.ts`, gerekli devDependency'ler)
- `apps/web/e2e/main-user-flow.e2e-spec.ts` — login → managed cüzdan oluştur → transfer başlat → step-up onayla → transfer detayda `pending_signature` görülür
- `apps/web/e2e/watch-only-wallet.e2e-spec.ts` — login → watch-only cüzdan ekle → dashboard'da bakiyeyi gör

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam
- [ ] `docker-compose up` ile tüm sistem (Postgres, Redis, API, web) ayağa kalkıyor (Faz 0 §0.1-0.2)
- [ ] Test verisi için factory fonksiyonları (`docs/08` §5) mevcut — E2E, seed'e değil bu fabrikalara veya E2E'ye özel minimal setup'a dayanır

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §7.3 — iterasyon kapsamı
2. `docs/08_TESTING_STRATEGY.md` §1 — E2E'nin piramitteki sorumluluk sınırı (yalnızca ana akış, unit/integration'da doğrulanan davranış tekrar edilmez)
3. `docs/08_TESTING_STRATEGY.md` §6 — 2 senaryonun tam adım listesi ve risk seviyeleri
4. `docs/08_TESTING_STRATEGY.md` §7 CI Gate — E2E'nin CI gate'inin **parçası olmadığının** teyidi (yalnızca 4 adım: lint/typecheck/test/build)
5. `docs/08_TESTING_STRATEGY.md` §8 — dosya yerleşimi (`apps/web/e2e/*.e2e-spec.ts`, co-location kuralı E2E'ye uygulanmaz)

**Uygulama planı:**
1. `apps/web`'e Playwright'ı ekle (`pnpm add -D @playwright/test`), `playwright.config.ts`'te `baseURL` ve test veritabanı/API'nin lokal `docker-compose` adreslerine işaret ettiğini kur.
2. E2E'ye özel test kullanıcısı/veri hazırlama stratejisi belirle — `docs/08` §5'teki factory kalıbına paralel, ama tarayıcı üzerinden çalıştığından ya API'ye doğrudan setup çağrısı (test-only seed endpoint'i **eklenmez**, mevcut register/login akışı kullanılır) ya da her test kendi kullanıcısını UI üzerinden oluşturur.
3. `apps/web/e2e/main-user-flow.e2e-spec.ts`: login → S-WALLET-ADD-MANAGED ile managed cüzdan oluştur → S-TRANSFER-NEW ile draft transfer başlat → S-TRANSFER-CONFIRM'de step-up şifre gir → S-TRANSFER-DETAIL'de `pending_signature` badge'inin göründüğünü assert et (`docs/08` §6 tam adım listesi).
4. `apps/web/e2e/watch-only-wallet.e2e-spec.ts`: login → S-WALLET-ADD-WATCHONLY ile watch-only cüzdan ekle → S-DASHBOARD'da bakiyenin göründüğünü assert et.
5. Her iki senaryoyu lokal `docker-compose` ortamına karşı çalıştır, deterministik olduklarını (flaky olmadığını) doğrula; CI workflow'una **eklenmez** (Explicit Don't).

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `apps/web/playwright.config.ts`, `apps/web/e2e/main-user-flow.e2e-spec.ts`, `apps/web/e2e/watch-only-wallet.e2e-spec.ts` |
| Güncelle | `apps/web/package.json` (devDependency + `test:e2e` script) |
| Dokunma | CI workflow dosyası — E2E adımı eklenmez |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Ana kullanıcı akışı (Yüksek risk) | `docs/08` §6 satır 1 | login→managed cüzdan→transfer→step-up→`pending_signature` görünümü |
| Watch-only ekleme (Orta risk) | `docs/08` §6 satır 2 | login→watch-only ekle→dashboard bakiye |
| 2 senaryoyla sınırlı | `docs/08` §6 gerekçe | Geniş E2E matrisi eklenmez, bakım yükü gerekçesiyle |
| E2E dosya yerleşimi | `docs/08` §8 | `apps/web/e2e/*.e2e-spec.ts`, co-location yok |

**Kalite kapıları:**
- [ ] İki E2E senaryosu lokal `docker-compose` ortamında geçiyor
- [ ] Testler idempotent — art arda birden fazla kez çalıştırıldığında aynı sonucu veriyor (test verisi çakışmıyor)
- [ ] Lint + typecheck + build yeşil (E2E, CI'ın zorunlu adımı değil ama lokal çalıştığı belgelenir)

**Bu iterasyonda yok:**
- E2E'yi CI workflow'una zorunlu adım olarak eklemek — `docs/08` §7 CI Gate 4 adımla sınırlı, bu bilinçli bir roadmap kararı
- 2'den fazla E2E senaryosu eklemek — `docs/08` §6 gerekçesiyle bilinçli olarak sınırlı
- Test-only bir seed/bypass endpoint'i eklemek — mevcut register/login akışı kullanılır

**Risk / dikkat:**
- E2E, en yavaş ve en kırılgan katmandır (`docs/08` §1); zamanlamaya duyarlı `waitFor`'lar yerine Playwright'ın kendi auto-waiting/assertion mekanizması kullanılmalı, keyfi `sleep` eklenmemeli.
- Test veritabanı state'inin E2E koşuları arasında sızmaması için her test kendi izole kullanıcısını oluşturmalı (paylaşılan seed kullanıcısına güvenilmemeli).

**Stop:**
- [ ] `pnpm --filter web test:e2e` iki senaryoda da yeşil (lokal `docker-compose` ortamına karşı)
- [ ] `pnpm turbo lint typecheck build` yeşil
- [ ] PR/onay → İterasyon 4
