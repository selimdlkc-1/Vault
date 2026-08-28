# Vault

> Testnet-only **portföy ve transfer** uygulaması — bir exchange değil.

Vault, bir kullanıcının testnet blok zinciri cüzdanlarını sisteme tanımlayıp mal
varlığını tek ekranda takip edebildiği, görselleştirebildiği ve **aynı ağ içinde**
cüzdanlar arasında transfer başlatabildiği bir uygulamadır. Swap, order book,
matching engine, likidite havuzu, fiat satın alma ve ağlar/varlıklar arası dönüşüm
kapsam dışıdır.

Proje bir portföy/işe alım (recruitment) projesidir; canlıya alınmaz (deploy yok,
monitoring yok), ancak mimari olgunluk korunur (katman ayrımı, merkezi state
machine, provider soyutlaması).

## Temel İlkeler

- **Testnet-only.** Sistem hiçbir koşulda mainnet'e bağlanmaz; bu kod seviyesinde
  bir chain ID allowlist ile zorlanan kalıcı bir güvenlik sınırıdır.
- **Arayüz Türkçe, kod İngilizce.** Kullanıcıya görünen her metin Türkçe; tüm kod
  tanımlayıcıları İngilizce.
- **Tek hesap birimi USDT.** Portföy toplam değeri network-agnostic USDT cinsinden
  gösterilir; arayüzde `$` veya başka fiat sembolü kullanılmaz.
- **1 chat ≈ 1 PR.** Geliştirme faz → alt madde → iterasyon hiyerarşisiyle ilerler;
  test-first, kullanıcı onayı olmadan merge yok.

## Desteklenen Ağlar

| Ağ | Tür | Sağlayıcı |
| --- | --- | --- |
| Sepolia | EVM testnet | ethers v6 |
| BSC Testnet | EVM testnet | ethers v6 |
| Tron Shasta | Tron testnet | tronweb |

## Teknoloji Yığını (pin'li)

- **Monorepo:** Turborepo + pnpm workspace
- **Frontend (`apps/web`):** Next.js 15 App Router, Tailwind CSS + shadcn/ui,
  TanStack Query, react-hook-form + zod
- **Backend (`apps/api`):** NestJS 10, Prisma 5, PostgreSQL 16, Redis 7 + BullMQ,
  argon2id, JWT (in-memory access + rotating httpOnly refresh cookie)
- **Zincir:** ethers v6 (EVM), tronweb (Tron)
- **Test:** Jest (unit/integration), Playwright (E2E)

Yeni framework/library eklemek bir ADR gerektirir (`docs/adr/`).

## Monorepo Yapısı

```
apps/web                 — Next.js App Router
apps/api                 — NestJS
packages/types           — paylaşılan tip/enum/zod şema
packages/chain-providers — IChainProvider + EvmProvider + TronProvider
packages/config          — paylaşılan eslint/tsconfig
packages/contracts       — mock ERC-20/TRC-20 kontratları + Hardhat deploy script'leri
```

## Başlangıç

### Önkoşullar

- Node.js ≥ 22
- pnpm 9
- Docker + Docker Compose

### Kurulum

```bash
pnpm install

# Ortam dosyalarını hazırla
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# apps/api/.env içindeki boş secret'ları doldur:
#   JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / MASTER_ENCRYPTION_KEY  → openssl rand -hex 32
#   HD_WALLET_MNEMONIC, *_RPC_URL, ALCHEMY_API_KEY, TRONGRID_API_KEY → geliştirici hesabından
```

### Çalıştırma

```bash
# Tüm sistem tek komutla (Postgres + Redis + api + web)
docker compose up

#   web → http://localhost:3000
#   api → http://localhost:3001
```

Yalnızca altyapıyı Docker'da, uygulamaları lokal çalıştırmak için:

```bash
docker compose up postgres redis -d
pnpm --filter @vault/api exec prisma migrate deploy
pnpm --filter @vault/api run seed
pnpm dev
```

## Sık Kullanılan Komutlar

| Komut | Açıklama |
| --- | --- |
| `pnpm dev` | Tüm uygulamaları watch modunda çalıştırır |
| `pnpm build` | Tüm paketleri derler |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit/integration testleri |
| `pnpm --filter @vault/api run seed` | DB seed (network/asset kataloğu + admin kullanıcı) |

## Kalite Kapıları

Her PR'da sırayla **lint → typecheck → unit/integration test → build**; dördü de
yeşil olmadan merge edilemez. `packages/chain-providers` ve `TransferStateMachine`
servisi için birim test kapsamı ≥ %80 zorunludur.

## Yol Haritası

Geliştirme 8 faz halinde ilerler (`docs/10_IMPLEMENTATION_ROADMAP.md`):

| Faz | Konu | Durum |
| --- | --- | --- |
| 0 | Altyapı ve monorepo temeli | ✅ Tamamlandı |
| 1 | Kimlik doğrulama ve roller | ✅ Tamamlandı |
| 2 | Network/Asset master data ve admin temeli | 🚧 Devam ediyor |
| 3 | Watch-only cüzdan ve salt-okunur portföy | ⏳ |
| 4 | Managed cüzdan ve key storage | ⏳ |
| 5 | Transfer state machine uçtan uca | ⏳ |
| 6 | Bildirim, audit ve admin görünürlüğü | ⏳ |
| 7 | Test/CI sıkılaştırma ve polish | ⏳ |

## Dokümantasyon

`docs/` tek doğruluk kaynağıdır. Çelişki durumunda docs kazanır.

- `docs/00_PROJECT_OVERVIEW.md` … `docs/10_IMPLEMENTATION_ROADMAP.md`
- `docs/mimari-kararlar.md` — mimari karar kaydı (karar ID kaynağı)
- `CLAUDE.md` + `.claude/rules/` + `.claude/skills/` — agent çalışma protokolü
