### İterasyon 6 — Güvenlik Checklist Doğrulaması (§7.6)

**Hedef:** `docs/07_SECURITY_IMPLEMENTATION.md` §13'teki 6 maddelik güvenlik checklist'inin tamamı kod tabanında somut kanıtla (dosya+satır veya geçen test) doğrulanmış; eksik çıkan her madde düzeltilmiş. Yeni bir araç/script yazılmaz — kalıcı kalite kapısı zaten `.claude/rules/03-security-baseline.md`'dir, bu iterasyon onu "ilk kez tam karşılandı" durumuna getirir.

**Teslim çıktısı:**
- 6 maddenin her biri için kanıt tablosu (madde → dosya/test → durum) — PR açıklamasında
- Eksik çıkan maddelerde düzeltme commit'leri

**Önkoşullar:**
- [ ] İterasyon 5 Stop tamam (tüm ekranlar ve testler bu noktada tam)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §7.6 — iterasyon kapsamı ve "kalıcı kalite kapısı" notu
2. `docs/07_SECURITY_IMPLEMENTATION.md` §13 Güvenlik Checklist Özeti — 6 madde (bu madde `.claude/rules/03-security-baseline.md` ile birebir aynıdır, zaten context'te yüklü)
3. `docs/mimari-kararlar.md` SEC-001..012 — checklist'in kaynak kararları, gerekçe için

**Uygulama planı:**
1. **Madde 1 (private key sızıntısı yok):** `EnvelopeEncryptionService`, signing worker, tüm API response DTO'ları ve log çağrılarında `encrypted_dek`/decrypt edilmiş key'in geçmediğini grep + kod incelemesiyle doğrula (`MASTER_ENCRYPTION_KEY`, `privateKey`, `decryptedKey` gibi terimler için proje geneli arama); Faz 4 §4.2'nin testi zaten bunu kanıtlıyorsa referans ver, eksikse test ekle.
2. **Madde 2 (access token yalnızca bellekte):** Frontend `AuthContext`'in `localStorage`/`sessionStorage` kullanmadığını, refresh cookie'nin `httpOnly`/`secure`/`SameSite=Strict` olduğunu (Faz 1 §1.3) kod incelemesiyle doğrula; `COOKIE_SECURE=false` yalnızca lokal `.env`'de override edilebildiğini teyit et (`.claude/rules/03-security-baseline.md`).
3. **Madde 3 (step-up auth):** `TransferStateMachine`'in `draft → pending_signature` geçişinin `AUTH_STEP_UP_REQUIRED` guard'ından geçmeden çalışamadığını (Faz 5 §5.2) test referansıyla doğrula.
4. **Madde 4 (cross-network guard backend'de):** Cross-network guard'ın frontend'den bağımsız çalıştığını — frontend kontrolü bypass edilse bile backend'in reddettiğini (Faz 5 §5.2, §5.7 negatif testi) doğrula.
5. **Madde 5 (rate limit + login brute-force):** Her state-changing endpoint'in bir rate limit eşiğine sahip olduğunu (İterasyon 2'nin genişlettiği kapsamla birlikte) ve login'in `IP + email` bileşik anahtarı kullandığını (Faz 1 §1.6) doğrula.
6. **Madde 6 (mainnet allowlist):** `IChainProvider` başlatma noktalarının tümünün (`EvmProvider`, `TronProvider`) `CHAIN_ID_ALLOWLIST` kontrolünden geçtiğini, allowlist'in hiçbir yerde mainnet chain ID içermediğini (Faz 2 §2.5 testi) doğrula.
7. Her maddede eksik/zayıf kanıt bulunursa (ör. bir kod yolunda kontrolün atlandığı, testin gevşek olduğu) düzelt ve regresyon testi ekle.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Güncelle | Denetimde eksik bulunan servis/guard dosyaları — kapsam denetim sonucuna göre belirlenir |
| Dokunma | `.claude/rules/03-security-baseline.md` — değiştirilmez, bu iterasyonun ölçütü değil çıktısıdır |
| Dokunma | Yeni bir otomatik denetim script'i/aracı — bu iterasyonda oluşturulmaz |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Private key sızıntısı yok | `docs/07` §13 madde 1 | Log/response/cache grep + Faz 4 §4.2 testi |
| Access token yalnızca bellekte | `docs/07` §13 madde 2 | `AuthContext` kod incelemesi + cookie flag kontrolü |
| Step-up auth zorunlu | `docs/07` §13 madde 3 | Faz 5 §5.2 guard + testi |
| Cross-network guard backend'de | `docs/07` §13 madde 4 | Faz 5 §5.2/§5.7 negatif testi |
| Rate limit her state-changing endpoint'te | `docs/07` §13 madde 5 | İterasyon 2 genişletmesi + Faz 1 §1.6 |
| Mainnet allowlist | `docs/07` §13 madde 6 | Faz 2 §2.5 testi, tüm `IChainProvider` başlatma noktaları |

**Kalite kapıları:**
- [ ] 6 maddenin tamamı için kanıt tablosu dolu (dosya/test referansı ile)
- [ ] Eksik çıkan her madde düzeltilmiş ve regresyon testiyle kapatılmış
- [ ] Lint + typecheck + test + build yeşil
- [ ] İterasyon 1'in coverage gate'i hâlâ ≥%80

**Bu iterasyonda yok:**
- Yeni bir otomatik güvenlik tarama aracı (SAST) veya checklist-doğrulama script'i yazmak — `mimari-kararlar.md` SEC-OPEN-7, MVP dışı
- Checklist'in kendisini değiştirmek/genişletmek — `.claude/rules/03-security-baseline.md` ve `docs/07` §13 sabit kalır, bu iterasyon yalnızca doğrular
- Yeni bir güvenlik kontrolü icat etmek — 6 madde dışına çıkılmaz

**Risk / dikkat:**
- Bu iterasyon projenin son güvenlik geçişi olduğundan, "test geçti" ile yetinmeyip kod incelemesiyle (grep + manuel okuma) doğrulamak önemlidir — bir testin var olması, o testin gerçekten ilgili kod yolunu kapsadığı anlamına gelmeyebilir.
- Madde 1 (private key) özellikle dikkat gerektirir: yalnızca doğrudan log çağrılarını değil, hata nesnelerinin (`error.message`, stack trace) yanlışlıkla decrypt edilmiş değeri taşıyıp taşımadığını da kontrol et.

**Stop:**
- [ ] Kanıt tablosu 6/6 madde "doğrulandı" durumunda
- [ ] `pnpm turbo lint typecheck test build` yeşil
- [ ] `docs/10_IMPLEMENTATION_ROADMAP.md` §7 Başarı Metrikleri (10 kriter) kullanıcıya özetlenir; Faz 7 Done Definition; roadmap işareti — bu, projenin MVP tamamlanma noktasıdır, sonraki faz yoktur
