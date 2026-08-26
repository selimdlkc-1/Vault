### İterasyon 2 — Kalan Negatif/Deny Senaryoları (§7.2)

**Hedef:** `docs/08_TESTING_STRATEGY.md` §4'teki 12 zorunlu deny senaryosundan Faz 5 §5.7'de kapsanmayan 4'ü — yetkisiz erişim (ownership + role), rate limit aşımı, geçersiz adres formatı — regresyon testi olarak eklenmiş ve geçiyor.

**Teslim çıktısı:**
- `FORBIDDEN_NOT_OWNER` (403) regresyon testi: başka kullanıcının cüzdanına/transferine erişim denemesi
- `FORBIDDEN_ROLE` (403) regresyon testi: `User` rolünün admin-only endpoint'e erişim denemesi
- `RATE_LIMIT_EXCEEDED` (429) regresyon testi: login (ve varsa henüz test edilmemiş diğer state-changing endpoint'ler) eşik aşımı
- `WALLET_ADDRESS_INVALID_FORMAT` (422) regresyon testi: geçersiz checksum/base58check adresiyle cüzdan ekleme/transfer denemesi

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (coverage gate CI'da aktif)
- [ ] Faz 1-6'daki ilgili endpoint'ler (auth, wallets, transfers, admin) çalışır durumda

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §7.2 — iterasyon kapsamı (roadmap'in açıkça saydığı 3 kategori: yetkisiz erişim, rate limit, adres formatı)
2. `docs/08_TESTING_STRATEGY.md` §4 — 12 senaryonun tam listesi, madde 5 (ownership), 6 (role), 10 (rate limit), 12 (adres formatı) bu iterasyonun kapsamı
3. `docs/03_API_CONTRACTS.md` — `FORBIDDEN_NOT_OWNER`, `FORBIDDEN_ROLE`, `RATE_LIMIT_EXCEEDED`, `WALLET_ADDRESS_INVALID_FORMAT` hata kodu tanımları ve hangi endpoint'lerde döndükleri
4. `docs/07_SECURITY_IMPLEMENTATION.md` §8 Rate Limiting — eşik değerleri ve endpoint grupları

**Uygulama planı:**
1. Faz 1-6 boyunca her endpoint için "en az bir deny testi" kuralı (`.claude/rules/04-quality-gates.md` — quality gate zaten her iterasyonda uygulanmış olmalı) gereği var olan testleri tara; hangi endpoint grubunda ownership/role/rate-limit/adres-format testi **eksik veya dağınık** kaldığını tespit et.
2. Ownership (`FORBIDDEN_NOT_OWNER`) regresyon testi: `GET /wallets/:id`, `GET /transfers/:id` gibi sahiplik kontrolü olan endpoint'lerde başka kullanıcının kaynağına erişim denemesinin merkezi bir integration test dosyasında toplanması.
3. Role guard (`FORBIDDEN_ROLE`) regresyon testi: `User` rolüyle tüm admin-only endpoint'lere (`docs/03` admin bölümü) erişim denemesinin tek bir parametrized test'te toplanması.
4. Rate limit (`RATE_LIMIT_EXCEEDED`) regresyon testi: login zaten Faz 1 §1.6'da test edilmiş olabilir — eksikse veya yalnızca login'e özgüyse, `docs/07` §8'in listelediği diğer state-changing endpoint gruplarından (register, transfer oluşturma/onaylama, admin mint) en az birine 429 testi ekle.
5. Adres formatı (`WALLET_ADDRESS_INVALID_FORMAT`) regresyon testi: `packages/chain-providers`'ın adres validasyon fonksiyonuna hem EVM (checksum) hem Tron (base58check) için geçersiz input unit testi + `POST /wallets/watch-only` integration testinde 422 kontrolü.
6. Tüm yeni testleri ilgili modülün co-location kuralına (`.claude/rules/04-quality-gates.md`) uygun yerleştir; test suite'i çalıştır.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Güncelle/Oluştur | İlgili controller/service `*.spec.ts` dosyaları (wallets, transfers, admin modülleri) — ownership/role deny testleri |
| Güncelle | `apps/api/src/auth/*.spec.ts` veya ilgili rate-limit test dosyası — eksik endpoint grubu için 429 testi |
| Güncelle | `packages/chain-providers/**/*.spec.ts` — adres format deny testi (EVM + Tron) |
| Dokunma | Cross-network, terminal state, step-up, watch-only'den transfer, yetersiz bakiye (Faz 5 §5.7), refresh replay (Faz 1 §1.4), mainnet allowlist (Faz 2 §2.5) — zaten kapsandı |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Başka kullanıcının kaynağına erişim | `docs/08` §4 madde 5 | `403 FORBIDDEN_NOT_OWNER`, `docs/03` ownership kontrollü her endpoint |
| `User` → admin-only endpoint | `docs/08` §4 madde 6 | `403 FORBIDDEN_ROLE`, `RolesGuard` regresyonu |
| Rate limit aşımı | `docs/08` §4 madde 10 | `429 RATE_LIMIT_EXCEEDED`, `docs/07` §8 eşik değerleriyle |
| Geçersiz adres formatı | `docs/08` §4 madde 12 | `422 WALLET_ADDRESS_INVALID_FORMAT`, EVM checksum + Tron base58check ayrı test |

**Kalite kapıları:**
- [ ] 4 kategorinin her biri için en az bir regresyon testi geçiyor
- [ ] Testler mevcut modülün co-location kuralına uygun yerleşmiş
- [ ] Lint + typecheck + tüm test suite yeşil
- [ ] İterasyon 1'de kurulan coverage gate hâlâ ≥%80 (yeni testler bu iki modülü etkiliyorsa)

**Bu iterasyonda yok:**
- `docs/08` §4'teki diğer 8 senaryo (önceki fazlarda zaten regresyon testine eklendi) — yeniden yazılmaz
- Pasif network/asset senaryosu (senaryo 2) — roadmap §7.2 metninde bu iterasyonun kapsamına açıkça alınmadı
- Yeni bir rate limit eşiği veya yeni bir korunan endpoint eklemek — bu iterasyon yalnızca mevcut davranışı test eder

**Risk / dikkat:**
- Rate limit testleri zamanlamaya duyarlıdır (429'a ulaşmak için art arda istek) — testin CI'da flaky olmaması için sabit bir sayaç/pencere mock'lanmalı, gerçek zaman beklenmemeli.
- Ownership/role testlerini tek tek endpoint'e dağıtmak yerine parametrized/tablo-driven yazmak, ileride yeni bir endpoint eklendiğinde regresyonun unutulma riskini azaltır.

**Stop:**
- [ ] `pnpm test -- --grep "deny|forbidden|rate limit|address format"` (veya eşdeğer filtre) 4 kategoride yeşil
- [ ] `pnpm turbo lint typecheck test build` yeşil
- [ ] PR/onay → İterasyon 3
