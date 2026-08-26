---
name: phase-00-infra-scaffold
description: '[Faz 0] Altyapı ve monorepo temeli — 5 iterasyon/chat (git bootstrap + Turborepo iskeleti → Docker Compose/env → Prisma şema+migration → CI pipeline → seed iskeleti). Use when the user says "Faz 0", "Faz 0 — İterasyon N", or asks to scaffold the monorepo/infra/CI. Do NOT use for auth/roller (Faz 1) or gerçek network/asset seed verisi (Faz 2).'
---

# Faz 0: Altyapı ve Monorepo Temeli

## Goal

Turborepo monorepo, Docker Compose, ilk 4 tablolu Prisma migration, CI pipeline ve boş seed iskeleti kurulur; sistem henüz işlevsiz olsa da `docker-compose up` ile tek komutla ayağa kalkar ve CI'ın 4 adımı (lint→typecheck→test→build) yeşildir (`docs/10_IMPLEMENTATION_ROADMAP.md` Faz 0 İnsan onay noktası).

## Feature branch (zorunlu)

Repo henüz `git init` edilmemiş — bu fazın **İterasyon 1'i bir kerelik bootstrap istisnası içerir**: `git init` + o ana kadar üretilmiş `docs/`, `.claude/`, `CLAUDE.md` dosyalarının commit'i doğrudan `main`'e atılır (`docs/09_DEV_WORKFLOW.md` §1 bootstrap istisnası — henüz `main` yoksa branch/PR akışı mümkün değildir). Bu istisna yalnızca bu tek commit içindir; İterasyon 1'in geri kalanı (Turborepo iskeleti) dahil **İterasyon 2-5'in tamamı** normal `git-phase-branch` skill'iyle (branch aç → PR → onay → merge) ilerler.

## Bu fazın çalışma modeli

- Tek sohbet fazı bitirmez; her chat başında **「Faz 0 — İterasyon M」** belirt.
- Agent yalnızca o iterasyonun **Docs okuma sırasını** okur, tüm spec'i değil.
- Plan moduna geçme — aşağıdaki iterasyon blueprint'i yeterli.

## İterasyon indeksi

| # | Teslim | §N.M |
| - | ------ | ---- |
| 1 | Git bootstrap + Turborepo iskeleti (5 boş-derlenebilir paket) | §0.1 |
| 2 | Docker Compose + env iskeleti (zod fail-fast) | §0.2 |
| 3 | Prisma şema (4 tablo) + ilk migration | §0.3 |
| 4 | GitHub Actions CI pipeline | §0.4 |
| 5 | Seed script iskeleti | §0.5 |

## Required Context

- `docs/10_IMPLEMENTATION_ROADMAP.md` §3 Faz 0 — tüm alt madde tanımları (iterasyon listesi için)
- `.claude/rules/00-project-identity.md`, `01-coding-philosophy.md`, `02-language-naming.md`, `04-quality-gates.md` — zaten yüklü, tekrar edilmez

## Done Definition

- [ ] `docker-compose up` tüm sistemi (Postgres, Redis, `apps/api`, `apps/web`) tek komutla, ek manuel adım gerektirmeden ayağa kaldırıyor
- [ ] CI'ın 4 adımı (lint→typecheck→test→build) her PR'da yeşil
- [ ] İlk Prisma migration (`users`, `networks`, `assets`, `network_assets`) uygulanmış
- [ ] `pnpm --filter api run seed` hatasız (no-op) tamamlanıyor

## Explicit Don'ts

