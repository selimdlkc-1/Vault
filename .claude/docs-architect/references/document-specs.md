# Document Specs — 11 Doküman Şartnamesi

Faz B'de **o dokümanın** bölümünü oku, hepsini değil. Her spec şunları verir: zorunlu bölümler, zorunlu diagram, downstream tüketici, ve o dokümana **girmeyecek** içerik.

**Downstream sözleşmesi:** `rules-architect` ve `phase-creator` bu dokümanlara `Docs/NN §M` biçiminde referans veriyor. Ana başlıkları numarala (`## 3. Error Taxonomy`) ve yeniden üretimde numaraları keyfi değiştirme.

---

## 00_PROJECT_OVERVIEW.md — 2–4 sayfa

**Zorunlu bölümler**
1. Ürün tanımı ve değer önerisi
2. Ürün modeli (tek müşteri / multi-tenant SaaS / internal tool) ve platform stratejisi
3. Hedef kullanıcı profilleri ve rolleri (üst düzey; detay 05/06'da)
4. MVP kapsamı — **in-scope** ve **out-of-scope** madde madde
5. Başarı kriterleri / KPI
6. Kısıtlar (bütçe, süre, regülasyon, mevcut sistemler)
7. Dil ve yerelleştirme politikası

**Diagram:** yok (gerekirse tek bir bağlam diyagramı)
**Downstream:** `.claude/rules/00-project-identity.md` (MVP in/out + kimlik özeti)
**Girmez:** Teknik stack detayı (14 → 04/05'e), tam KPI ölçüm metodolojisi

---

## 01_DOMAIN_MODEL.md — 8–15 sayfa

**Zorunlu bölümler**
1. Domain sözlüğü — her terimin Türkçe + İngilizce formu, tek cümlelik tanım
2. Entity kataloğu — her entity: sorumluluk, sahiplik, yaşam döngüsü özeti
3. Entity ilişkileri (kardinalite, zorunluluk, cascade davranışı)
4. İş kuralları — entity başına invariant'lar ("bir süreç örneği kapalıyken görev eklenemez")
5. State machine'ler — her durum, geçiş, tetikleyici, izin verilen aktör
6. Hesaplanan/türetilmiş alanlar ve kaynakları

**Diagram (zorunlu):** entity ilişki diyagramı (Mermaid `erDiagram` veya `classDiagram`); her state machine için `stateDiagram-v2`
**Downstream:** `.claude/rules/00` domain terimleri; `10–13` glob kuralları; `phase-creator` domain fazları
**Girmez:** Kolon tipleri, index'ler (02'ye), endpoint'ler (03'e)

**State machine yazım kuralı:** her geçişi 4 katmanda tanımla — anlamı / backend nasıl zorlar / data nasıl tutar / UI nasıl gösterir.

---

## 02_DATABASE_SCHEMA.md — 15–30 sayfa

**Zorunlu bölümler**
1. Şema genel bakış ve isimlendirme konvansiyonu (tablo/kolon/index/FK adlandırma)
2. Tablo tanımları — her tablo: kolon, tip, null, default, constraint, açıklama
3. Enum ve lookup tabloları
4. Index stratejisi — hangi index, hangi sorgu için
5. İlişkiler ve referans bütünlüğü (ON DELETE/UPDATE davranışı)
6. Şifrelenmiş / maskelenen alanlar ve nasıl saklandıkları
7. Audit ve soft-delete kolonları
8. Migration stratejisi — dosya adlandırma, geri alma politikası, veri migration kuralları
9. Seed verisi — hangi ortamda ne

**Diagram (zorunlu):** ERD
**Downstream:** `.claude/rules/15-database.md`; `add-*-migration` skill'i; DB fazları
**Girmez:** ORM kod örnekleri (04'e), API alan adları (03'e)

---

## 03_API_CONTRACTS.md — 30–80 sayfa

**Zorunlu bölümler**
1. Genel sözleşme — base path, versiyonlama, content type, pagination modeli
2. Response envelope — başarı ve hata biçimi, örnek payload
3. Error taxonomy — error code listesi, HTTP status eşlemesi, mesaj politikası
4. Auth başlıkları / cookie sözleşmesi
5. Endpoint kataloğu — domain domain gruplanmış; her endpoint: method, path, yetki, request şeması, response şeması, hata kodları, audit event
6. Rate limit ve kota kuralları
7. Idempotency ve retry semantiği (varsa)
8. Webhook / callback sözleşmeleri (varsa)
9. SLA ve performans hedefleri

