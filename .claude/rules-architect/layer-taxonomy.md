# Mekanizma Taksonomisi

Cursor'ın 4 katmanlı `.mdc` modelinin Claude Code karşılığı. Katman mantığı aynı; taşıyıcı mekanizma farklı.

## Neden katman?

| Problem | Çözüm |
| ------- | ----- |
| 47 kural × 250 satır = context patlaması | Tetiklemeye göre yükleme |
| Spec rule'da eskir | `docs/` tek kaynak; rule referans verir |
| Agent hangi kuralı okuyacağını bilmez | `CLAUDE.md` router + skill description |
| Her görevde aynı 6 güvenlik maddesi unutulur | Koşulsuz rule (00–04) |

## Eşleme tablosu

| Cursor | Claude Code | Frontmatter | Yükleme anı |
| ------ | ----------- | ----------- | ----------- |
| `alwaysApply: true` | `.claude/rules/00–04-*.md` | yok | Oturum başı |
| `globs: [...]` | `.claude/rules/10–3x-*.md` | `paths: [...]` | Eşleşen dosya okununca |
| `description` only | `.claude/skills/<ad>/SKILL.md` | `name` + `description` | Description eşleşince |
| `50+-phase-*.mdc` | `.claude/skills/phase-XX-<slug>/` | `name` + `description` | phase-creator üretir |
| `CLAUDE.md` router | `./CLAUDE.md` | yok | Oturum başı |

---

## Katman 0 — Koşulsuz (00–04)

| Özellik | Değer |
| ------- | ----- |
| Konum | `.claude/rules/NN-slug.md` |
| Frontmatter | **Yok** (`paths` alanı olmayan rule koşulsuz yüklenir) |
| Satır hedefi | ≤120/dosya; toplam ≤500 (CLAUDE.md ile birlikte ≤650) |
| İçerik | Prensip, checklist, pin'li stack, MVP sınırları |

| NN | Slug | İçerik |
| -- | ---- | ------ |
| 00 | `project-identity` | Kimlik, stack, monorepo, domain sözlüğü, non-goals |
| 01 | `coding-philosophy` | MVP scope, test-first, self-review |
| 02 | `language-naming` | TR UI / EN code, commit, error code pattern |
| 03 | `security-baseline` | 6 zorunlu kontrol (executable checklist) |
| 04 | `quality-gates` | Coverage, lint, bundle, CI, a11y eşikleri |

**Koyma:** Modül pattern'i, endpoint prosedürü, ekran şablonu → alt katmanlar.

---

## Katman 1 — Path-scoped (10–3x)

| Özellik | Değer |
| ------- | ----- |
| Konum | `.claude/rules/NN-slug.md` |
| Frontmatter | `paths:` listesi |
| Satır hedefi | 150–200/dosya |

### Numara blokları

| Aralık | Alan | Örnek paths |
| ------ | ---- | ----------- |
| 10–19 | Backend | `apps/api/**/*.ts` |
| 11 | Auth | `apps/api/src/auth/**` |
| 12 | Permissions | `apps/api/src/roles/**` |
| 14 | Controllers | `apps/api/**/*.controller.ts` |
| 15 | Database | `apps/api/prisma/**`, `**/*.service.ts` |
| 20–29 | Frontend | `apps/web/src/**` |
| 22 | Forms | `**/*Form*.tsx`, `**/new/**`, `**/edit/**` |
| 24 | Components | `apps/web/src/components/**` |
| 26 | Design system | `apps/web/**/*.{tsx,css}` |
| 30–39 | Infra, test | `infrastructure/**`, `**/*.{test,spec}.{ts,tsx}` |

### Desen tasarımı

- Genel kural geniş, spesifik kural dar.
- Aynı dosya birden çok rule tetikleyebilir — bilinçli.
- Brace expansion destekli (`src/**/*.{ts,tsx}`) ama her grup desen sayısını katlar; 2 grubu geçme.
- `[` karakteri bracket expression başlatır; literal `[` için `\[` ile escape et.
- Desen eşleşmesi Claude dosyayı **okuduğunda** tetiklenir, her tool çağrısında değil.

### Alt dizin `CLAUDE.md` alternatifi

Bir paketin tamamına ait build/test komutları için `apps/api/CLAUDE.md` kullanılabilir; o dizindeki dosyalar okununca yüklenir. **Ama** `/compact` sonrası otomatik geri yüklenmez — kritik kuralları path-scoped rule olarak yaz.

---

## Katman 2 — How-to skills

| Özellik | Değer |
| ------- | ----- |
| Konum | `.claude/skills/<ad>/SKILL.md` |
| Frontmatter | `name` + `description` (başka alan yok) |
| Satır hedefi | 200–300; uzun materyal aynı klasörde ayrı `.md` |

| Ad | Tetikleyici görev |
| -- | ----------------- |
| `add-new-endpoint` | Yeni/değişen REST endpoint |
| `add-new-screen` | Yeni route/ekran |
| `add-prisma-migration` | Schema migration |
| `add-new-permission` | RBAC/ABAC permission |
| `refactor-to-pattern` | Legacy → pattern hizalama |
| `write-adr` | Mimari karar kaydı |
| `fix-failing-test` | CI/test kırığı |
| `git-phase-branch` | Faz feature branch disiplini |

`name` kuralları: küçük harf + tire, ≤64 karakter, klasör adıyla birebir aynı, rakam prefix'i yok.

---

## Katman 3 — Faz skills

| Özellik | Değer |
| ------- | ----- |
| Konum | `.claude/skills/phase-XX-<slug>/SKILL.md` |
| Üretim | **`phase-creator` skill** — rules-architect devreder |
| İçerik | Goal, iterasyonlar, required context, done definition, explicit don'ts |
| Tekrarlanmaz | API body, ekran alan tablosu, 50+ satır file tree |

---

## Context bütçesi

| Senaryo | Yaklaşık yük |
| ------- | ------------ |
| Oturum başı (CLAUDE.md + 00–04) | ~600 satır |
| + Backend controller edit | +~300 (10 + 14 path-scoped) |
| + Yeni endpoint görevi | +~250 (skill tetiklenir) |

200 satırı aşan her-oturum-yüklenen dosya hem context yer hem talimata uyumu düşürür. Büyüyen içeriği path-scoped rule'a veya skill'e taşı.

---

## Yeni proje numaralandırma

1. 00–04 her projede aynı semantik.
2. 10–39: stack'e göre blok ayır; karşılığı yoksa atla.
3. Skills: en sık 5–8 prosedür yeter.
4. Faz: roadmap kadar; `phase-creator` ile.
5. Numara boşluğu bırak — sonradan ekleme kolaylığı.