- Auth/roller, gerçek network/asset seed verisi, deploy/monitoring, coverage gate (Faz 7'de eklenir) bu fazda **yok** — `docs/00_PROJECT_OVERVIEW.md` §4 MVP kapsamıyla uyumlu.
- Branch protection'ın GitHub repo ayarları üzerinden **manuel** kurulması bu fazın kapsamındadır ama kodla otomatikleştirilmez.

---

### İterasyon 1 — Git Bootstrap + Turborepo İskeleti (§0.1)

**Hedef:** Repo git ile başlatılmış, bootstrap commit `main`'e atılmış; Turborepo monorepo (`apps/web`, `apps/api`, `packages/types`, `packages/chain-providers`, `packages/config`) boş ama `pnpm install && pnpm build` hatasız çalışacak şekilde kurulu.

**Teslim çıktısı:**
- Bootstrap commit (`main`) + `feat/monorepo-scaffold` branch'inde: `turbo.json`, `pnpm-workspace.yaml`, kök `package.json`, `packages/config`, `packages/types`, `packages/chain-providers`, minimal `apps/web`, minimal `apps/api`, `pnpm-lock.yaml`

**Önkoşullar:**
- [ ] Yok (fazın ilk iterasyonu)
- [ ] Node.js 22 LTS ve pnpm ^9.12 lokal kurulu (developer makine ön koşulu)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §0.1 — kapsam
2. `docs/mimari-kararlar.md` §14 Tech Stack (TS-001, TS-003) — versiyon pinleri
3. `docs/09_DEV_WORKFLOW.md` §1 — branch stratejisi + bootstrap istisnası

**Uygulama planı:**
1. **Bootstrap (bir kerelik, `main`'e doğrudan):** `git init`; `.gitignore` oluştur (`node_modules`, `.env`, `dist`, `.next`, `.turbo`); mevcut `docs/`, `.claude/`, `CLAUDE.md` dosyalarını commit'le (`docs/09` §1 bootstrap istisnası).
2. `git-phase-branch` skill'iyle `feat/monorepo-scaffold` branch'i aç.
3. Kök `package.json` (`workspaces`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` (build/lint/test/dev pipeline) — `mimari-kararlar` TS-003 versiyon pinleriyle.
4. `packages/config` — paylaşılan `eslint-config` + `tsconfig.base.json` (`.claude/rules/02-language-naming.md` naming convention'a uyacak lint kuralları).
5. `packages/types`, `packages/chain-providers` — boş `package.json` + `tsconfig.json` (`packages/config`'i extend eder) + `src/index.ts` placeholder.
6. `apps/web` — Next.js ^15.1 App Router minimal iskelet (Tailwind CSS kurulu, tek `app/page.tsx`); `apps/api` — NestJS ^10.4 minimal iskelet (`main.ts`, `app.module.ts`).
7. `pnpm install` (kökte) → `pnpm-lock.yaml` üretilir; `pnpm build` hatasız tamamlanmalı; PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `packages/config/*`, `packages/types/*`, `packages/chain-providers/*`, `apps/web/*` (minimal), `apps/api/*` (minimal) |
| Dokunma | `apps/web` ekran içerikleri (Faz 3+), `apps/api` iş mantığı modülleri (Faz 1+) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Monorepo paket seti (5 paket) | `docs/10` §0.1 | `apps/web`, `apps/api`, `packages/types`, `packages/chain-providers`, `packages/config` |
| Versiyon pinleri | `mimari-kararlar` §14 TS-003 | `package.json`'larda `^` ile tam pin |
| Bootstrap commit `main`'e doğrudan | `docs/09` §1 | `git init` sonrası tek commit; sonrası branch/PR |

**Kalite kapıları:**
- [ ] `pnpm install` hatasız
- [ ] `pnpm build` (turbo pipeline) tüm paketlerde hatasız (boş paketler dahil derlenebilir)
- [ ] Bu iterasyonda test kodu yok — saf scaffold istisnası (`iteration-blueprint.md`)

**Bu iterasyonda yok:** Docker Compose (İterasyon 2), DB şeması (İterasyon 3), CI workflow (İterasyon 4), seed (İterasyon 5), gerçek iş mantığı.

**Risk / dikkat:** Bootstrap commit'i `main`'e doğrudan atmak yalnızca bu tek seferlik durum için geçerlidir — sonraki hiçbir değişiklik bu istisnayı tekrar kullanmaz; `.gitignore`'da `.env` unutulursa sonraki iterasyonda secret sızıntısı riski oluşur.

**Stop:**
- [ ] `pnpm install`
- [ ] `pnpm build`
- [ ] PR/onay → İterasyon 2

---

### İterasyon 2 — Docker Compose + Env İskeleti (§0.2)

**Hedef:** `docker-compose.yml` ile Postgres 16 + Redis 7 + `apps/api` + `apps/web` konteynerleri tanımlı; `apps/api/.env.example` tüm değişken adlarıyla; zod env şeması eksik/geçersiz değişkende uygulamayı başlatmıyor (fail-fast), unit testle kanıtlı.

**Teslim çıktısı:**
- `docker-compose.yml`, `apps/api/.env.example`, `apps/api/src/config/env.schema.ts` (+ `.spec.ts`), `apps/api/Dockerfile`, `apps/web/Dockerfile`

**Önkoşullar:**
- [ ] İterasyon 1 Stop tamam (monorepo iskeleti merge edilmiş)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §0.2 — kapsam
2. `docs/09_DEV_WORKFLOW.md` §5 (ortamlar/izolasyon), §7 (env değişken tam listesi)
3. `docs/mimari-kararlar.md` §15 INF-001/INF-003 — deploy stratejisi, log stratejisi (`LOG_LEVEL`)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/docker-compose-env-skeleton` branch'i aç.
2. `docker-compose.yml` — `postgres:16`, `redis:7`, `apps/api` (build context), `apps/web` (build context); healthcheck basit tutulur (over-engineering yasağı).
3. `apps/api/.env.example` — `docs/09` §7 tablosundaki **tüm** değişken adları (`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `MASTER_ENCRYPTION_KEY`, `*_RPC_URL`, `*_API_KEY`, `CHAIN_ID_ALLOWLIST`, `CORS_ORIGIN`, `NODE_ENV`, `LOG_LEVEL`) — değersiz placeholder.
4. `apps/api/src/config/env.schema.ts` — zod obje şeması; `NODE_ENV` yalnızca `development|test` (`docs/09` §5).
5. `main.ts` bootstrap'ında env doğrulama çağrısı; başarısızsa `process.exit(1)`.
6. `env.schema.spec.ts` — pozitif (tüm değişkenler dolu → başarılı parse) + deny (eksik zorunlu değişken → hata) testleri.
7. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `docker-compose.yml`, `apps/api/.env.example`, `apps/api/src/config/env.schema.ts`, `apps/api/src/config/env.schema.spec.ts`, `apps/api/Dockerfile`, `apps/web/Dockerfile` |
| Güncelle | `apps/api/src/main.ts` |
| Dokunma | Prisma şema (İterasyon 3) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Env değişken tam seti | `docs/09` §7 | zod şemasında birebir alan |
| `NODE_ENV` yalnızca `development`/`test` | `docs/09` §5 | `z.enum(['development','test'])` |
| Fail-fast doğrulama | `docs/10` §0.2 | bootstrap'ta parse; hata → `process.exit(1)` |

**Kalite kapıları:**
- [ ] Pozitif senaryo testi (tüm env dolu → başarılı parse)
- [ ] Deny testi (eksik zorunlu değişken → hata/exit)
- [ ] `pnpm --filter api test` yeşil; lint/typecheck yeşil

**Bu iterasyonda yok:** gerçek Prisma bağlantısı (İterasyon 3), CI entegrasyonu (İterasyon 4), gerçek RPC/API key değerleri.

**Risk / dikkat:** `.env` (gerçek değerlerle) yanlışlıkla commit edilirse secret sızıntısı — `.gitignore`'da `.env` olduğu (İterasyon 1) burada tekrar doğrulanır.

**Stop:**
- [ ] `docker-compose config` (syntax doğrulama)
- [ ] `pnpm --filter api test -- env.schema`
- [ ] PR/onay → İterasyon 3

---

### İterasyon 3 — Prisma Şema İskeleti + İlk Migration (§0.3)

**Hedef:** `users`, `networks`, `assets`, `network_assets` tabloları `docs/02` §2.1-2.4 ile birebir; ilk migration `prisma migrate dev` ile üretilmiş ve uygulanmış.

**Teslim çıktısı:**
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<ts>_init/migration.sql`, `apps/api/src/prisma/prisma.service.ts` + `.module.ts`

**Önkoşullar:**
- [ ] İterasyon 2 Stop tamam (`docker-compose` ile Postgres ayağa kalkabiliyor)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §0.3 — kapsam
2. `docs/02_DATABASE_SCHEMA.md` §1 — isimlendirme konvansiyonu (UUID PK, snake_case, `@map`)
3. `docs/02_DATABASE_SCHEMA.md` §2.1-2.4 — `users`, `networks`, `assets`, `network_assets` tam kolon tanımları
4. `docs/02_DATABASE_SCHEMA.md` §3 — `user_role`, `chain_type` enum değerleri
5. `docs/02_DATABASE_SCHEMA.md` §8 — migration stratejisi (dosya adı formatı, immutability)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/prisma-schema-skeleton` branch'i aç (`add-prisma-migration` skill'i referans).
2. `docker-compose up -d postgres` ile lokal DB ayağa kaldır (`.env`'de gerçek lokal `DATABASE_URL`).
3. `schema.prisma` — `User`, `Network`, `Asset`, `NetworkAsset` modelleri; `@@map` ile snake_case tablo/kolon eşlemesi; `user_role`/`chain_type` enum.
4. `prisma migrate dev --name init` — migration dosyasını üretir, uygular.
5. `PrismaService` (`OnModuleInit`/`OnModuleDestroy`) + `PrismaModule` — `apps/api/src/prisma` altında.
6. `docker-compose up` ile API konteynerinin `prisma migrate deploy`'u otomatik çalıştırdığı doğrulanır (`docs/02` §8).

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `schema.prisma`, `migrations/<ts>_init/*`, `prisma.service.ts`, `prisma.module.ts` |
| Güncelle | `apps/api/.env` (gerçek lokal `DATABASE_URL`) |
| Dokunma | `wallets`/`transfers` vb. tablolar (sonraki fazlar) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| `users` tablosu | `docs/02` §2.1 | `email` UNIQUE, `password_hash` TEXT, `role` enum default `user` |
| `networks` tablosu | `docs/02` §2.2 | `chain_id` TEXT UNIQUE, `confirmation_threshold` INTEGER |
| `assets` tablosu | `docs/02` §2.3 | `(network_id, symbol)` UNIQUE |
| `network_assets` tablosu | `docs/02` §2.4 | `(network_id, asset_id)` composite PK, `is_active` default `false` |
| Migration immutability | `docs/02` §8 | merge sonrası dosya asla düzenlenmez |

**Kalite kapıları:**
- [ ] `prisma validate` hatasız
- [ ] `prisma migrate dev` migration dosyasını hatasız üretir/uygular
- [ ] Bu iterasyonda unit test yok — saf şema/migration scaffold istisnası (`iteration-blueprint.md`)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** seed verisi (İterasyon 5'te iskelet, gerçek veri Faz 2), `wallets`/`transfers` vb. diğer tablolar, `encrypted_dek` gibi Prisma select güvenlik kısıtları (henüz yok).

**Risk / dikkat:** `network_assets` bileşik PK'sinin şemada `@@id([networkId, assetId])` ile doğru tanımlanması gerekir; yanlış tanımlanırsa Faz 2'nin aktivasyon endpoint'inde sessiz bir bütünlük hatası oluşur.

**Stop:**
- [ ] `pnpm --filter api exec prisma validate`
- [ ] `pnpm --filter api exec prisma migrate dev --name init`
- [ ] PR/onay → İterasyon 4

---

### İterasyon 4 — CI Pipeline (§0.4)

**Hedef:** GitHub Actions her PR'da lint→typecheck→test→build sırasıyla çalışıyor; branch protection `main`'e doğrudan push'u engelliyor.

**Teslim çıktısı:**
- `.github/workflows/ci.yml`
- Branch protection ayarı (GitHub repo ayarı — kod değil, PR açıklamasında belgelenen manuel adım)

**Önkoşullar:**
- [ ] İterasyon 3 Stop tamam
- [ ] GitHub'da uzak repo oluşturulmuş ve push edilmiş olmalı (agent kapsamı dışı, `mimari-kararlar` INF-002)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §0.4 — kapsam
2. `docs/09_DEV_WORKFLOW.md` §3 — PR süreci ve zorunlu kontroller
3. `docs/mimari-kararlar.md` §15 INF-002 — CI kapsamı, deploy adımı yok

Not: `.claude/rules/04-quality-gates.md` (CI Gate 4 adım) zaten yüklü context — burada tekrar okunmaz, yalnızca referans verilir.

**Uygulama planı:**
1. `git-phase-branch` ile `chore/ci-pipeline` branch'i aç.
2. `.github/workflows/ci.yml` — `pull_request` tetikleyici; adımlar: `pnpm install` → `pnpm lint` → `pnpm typecheck` (`tsc --noEmit`, turbo pipeline) → `pnpm test` (henüz test azsa boş/az geçer, Faz 1+'da dolar) → `pnpm build`; CI kendi Postgres/Redis servis container'ını ayağa kaldırır (`docs/09` §5 izolasyon).
3. PR açıklamasına branch protection'ın GitHub repo ayarlarından manuel yapılacağı notu eklenir (workflow dosyasıyla otomatikleştirilemeyen bir GitHub UI/API ayarı).
4. PR aç, CI'ın kendi üzerinde yeşil çalıştığı gösterilir.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `.github/workflows/ci.yml` |
| Dokunma | Coverage gate (`docs/10` §7.1'de Faz 7'de eklenir — bu iterasyonda eşik konmaz) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| 4 adım sırası (lint→typecheck→test→build) | `docs/09` §3 | workflow job step sırası birebir |
| Deploy adımı yok | `mimari-kararlar` INF-002 | workflow'da deploy/publish step'i yok |
| Test DB izolasyonu | `docs/09` §5 | CI kendi Postgres service container'ını kullanır |
| Coverage gate yok (henüz) | `docs/10` §7.1 (ileri referans) | bu iterasyonda eklenmez |

**Kalite kapıları:**
- [ ] Workflow dosyası YAML syntax geçerli
- [ ] PR açıldığında CI tetikleniyor ve mevcut test suite'iyle yeşil tamamlanıyor
- [ ] lint/typecheck adımları mevcut kod tabanında (İterasyon 1-3 çıktısı) yeşil

**Bu iterasyonda yok:** coverage gate (Faz 7), deploy step, branch protection'ın kod/otomasyonla kurulması (manuel GitHub ayarı).

**Risk / dikkat:** Repo henüz bir GitHub remote'a push edilmemişse bu iterasyon CI'ın gerçekten tetiklendiğini canlı doğrulayamaz — workflow dosyası yazılır, canlı doğrulama kullanıcının remote'u bağlamasından sonra yapılır.

**Stop:**
- [ ] Lokal olarak `pnpm lint && pnpm typecheck && pnpm test && pnpm build` sırası hatasız tamamlanıyor
- [ ] `.github/workflows/ci.yml` gözden geçirilmiş
- [ ] PR/onay → İterasyon 5

---

### İterasyon 5 — Seed Script İskeleti (§0.5)

**Hedef:** `apps/api/prisma/seed.ts` idempotent upsert kalıbıyla, şu an boş (gerçek network/asset verisi olmadan) ama hatasız çalışan bir yapı; `prisma db seed` başarıyla tamamlanıyor.

**Teslim çıktısı:**
- `apps/api/prisma/seed.ts` (idempotent iskelet), `apps/api/package.json`'da `prisma.seed` script tanımı

**Önkoşullar:**
- [ ] İterasyon 3 Stop tamam (schema/migration mevcut)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §0.5 — kapsam
2. `docs/02_DATABASE_SCHEMA.md` §9 — Seed Verisi (gerçek veri Faz 2'de dolacak, burada yalnızca yapı)
3. `docs/09_DEV_WORKFLOW.md` §6 — Local Kurulum Adımları (`pnpm --filter api run seed` komutu)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/seed-script-skeleton` branch'i aç.
2. `apps/api/prisma/seed.ts` — `main()` fonksiyonu, `PrismaClient` instance, idempotent `upsert` kalıbının gösterildiği (gerçek network/asset satırı olmadan, yalnızca yapı) bir gövde; `try/finally` ile `prisma.$disconnect()`.
3. `apps/api/package.json`'a `"prisma": { "seed": "ts-node prisma/seed.ts" }` eklenir.
4. `pnpm --filter api run seed` ile hatasız (no-op) çalıştığı doğrulanır.
5. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `apps/api/prisma/seed.ts` |
| Güncelle | `apps/api/package.json` (seed script) |
| Dokunma | gerçek network/asset/admin/demo kullanıcı verisi (Faz 2 §2.1) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Idempotent upsert kalıbı | `docs/02` §9 | `upsert` kullanılır, tek başına `create`/`createMany` kullanılmaz |
| Gerçek veri Faz 2'de | `docs/10` §0.5 | `seed.ts` bu iterasyonda placeholder/no-op kalır |
| `pnpm --filter api run seed` komutu | `docs/09` §6 | script adı birebir |

**Kalite kapıları:**
- [ ] `pnpm --filter api run seed` hatasız tamamlanır (exit code 0)
- [ ] Script tekrar çalıştırıldığında hata vermez (idempotency)
- [ ] lint/typecheck yeşil

**Bu iterasyonda yok:** gerçek network/asset/admin/demo kullanıcı seed verisi (Faz 2 §2.1), managed cüzdan seed'i (Faz 4 sonrası mümkün — envelope encryption'a bağımlı).

**Risk / dikkat:** Seed script'i boş bırakılırken bile `upsert` kalıbının doğru gösterilmesi önemli — Faz 2'de gerçek veri eklenirken kalıp değişmemeli, yalnızca içerik dolmalı.

**Stop:**
- [ ] `pnpm --filter api run seed`
- [ ] `docker-compose up` ile tüm sistem ayağa kalkıyor (Faz 0 İnsan onay noktası — `docs/10` §3)
- [ ] Lokal `pnpm lint && pnpm typecheck && pnpm test && pnpm build` hatasız
- [ ] Faz 0 Done Definition tamam; `docs/10_IMPLEMENTATION_ROADMAP.md` Faz 0 işaretlenir; kullanıcı onayı → Faz 1