**Diagram:** yok (auth akışı 07'de)
**Downstream:** `.claude/rules/14-controllers.md`; `add-new-endpoint` skill'i; API fazları
**Girmez:** Servis içi iş mantığı (04'e), ekran davranışı (06'ya)

**Uzunluk uyarısı:** Bu doküman iskelet + bölüm bölüm `Edit` ile yazılır. Endpoint grubu başına bir `Edit`.

---

## 04_BACKEND_SPEC.md — 10–20 sayfa

**Zorunlu bölümler**
1. Katman mimarisi (controller → service → repository sınırları; ne nerede yapılmaz)
2. Klasör ve modül yapısı — dosya ağacı (≤25 satır) + modül içi standart dosyalar
3. Dependency injection ve modül kayıt kalıbı
4. Middleware zinciri — sıra ve sorumluluk
5. Validation kalıbı — şema nerede tanımlanır, nerede uygulanır
6. Exception handling — domain exception hiyerarşisi, error code'a çevrim
7. Transaction yönetimi ve audit yazımı
8. Background job / worker kalıbı
9. Logging — seviye, format, hassas alan maskeleme
10. Konfigürasyon ve env değişkenleri tablosu

**Diagram:** istek yaşam döngüsü (opsiyonel `flowchart`)
**Downstream:** `.claude/rules/10-backend-architecture.md`; refactor skill'i
**Girmez:** Endpoint listesi (03'e), tablo tanımı (02'ye)

---

## 05_FRONTEND_SPEC.md — 8–15 sayfa

**Zorunlu bölümler**
1. Uygulama yapısı ve klasör organizasyonu
2. Routing konvansiyonu — route adlandırma, korumalı route mekanizması, layout hiyerarşisi
3. State yönetimi stratejisi — server state vs client state sınırı
4. Veri çekme kalıbı — cache, invalidation, loading/error state standardı
5. Form kalıbı — validation, hata gösterimi, submit/disable davranışı
6. Bileşen katmanları (primitive / composite / feature) ve yeniden kullanım kuralı
7. Tasarım token'ları ve stil kuralları
8. Erişilebilirlik (a11y) minimumları
9. Performans hedefleri (Web Vitals) ve bundle bütçesi
10. i18n ve metin yönetimi

**Diagram:** route ağacı (opsiyonel)
**Downstream:** `.claude/rules/20-frontend-architecture.md`, `22-forms`, `23-queries`, `25-a11y`
**Girmez:** Ekran ekran alan listesi (06'ya), API sözleşmesi (03'e)

---

## 06_SCREEN_CATALOG.md — 30–80 sayfa

**Zorunlu bölümler**
1. Ekran haritası ve navigasyon
2. Layout tanımları
3. Ekran ID konvansiyonu — `S-<DOMAIN>-<ACTION>`
4. Kritik ekranlar — tam şablon
5. İkincil ekranlar — kısa şablon
6. Ortak bileşenler ve boş/hata/yükleniyor durumları

**Kritik ekran şablonu:** Ekran ID · route · layout · erişim yetkisi · amaç · alan listesi (etiket, tip, zorunluluk, validation) · aksiyonlar ve sonuçları · UX state'leri (boş, yükleniyor, hata, yetkisiz, başarı) · kullanılan endpoint'ler · TR mesaj metinleri

**İkincil ekran şablonu:** Ekran ID · route · yetki · amaç · ana aksiyonlar · endpoint'ler

**Diagram (zorunlu):** ekran akış haritası (`flowchart`)
**Downstream:** `add-new-screen` skill'i; FE fazları; `phase-controller` D4 boyutu
**Girmez:** Bileşen implementasyon detayı (05'e)

**Üretim:** grup grup. Tek hamlede yazılmaz.

---

## 07_SECURITY_IMPLEMENTATION.md — 15–25 sayfa

**Zorunlu bölümler**
1. Güvenlik hedef seviyesi (örn. OWASP ASVS L2 + KVKK) ve threat model özeti
2. Kimlik doğrulama akışı — login, refresh, logout, session sonlanması
3. Token/session yönetimi — süre, saklama yeri, rotation, invalidation
4. Yetkilendirme uygulaması — kontrol nerede zorlanır, katmanlar, deny davranışı
5. Veri sınıflandırma ve şifreleme — hangi alan nasıl
6. Input validation ve dosya yükleme güvenliği
7. HTTP güvenlik başlıkları — CORS, CSP, HSTS, CSRF
8. Rate limiting ve brute-force koruması
9. Secrets yönetimi
10. Audit log — hangi olay, hangi alanlar, tamper-evidence, kim görür
11. KVKK/GDPR veri hakları ve saklama süreleri
12. Incident response ve alarm eşikleri

**Diagram (zorunlu):** auth `sequenceDiagram`
**Downstream:** `.claude/rules/03-security-baseline.md` (6 maddelik checklist'e distile), `11-auth`; `phase-controller` D6
**Girmez:** Endpoint listesi (03'e)

**Kritik:** 6 maddelik executable checklist'e distile edilebilecek netlikte yaz — downstream rule bunu her oturumda taşıyacak.

---

## 08_TESTING_STRATEGY.md — 5–10 sayfa

**Zorunlu bölümler**
1. Test piramidi ve her katmanın sorumluluğu
2. Coverage hedefleri — modül bazlı tablo, sayısal
3. Kritik modül tanımı (daha yüksek eşik gerektirenler)
4. Zorunlu negatif/deny senaryoları
5. Test verisi ve factory/fixture stratejisi
6. E2E journey listesi ve risk seviyeleri
7. CI gate — hangi kontrol merge'ü bloklar
8. Test adlandırma ve dosya yerleşimi

**Diagram:** yok
**Downstream:** `.claude/rules/04-quality-gates.md`, `35-testing.md`; `fix-failing-test` skill'i; `phase-controller` D9
**Girmez:** Test dosyası envanteri

---

## 09_DEV_WORKFLOW.md — 5–10 sayfa

**Zorunlu bölümler**
1. Branch stratejisi ve adlandırma
2. Commit standardı (Conventional Commits tipleri ve kapsam adları)
3. PR süreci ve zorunlu kontroller
4. **Agent kuralları — onaysız merge yasağı**
5. Ortamlar (local/staging/prod) ve izolasyon
6. Local kurulum adımları
7. Env değişkenleri ve secret temini
8. Release ve rollback prosedürü

**Diagram:** yok
**Downstream:** `.claude/rules/01-coding-philosophy.md`, `02-language-naming.md`, `04-quality-gates.md`; `git-phase-branch` skill'i
**Girmez:** CI yaml içeriği

---

## 10_IMPLEMENTATION_ROADMAP.md — 20–60 sayfa

**Zorunlu bölümler**
1. Çalışma modeli — faz/iterasyon disiplini, 1 chat ≈ 1 PR
2. Faz listesi ve bağımlılık sırası
3. **Faz detayları** — her faz: `### Faz N — <Başlık>` + `§N.1 … §N.K` alt maddeleri; her alt madde tek bir iterasyonun teslimine karşılık gelir
4. Human gate noktaları — neyin insan onayı gerektirdiği
5. Risk kaydı — bilinen riskler ve azaltım
6. Teknik borç kaydı (bilinçli ertelemeler)
7. Başarı metrikleri
8. Doküman yaşam döngüsü — spec değişince önce docs, sonra kural/faz güncellenir

**Diagram:** faz bağımlılık `flowchart` (opsiyonel)
**Downstream:** `phase-creator` — faz skill'leri doğrudan §N.M numaralarına hizalanır. **Bu doküman olmadan `phase-creator` çalışamaz.**
**Girmez:** Faz içi kod detayı, dosya listesi

**En kritik yapı kuralı:** §N.M alt madde numaralandırması. `phase-creator` her iterasyonu bir §N.M'ye bağlıyor; numaralandırma yoksa faz üretimi bağlantısız kalır.

---

## Üretim sırası notu

00 → 10 sırası bağlayıcı: her doküman kendinden öncekilerin netleştirdiği terimleri kullanır. Özellikle 01 (domain sözlüğü) ve 02 (şema) sonrasında 03'ün alan adları tutarlı olur. Sırayı bozarsan terminoloji kayması kaçınılmaz.
