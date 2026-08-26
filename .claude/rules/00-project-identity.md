# Vault — Proje Kimliği

Vault, kullanıcının testnet blok zinciri cüzdanlarını sisteme tanımlayıp mal varlığını tek ekranda takip edebildiği, görselleştirebildiği ve aynı ağ içinde cüzdanlar arasında transfer başlatabildiği bir **portföy ve transfer uygulamasıdır**. Vault bir exchange **değildir** — swap, order book, matching engine, likidite havuzu, fiat satın alma ve farklı ağlar/varlıklar arasında dönüşüm kapsam dışıdır. Sistem **testnet-only**'dir; mainnet'e hiçbir koşulda bağlanılmaz, bu kod seviyesinde bir chain-id allowlist ile zorlanır. Proje bir portföy/işe alım (recruitment) projesidir, canlıya alınmayacaktır — ölçek kararları buna göre verilir (deploy yok, monitoring yok), ancak mimari olgunluk (katman ayrımı, merkezi state machine, provider soyutlaması) korunur.

## Tech Stack (Pin'li)

- Turborepo monorepo, pnpm workspace
- Next.js 15 App Router (`apps/web`) + NestJS 10 (`apps/api`)
- PostgreSQL 16 + Prisma 5, Redis 7 + BullMQ
- ethers v6 (EVM: Sepolia, BSC Testnet) + tronweb (Tron Shasta)
- Tailwind CSS + shadcn/ui, TanStack Query, zod (`packages/types`)
- Hardhat + TypeScript (`packages/contracts` — yalnızca mock kontrat derleme/deploy; runtime'da `apps/api` tarafından import edilmez, bkz. `docs/mimari-kararlar.md` TS-008)

Yeni framework/library eklemek bir ADR gerektirir (`write-adr` skill).

## Monorepo Yapısı

```
apps/web              — Next.js App Router
apps/api               — NestJS
packages/types          — paylaşılan tip/enum/zod şema
packages/chain-providers — IChainProvider + EvmProvider + TronProvider
packages/config          — paylaşılan eslint/tsconfig
packages/contracts       — mock ERC-20/TRC-20 kontratları + Hardhat deploy script'leri (Faz 4 §4.4a)
```

## Domain Terminolojisi

| Terim | Anlam |
| --- | --- |
| `quote_asset` / USDT | Portföy toplam değerinin ifade edildiği network-agnostic hesap birimi — bir *varlık* değildir |
| `Asset` | Bir network üzerindeki somut token/coin instance'ı (ör. Sepolia USDT ≠ Tron USDT, ayrı kontratlar) |
| Watch-only wallet | Private key sistemde yok, yalnızca bakiye/hareket izlenir |
| Managed wallet | Sistemin türettiği, private key'i şifreli sakladığı, transfer yapabilen cüzdan |
| Chain movement | Zincirde indexlenen ham hareket kaydı (tüm cüzdanlarda) |
| System transfer | `TransferStateMachine` ile izlenen, yalnızca managed cüzdandan yapılan gönderim |
| Network | Sepolia / BSC Testnet / Tron Shasta — hepsi testnet |

## MVP Kapsamı Dışı

- Swap, order book, matching engine, fiat satın alma, ağlar/varlıklar arası dönüşüm
- Native mobil uygulama, monetizasyon/ödeme entegrasyonu
- Mainnet bağlantısı (kalıcı güvenlik sınırı, geçici eksiklik değil)
- Gerçek 2FA (TOTP/SMS) — yerine step-up auth (şifre tekrarı) var
- BTC/XRP ağ desteği, otomatik master-key rotasyonu, SAST araçları, audit tamper-evidence
- Staging/production ortam ayrımı, bulut dağıtımı, merkezi monitoring/backup

---
Detay: `docs/00_PROJECT_OVERVIEW.md`; `docs/01_DOMAIN_MODEL.md` Terminoloji; `docs/mimari-kararlar.md` §1, §14
