# Section Catalog — mimari-kararlar.md Standard Skeleton

The canonical 18-section skeleton. Every `mimari-kararlar.md` follows this order unless the project owner explicitly removes a section. Each section lists:

- **Amaç** — why the section exists / what drift it prevents
- **ID prefix** — the decision ID category
- **Çekirdek (core)** vs **Opsiyonel (optional)** — core sections should almost never be dropped; optional ones may be removed for simple projects on owner instruction
- **Elicitation cluster** — the grouped questions to ask
- **Decision mode** — `ONAY` (approval required) or `ACTION-FIRST` (propose-and-write)

When a section is removed on owner instruction, do NOT delete it silently. Replace its body with a single line:

`> ⚪ Bu bölüm proje sahibi talimatıyla kapsam dışı bırakıldı (gerekçe: ...).`

so downstream stages (project-doc-architect, rules-architect) see an explicit scope boundary instead of a gap.

---

## 1. Proje Kimliği ve Kapsam — `[P-NNN]`
- **Çekirdek.** Mode: **ONAY** for product model/scope; ACTION-FIRST for language default.
- Amaç: Ürün tanımı, ürün modeli (multi-tenant mi değil mi), platform stratejisi, hedef kullanıcı, değer önerisi, MVP kapsamı, monetizasyon, dil/yerelleştirme.
- Cluster: "Bu ne tür bir ürün? Tek müşteri mi çok kiracılı SaaS mı? MVP'de ne var, ne yok? Web/mobil? Dil?"
- Drift it prevents: Agent'in "bu bir SaaS olmalı" gibi temel yanlış varsayımlar üretmesi.

## 2. Kullanıcı Havuzu ve Ölçek — `[S-NNN]`
- **Çekirdek.** Mode: ONAY (ölçek kararları altyapıyı belirler).
- Amaç: Toplam kullanıcı, eşzamanlı kullanıcı, kullanım yoğunluğu, coğrafya/regülasyon, gerçek-zamanlılık ihtiyacı.
- Cluster: "Kaç kullanıcı? Kaç eşzamanlı? Hangi coğrafya / hangi veri koruma rejimi (KVKK/GDPR)? Bildirim gerçek zamanlı mı near-real-time mi?"
- Drift it prevents: Yanlış ölçeklenen altyapı seçimi, eksik regülasyon uyumu.

## 3. Kimlik Doğrulama ve Kullanıcı Yapısı — `[A-NNN]`
- **Çekirdek.** Mode: ONAY.
- Amaç: Superadmin modeli, kullanıcı attribute'ları, master data yönetimi, kimlik sağlayıcıları (OIDC/SSO/email-şifre), MFA durumu.
- Cluster: "Kullanıcı nasıl tanımlanır? Hangi attribute'lar tutulur? Master data ayrı tabloda mı? Giriş yöntemi? MFA MVP'de var mı?"
- Drift it prevents: Serbest-text vs FK master data karışıklığı, kimlik akışı belirsizliği.

## 4. Yetkilendirme Mimarisi — `[AUTH-NNN]`
- **Çekirdek.** Mode: ONAY (en hassas bölümlerden).
- Amaç: RBAC/ABAC modeli, yetki çözümleme stratejisi (runtime vs snapshot), cache + invalidation, koşul setleri (AND/OR), guard/decorator mekanizması.
- Cluster: "Yetki nasıl çözümlenir? Rol bazlı mı attribute bazlı mı hibrit mi? Cache TTL ve invalidation? Yetki kontrolü nerede zorlanır?"
- Drift it prevents: Agent'in yetki kontrolünü atlaması veya yanlış katmana koyması.

## 5. Roller ve Yetki Yönetimi — `[R-NNN]`
- **Çekirdek.** Mode: ONAY.
- Amaç: Sistem rolleri, rol atama modeli, yetki kataloğu, rol-yetki ilişkisi yönetim ekranı.
- Cluster: "Hangi sistem rolleri var? Roller nasıl atanır (direct + attribute-based)? Yetkiler enum/constant olarak nerede tutulur?"

## 6. Süreç (Workflow) Mimarisi — `[W-NNN]`
- **Çekirdek (workflow ürünlerinde).** Opsiyonel (CRUD-only ürünlerde). Mode: ONAY.
- Amaç: Süreç tanımı (hard-coded vs configurable), state machine, adım/atama/SLA/red akışları.
- Cluster: "Süreçler kodda mı tanımlı yoksa kullanıcı tanımlı mı? State machine katmanları? SLA, reddetme, claim modları?"
- Drift it prevents: State machine boşlukları; SLA/iş mantığının yanlış katmana yerleşmesi.
- NOTE: State machine kararlarını **4 katmanlı** açıkla: (1) Anlamı/iş dilinde ne demek, (2) Backend nasıl zorlar, (3) Data modeli nasıl tutar, (4) UI nasıl gösterir.

## 7. Görev Yönetimi — `[T-NNN]`
- **Çekirdek (workflow ürünlerinde).** Opsiyonel. Mode: ONAY/ACTION-FIRST karışık.
- Amaç: Görev modeli, atama, durum geçişleri, görev-süreç ilişkisi, merkezi görev altyapısı.

