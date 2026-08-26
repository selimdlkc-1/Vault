# Vault

> Talimatlar `.claude/rules/` (koşulsuz + path-scoped) ve `.claude/skills/` (görev prosedürleri) altında.
> Bu dosya **yönlendiricidir**. Spec tek doğruluk kaynağı: `docs/`. Çelişkide **docs kazanır**.

## Çalışma Protokolü

1. Koşulsuz kurallar (`00–04`) her oturumda zaten yüklü — özet aşağıda, tereddütte tam dosyayı oku.
2. Bir dosyayı düzenlemeden önce path tablosundan ilgili rule'ı kontrol et; path-scoped rule dosya okununca otomatik yüklenir.
3. Görev bir prosedürse (endpoint, ekran, migration, ADR, test kırığı, faz branch'i) ilgili skill'i çalıştır.
4. Faz çalışmasıysa `git-phase-branch` ile branch aç, ardından ilgili `phase-XX-*` skill'ini çalıştır (henüz üretilmedi — bkz. Faz Yönlendirme).
5. Spec detayı için `docs/` path'ine git — talimatlarda kopyalanmış tablo arama.

## Her Zaman Geçerli — Özet

Tam metin: `.claude/rules/00-*.md` … `04-*.md`

- **[00] Kimlik** — Vault: testnet-only portföy & transfer uygulaması (exchange değil); Turborepo/Next.js/NestJS/Prisma/Redis stack pin'li
- **[01] Felsefe** — "1 chat ≈ 1 PR", test-first, kullanıcı onayı olmadan merge yok, over-engineering yasağı
- **[02] Naming** — TR UI / EN code, Conventional Commits, `UPPER_SNAKE_CASE` error code
- **[03] Güvenlik** — 6 zorunlu kontrol (private key, access token, step-up auth, cross-network guard, rate limit, mainnet allowlist); skip yasak
- **[04] Kalite** — chain-providers + TransferStateMachine ≥%80 coverage, 4 adımlı CI gate

## Path Yönlendirme

Bu rule'lar eşleşen dosya okunduğunda otomatik yüklenir. Desenler `docs/04` §2 / `docs/05` §1'deki **planlanan** ağaca dayanır — Faz 0 tamamlanana kadar gerçek dosyayla eşleşmeyebilir.

| Dosya deseni | Rule |
| --- | --- |
| `apps/api/src/**/*.ts` | `10-backend-architecture` |
| `apps/api/src/auth/**/*.ts` | `11-backend-auth` |
| `packages/chain-providers/**/*.ts`, `apps/api/src/transfers/**/*.ts` | `13-critical-modules` |
| `apps/api/**/*.controller.ts` | `14-backend-controllers` |
| `apps/api/prisma/**`, `apps/api/**/*.repository.ts` | `15-backend-data` |
| `apps/web/src/**/*.{ts,tsx}` | `20-frontend-architecture` |
| `apps/web/src/components/**/*.tsx` | `24-frontend-components` |
| `**/*.spec.ts`, `**/*.test.ts`, `apps/web/e2e/**/*.e2e-spec.ts` | `30-testing` |

> Birden fazla desen eşleşebilir (ör. bir controller = `10` + `14`) — hepsi geçerli.

## Görev → Skill

| Görev türü | Skill |
| --- | --- |
| Yeni/değişen REST endpoint | `add-new-endpoint` |
| Yeni ekran/route | `add-new-screen` |
| DB migration | `add-prisma-migration` |
| Yeni/değişen mimari karar | `write-adr` |
| CI kırığı / başarısız test | `fix-failing-test` |
| Faz alt madde branch'i açma | `git-phase-branch` |

## Faz Yönlendirme

Mesajda **「Faz N — Alt Madde §N.M」** belirt.

| Faz | Skill |
| --- | --- |
| 0 | `phase-00-infra-scaffold` |
| 1 | `phase-01-auth-roles` |
| 2 | `phase-02-master-data-admin` |
| 3 | `phase-03-watchonly-portfolio` |
| 4 | `phase-04-managed-wallet-keys` |
| 5 | `phase-05-transfer-state-machine` |
| 6 | `phase-06-notifications-audit` |
| 7 | `phase-07-test-ci-polish` |

Faz skill üretimi: `phase-creator`. Denetim: tamamlanan faz için `phase-controller`.

## docs/ — Nihai Kaynak

`docs/00_PROJECT_OVERVIEW.md` … `docs/10_IMPLEMENTATION_ROADMAP.md`, `docs/mimari-kararlar.md` (v0.3, karar ID kaynağı)

> Spec değişikliği → önce `docs/mimari-kararlar.md` güncelle, sonra etkilenen `docs/0N_*.md`, sonra ilgili rule/skill referansını doğrula (bkz. `docs/10` §8).
