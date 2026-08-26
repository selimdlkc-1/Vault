# Rules Architect — Referans

## docs/ → talimat eşleme haritası

Spec **yalnızca** soldaki dosyada kalır.

| docs/ dosyası | Hedef | Kalması gereken | OLMAMASI gereken |
| ------------- | ----- | --------------- | ---------------- |
| `00_PROJECT_OVERVIEW` | rule 00 | MVP in/out, kullanıcı profili özeti | Tam KPI tablosu |
| `01_DOMAIN_MODEL` | rule 00 terimler; 10–13 | Entity adları, state machine **adı** | Geçiş tablosunun tamamı |
| `02_DATABASE_SCHEMA` | rule 15 | Prisma convention, migration disiplini | Kolon listesi |
| `03_API_CONTRACTS` | rule 14; `add-new-endpoint` | Response envelope pattern | Request/response örnekleri |
| `04_BACKEND_SPEC` | rule 10 | Modül klasör yapısı, DI | Servis listesi |
| `05_FRONTEND_SPEC` | rule 20 | Route convention, state stratejisi | Tam route ağacı |
| `06_SCREEN_CATALOG` | `add-new-screen` | Ekran ID formatı (`S-*`) | Alan listesi, UX state tablosu |
| `07_SECURITY_IMPLEMENTATION` | rule 03; rule 11 | 6'lı checklist özeti | Threat model detayı |
| `08_TESTING_STRATEGY` | rule 04; rule 35 | Coverage eşikleri, piramit | Test dosya envanteri |
| `09_DEV_WORKFLOW` | rule 01, 02, 04 | Commit format, PR gate | CI yaml |
| `10_IMPLEMENTATION_ROADMAP` | phase skills | — (phase-creator üretir) | Faz kod detayı |
| `docs/adr/*` | `write-adr`; rule 00 | ADR numarası + 1 cümle karar | Tam MADR metni |

**Altın kural:** Talimat ile `docs/` çelişirse → **docs kazanır**; talimat güncellenir.

---

## Distilasyon kuralları

1. **Checklist > açıklama:** Güvenlik, done definition, stop maddeleri checkbox.
2. **1 iyi / 1 kötü örnek:** Kod pattern'lerinde yeterli; 5 örnek yasak.
3. **Footer referans:** Her dosya sonunda `Detay: docs/XX …` (1–3 path).
4. **Tablo sınırı:** Talimat içi tablo ≤8 satır; uzunsa docs'a.
5. **File tree sınırı:** ≤12 satır; uzunsa "bkz. docs/04 Bölüm X".
6. **Tekrar yasağı:** 6 güvenlik maddesi yalnızca rule 03'te; diğerleri "03'e uy" der.
7. **Doğrulanabilirlik:** Her madde kontrol edilebilir olmalı. "2 space indent" ✓ / "temiz kod" ✗.

---

## Koşulsuz rule iskeleti (00)

Frontmatter **yok**.

```markdown
# <Proje> — Proje Kimliği

<1 paragraf kimlik>

## Tech Stack (Pin'li)

- …

Yeni framework/library → ADR gerekir.

## Monorepo Yapısı

<≤12 satır ağaç>

## Domain Terminolojisi

| Terim | Anlam |

## MVP Kapsamı Dışı

- …

---
Detay: `docs/00_PROJECT_OVERVIEW.md`
```

---

## Path-scoped rule iskeleti (14)

Frontmatter'da **yalnızca `paths`**.

~~~markdown
---
paths:
  - "apps/api/**/*.controller.ts"
---

# Backend Controllers

<2 cümle context>

## <Pattern adı>

```typescript
// ✓ Doğru
// ✗ Yanlış
```

## Anti-pattern'ler

- …

---
Detay: `docs/04_BACKEND_SPEC.md` Bölüm X; `docs/03_API_CONTRACTS.md` Bölüm Y
~~~

---

## How-to skill iskeleti

~~~markdown
---
name: add-new-endpoint
description: Step-by-step procedure for <görev> — <kapsanan adımlar>. Use when <tetikleyici cümleler>. Do NOT use for <dışlanan durumlar>.
---

# <Görev> Prosedürü

<N> adım. Her adım bir concern — atlama CI/review maliyeti.

## 1. …

`apps/api/src/...`

```typescript
<minimal snippet>
```

## N. Dokümantasyon

- [ ] `docs/03_API_CONTRACTS.md` güncellendi

---
Detay: `docs/03_API_CONTRACTS.md`; `docs/07_SECURITY_IMPLEMENTATION.md`
~~~

---

## Faz skill — rules-architect yazmaz

`phase-creator` skill'inin `reference.md` + `iteration-blueprint.md` iskeletini kullan. rules-architect yalnızca roadmap'ten **eksik fazları listeler** ve devreder.

---

## Router içerik sınırları

| Bölüm | Max | İçerik |
| ----- | --- | ------ |
| Çalışma protokolü | ~20 satır | 5 adım |
| Koşulsuz rule özeti | ~15 satır | 00–04, her biri 1–2 cümle |
| Path tablosu | ~20 satır | desen → rule dosya adı |
| Skill tablosu | ~12 satır | görev → skill adı |
| Faz tablosu | faz sayısı kadar | faz → skill adı |
| docs indeks | ~8 satır | path listesi |

Router **asla** rule'ların pattern bölümünü kopyalamaz.

---

## Gap analizi checklist

```
[ ] CLAUDE.md var ve ≤150 satır mı?
[ ] 00–04 tam set var mı, toplam ≤500 satır mı?
[ ] Her apps/* major path en az 1 path-scoped rule'a bağlı mı?
[ ] paths desenleri gerçek dosyalarla eşleşiyor mu (Glob ile test)?
[ ] Sık görevler (endpoint, ekran, migration) için skill var mı?
[ ] Skill description'ları NE + NE ZAMAN + NE ZAMAN DEĞİL içeriyor mu?
[ ] CLAUDE.md tabloları güncel mi?
[ ] Spec duplikasyonu var mı? (Grep ile uzun tablolar)
[ ] Rule'lar arasında çelişki var mı?
[ ] Roadmap fazları ↔ phase skills birebir mi?
[ ] /context çıktısında Memory files listesi beklenen dosyaları içeriyor mu?
```

---

## Migrasyon: `.cursor/rules/*.mdc` → Claude Code

| Kaynak frontmatter | Hedef |
| ------------------ | ----- |
| `alwaysApply: true` | `.claude/rules/NN-*.md`, frontmatter sil |
| `globs: [...]` | `.claude/rules/NN-*.md`, `globs` → `paths` |
| `description` only | `.claude/skills/<ad>/SKILL.md`, description'ı NE+NE ZAMAN+DEĞİL formatında yeniden yaz |
| `50+-phase-*` | phase-creator'a devret |

`.cursor/` klasörünü silme — kullanıcıya sor. Cursor'ı paralel kullanıyor olabilir.
