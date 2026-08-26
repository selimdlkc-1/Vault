# Docs Güncelleme Haritası — Phase Creator

Faz onayından sonra `Docs/` güncellemelerinde **tek doğruluk kaynağı** bu haritadır. `Docs/10_IMPLEMENTATION_ROADMAP.md` doküman yaşam döngüsü bölümü ile uyumlu.

**Altın kural:** Kod/spec çelişkisi → önce `Docs/` güncelle, sonra faz skill'ini yaz. Spec `Docs/` içinde kalır; faz skill'inin iterasyonları **plan-modu kalitesinde uygulama adımları** + `Docs/<dosya>.md` §pointer taşır (bkz. `iteration-blueprint.md`).

---

## Çekirdek dokümanlar (numaralı)

| Dosya | Ne zaman güncelle | Tipik içerik |
| ----- | ----------------- | ------------ |
| `Docs/00_PROJECT_OVERVIEW.md` | MVP kapsamı / non-goal değişimi (nadir) | In-scope / out-of-scope madde |
| `Docs/01_DOMAIN_MODEL.md` | Yeni entity, state machine, domain terim | Entity diyagramı, geçiş tablosu |
| `Docs/02_DATABASE_SCHEMA.md` | Tablo/kolon/index/enum/migration | ORM + migration karşılığı, constraint |
| `Docs/03_API_CONTRACTS.md` | Yeni/değişen endpoint | Request/response, error code |
| `Docs/04_BACKEND_SPEC.md` | Yeni servis pattern, middleware, modül yapısı | Modül konvansiyonu |
| `Docs/05_FRONTEND_SPEC.md` | Route ağacı, global FE pattern, lib | Route, state stratejisi |
| `Docs/06_SCREEN_CATALOG.md` | Yeni ekran veya kritik UX değişikliği | `S-*` ID, permission, state'ler |
| `Docs/07_SECURITY_IMPLEMENTATION.md` | Auth, encryption, rate limit, yeni control | Bölüm + threat model notu |
| `Docs/08_TESTING_STRATEGY.md` | Yeni test türü, coverage hedefi, E2E journey | Journey adı, risk seviyesi |
| `Docs/09_DEV_WORKFLOW.md` | CI/CD, release, branch, agent kuralları | Süreç değişikliği |
| `Docs/10_IMPLEMENTATION_ROADMAP.md` | **Her yeni/güncellenen faz** | Faz başlığı, §N.M alt maddeleri, durum |

Repo `docs/` (küçük harf) kullanıyorsa tüm referansları ona göre yaz — `Glob` ile doğrula, mevcut yazımı değiştirme.

---

## Faz tipine göre minimum doküman seti

Aşağıdaki satırlar **minimum**; faz kapsamına göre ek satır ekle. Güncellenmeyen dosyaları taslakta **"Dokunulmaz"** olarak listele.

| Faz tipi | Zorunlu docs | Sık eklenen |
| -------- | ------------ | ----------- |
| **DB / schema** | 02, 01 (entity), 10 | 03 (DTO alanları) |
| **Backend API** | 03, 02, 04, 07, 10 | 01, 08 (integration test) |
| **Frontend ekran** | 06, 05, 03 (read contract), 10 | 07 (XSS/CSP notu) |
| **Full-stack feature** | 01, 02, 03, 05, 06, 10 | 04, 07, 08 |
| **Yetki / RBAC** | 01, 03, 04, 06, 07, 10 | 02 (permission tablosu varsa) |
| **UI / design system** | 05, 06 (etkilenen), 10 | `docs/design-system/*`, ADR |
| **Infra / IaC** | 10, 09 | ADR `docs/adr/` |
| **Worker / cron** | 03, 04, 10 | 02, 08 |
| **Süreç tipi** | `docs/processes/<slug>.md`, 01, 02, 03, 05, 06, 10 | ADR |
| **Güvenlik sertleştirme** | 07, 08, 10 | 03, 09 |
| **Performans** | 08, 10, 04 | 02 (index) |

---

## Yardımcı / özel dosyalar

| Dosya | Ne zaman |
| ----- | -------- |
| `docs/adr/00NN-<slug>.md` | Mimari karar, stack sapması, güvenlik modeli değişimi (`write-adr` skill'i) |
| `docs/mimari-kararlar.md` | Üst düzey karar özeti (ADR ile çapraz) |
| `docs/processes/<slug>.md` | Yeni iş süreci tipi |
| `docs/templates/*` | Şablon değişmez; süreç için kopya → `processes/` |
| `docs/GAP_analysis.md` | Bilinçli spec–kod boşluğu kapatılıyorsa |
| `docs/design-system/*` | UI token/bileşen değişimi |

ADR numarası: mevcut `docs/adr/*.md` listesinden sonraki sıra.

---

## Güncelleme disiplini

1. **Önce oku:** İlgili dosyada mevcut bölümü `Grep` ile bul; aynı yapıda ekle (kopyala-yapıştır kalıbı).
2. **Screen Catalog:** `S-<DOMAIN>-<ACTION>` ID'si mevcut dosyada var mı kontrol et; yoksa tam bölüm ekle (route, permission, form, state'ler, TR mesajlar).
3. **API Contracts:** Endpoint başına request/response envelope + error code listesi.
4. **Roadmap:** `## Faz Detayları` altında `### Faz N — …` + **§N.1…N.K** alt maddeleri; her alt madde bir iterasyonun `Hedef` + `Docs/10` referansına karşılık gelir.
5. **Tutarlılık:** Aynı terim tüm dosyalarda aynı (enum, permission, ekran ID, route path).
6. **Özet çıktı:** Güncelleme bitince kullanıcıya tablo: dosya → değişen bölüm (1 satır).

---

## Docs vs faz skill — içerik ayrımı

**Yalnızca `Docs/` içinde (kopyalanmaz):**

- Tam API request/response örnekleri → `Docs/03_API_CONTRACTS`
- Ekran alan listesi ve UX state → `Docs/06_SCREEN_CATALOG`
- Tablo/kolon tanımı → `Docs/02_DATABASE_SCHEMA`
- Entity lifecycle → `Docs/01_DOMAIN_MODEL`

**Faz skill'i iterasyonunda kalır** (bkz. `iteration-blueprint.md`):

- Uygulama planı (plan-modu adımları)
- Docs okuma sırası (`Docs/X.md` §Y — neden)
- Spec → kod eşlemesi (pointer + uygulama notu, spec metni değil)
- Dosya kapsamı tablosu (≤12 satır)
- Kalite kapıları, Risk, Stop komutları

**Faz skill üst seviyesi:** Goal, Feature branch, çalışma modeli, iterasyon indeksi, Required Context, Done Definition, Explicit Don'ts.

**Hiçbirinde tekrarlanmaz:** `.claude/rules/` içindeki convention, güvenlik checklist ve kalite eşikleri — bunlar zaten context'te; dosya adıyla referans ver.