## 8. Doküman Yönetimi — `[D-NNN]`
- **Çekirdek (dosya yükleme olan ürünlerde).** Opsiyonel. Mode: ONAY (güvenlik kritik).
- Amaç: Depolama, meta-veri modeli, erişim güvenliği (signed URL/cookie, CDN, WAF), virüs tarama, önizleme, upload/download audit.
- Drift it prevents: Public bucket sızıntısı; eksik erişim katmanları.

## 9. Admin Panelleri — `[AP-NNN]`
- **Çekirdek.** Mode: ONAY/ACTION-FIRST karışık.
- Amaç: Admin ekranları, hangi rol neyi görür, master data yönetim ekranı, sistem ayarları, audit log ekranı.

## 10. Güvenlik ve KVKK — `[SEC-NNN]`
- **Çekirdek.** Mode: **ONAY (istisnasız).**
- Amaç: Threat model, zero-trust, veri sınıflandırma, şifreleme (envelope/field-level), şifre politikası, JWT/session, HTTP güvenlik başlıkları (HSTS/CSP/CORS/CSRF), input validation, secrets yönetimi, KVKK/GDPR veri hakları, veri ikametgâhı, audit tamper-evidence, veri saklama, dependency/SAST/DAST, alarm/incident response, CI/CD güvenliği.
- NOTE: Bu bölüm büyür (referans projede 72 karar). Tek oturumda kapatmaya çalışma; alt-kümelere böl ama her alt-küme ONAY ister. Güvenlik seviyesini baştan netleştir (örn. "bankacılık seviyesi = OWASP ASVS L2 + KVKK + ISO 27001").
- Downstream: bu bölümün özeti `.claude/rules/03-security-baseline.md` olur — 6 maddelik executable checklist'e distile edilebilecek netlikte yaz.

## 11. Denetim (Audit Log) — `[AUD-NNN]`
- **Çekirdek.** Mode: ONAY.
- Amaç: Hangi olaylar loglanır, audit şeması (alan tablosu), tamper-evidence (chain hash), PII şifreleme, kim görür, retention.

## 12. Entegrasyonlar — `[I-NNN]`
- **Çekirdek (entegrasyon olan ürünlerde).** Opsiyonel. Mode: ONAY.
- Amaç: Harici sistemler, senkron modeli (nightly worker/idempotency/delta), mock/sidecar stratejisi.

## 13. Bildirim Sistemi — `[N-NNN]`
- **Çekirdek (bildirim olan ürünlerde).** Opsiyonel. Mode: ONAY/ACTION-FIRST karışık.
- Amaç: Kanallar (in-app/email/SMS), zorunlu mu opt-out mu, tetikleyici olay tablosu, event-driven mimari (emitter → queue → dispatcher), şablon yönetimi, retention.

## 14. Tech Stack — `[TS-NNN]`
- **Çekirdek.** Mode: ONAY (her seçim trade-off'la sunulur).
- Amaç: Frontend, backend, dil, monorepo, ORM, DB, validation, auth lib, UI kit, state yönetimi, API stili. Her seçim gerekçeli.
- Downstream: bu bölüm `.claude/rules/00-project-identity.md` içindeki pin'li stack listesinin kaynağıdır — versiyon pin'lerini burada netleştir.

## 15. Altyapı ve Operasyon — `[INF-NNN]`
- **Çekirdek.** Mode: ONAY.
- Amaç: Cloud/region, cache, CI/CD, monitoring, log stratejisi + retention, secret yönetimi, deployment platformu, backup/PITR, environment izolasyonu.

## 16. Test Stratejisi — `[TEST-NNN]`
- **Çekirdek.** Mode: ONAY/ACTION-FIRST karışık.
- Amaç: Test piramidi, coverage hedefleri (tablo), agent test akışı (**onaysız merge yasağı**), seed stratejisi (staging vs prod).
- NOTE: "Agent kullanıcı onayı olmadan main'e merge etmez" kuralını her projede koy.
- Downstream: coverage eşikleri `.claude/rules/04-quality-gates.md`'e taşınır — sayısal ve ölçülebilir yaz.

## 17. Kod Organizasyonu ve Agent Kuralları — `[CODE-NNN]`
- **Çekirdek.** Mode: ACTION-FIRST (konvansiyonlar) + ONAY (agent yasakları).
- Amaç: Klasör yapısı, modül içi yapı, naming conventions, commit standardı (Conventional Commits), "Agent'ın yapmaması gerekenler" listesi, her-feature kontrol listesi.
- NOTE: Bu bölüm `.claude/rules/01-coding-philosophy.md` ve `02-language-naming.md`'in doğrudan kaynağıdır; mümkün olduğunca somut ve madde-madde yaz.

## 18. Açık Kararlar — Tamamlanması Gerekenler — `[*-OPEN-N]`
- **Çekirdek (zorunlu — asla çıkarılmaz).** Mode: otomatik.
- Amaç: Henüz alınmamış kararların öncelik etiketli (🔴/🟠/🟢) listesi. "Bu kararlar kapanmadan ilgili kod yazılmaz" disiplini. Karar kapandıkça buradan silinip versiyon geçmişine işlenir.
- This is the integrity backbone. Bir kararı veremezsen UYDURMA — buraya `[KATEGORI-OPEN-N]` olarak yaz.
- Resume'da ilk okunan iki yerden biri (diğeri versiyon geçmişi).
