# ADR 0001 — Mock Kontrat Deploy Tooling: Hardhat + TypeScript

**Durum:** Kabul edildi
**Tarih:** 2026-08-26
**Karar ID:** [TS-008](../mimari-kararlar.md#14-tech-stack)

## Bağlam

`docs/10_IMPLEMENTATION_ROADMAP.md` Faz 4 §4.4, Sepolia/BSC Testnet/Tron Shasta üzerine mock ERC-20/TRC-20 kontratlarının deploy edilmesini ve adreslerinin `assets.contract_address`'e (`docs/02_DATABASE_SCHEMA.md` §2.4) yazılmasını gerektiriyor. Pinned tech stack (`.claude/rules/00-project-identity.md`) hiçbir Solidity derleme/deploy aracı içermiyordu — bu, projeye yeni bir bağımlılık eklenmesi anlamına geliyor ve proje kuralına göre (`CLAUDE.md` "Yeni framework/library eklemek bir ADR gerektirir", `.claude/rules/01-coding-philosophy.md` over-engineering yasağı) bir karar kaydı gerektiriyor.

Bu boşluk, Faz 4'ün faz skill'i (`phase-04-managed-wallet-keys`) üretilirken `phase-creator` araştırma adımında tespit edildi — bir spec çelişkisi değil, eksik bırakılmış bir tech-stack kararıydı.

Değerlendirilen seçenekler:

1. **Hardhat + TypeScript** — ethers v6 ile aynı ekosistem, TS-native deploy script'i, geniş dokümantasyon/topluluk, mevcut monorepo'nun pnpm/TS akışına doğrudan entegre olur.
2. **Foundry** — Solidity-native (forge/cast), derleme hızı yüksek, ama Rust tabanlı ayrı bir CLI kurulumu gerektirir; monorepo'nun pnpm/TS akışına daha az entegre, ekip için ikinci bir araç zinciri öğrenme maliyeti getirir.
3. **Framework'süz minimal script** — yalnızca `solc` (npm paketi) + ethers `ContractFactory`; en az bağımlılık ama artifact/ABI yönetimi elle yapılır, üç ağa (iki EVM + Tron) deploy tekrarını script içinde manuel kurmak gerekir.

## Karar

**Hardhat + TypeScript** seçildi. Yeni bir `packages/contracts` workspace'i eklenir (`docs/mimari-kararlar.md` CODE-001, `.claude/rules/00-project-identity.md` Monorepo Yapısı):

- `MockERC20.sol`, Hardhat ile derlenir ve `ethers` tabanlı bir deploy script'iyle Sepolia ve BSC Testnet'e deploy edilir.
- Aynı derlenmiş bytecode/ABI, Tron Shasta'ya **Hardhat'in dışında**, `tronweb`'in kendi deploy akışıyla (`tronWeb.contract().new()`) ayrı bir script'te deploy edilir — Hardhat Tron ağlarını desteklemediği için bu adım Hardhat'in deploy pipeline'ının parçası değildir.
- Üç ağdaki kontrat adresleri tek bir script ile `assets.contract_address` kolonuna yazılır.
- `packages/contracts`, `apps/api`'nin runtime bağımlılığı **değildir** — yalnızca bir kerelik (veya testnet reset sonrası tekrarlanan) deploy aracıdır; `apps/api` yalnızca deploy sonucu üretilen adresleri okur (`docs/04_BACKEND_SPEC.md` §2).

## Sonuçlar

**Olumlu:**
- ethers v6 ile paylaşılan TypeScript tipleri/araçları; geliştirici deneyimi projenin geri kalanıyla tutarlı.
- Geniş Hardhat plugin ekosistemi (ör. ileride kontrat doğrulama gerekirse `hardhat-verify`), büyük topluluk/dokümantasyon.
- pnpm workspace'e doğrudan entegre olur, ayrı bir araç zinciri kurulumu gerektirmez.

**Olumsuz:**
- Yeni bir workspace + yeni bir bağımlılık grubu (Hardhat, Solidity derleyicisi) eklenmiş olur.
- Tron deploy'u için ayrı, Hardhat-dışı bir script gerekir — tek bir "deploy her yere" komutu yoktur, EVM ve Tron akışları farklı script'lerde yaşar.

**Kabul edilen risk:** Testnet reset'lerinde deploy edilen adreslerin geçersiz kalması riski `docs/10_IMPLEMENTATION_ROADMAP.md` §5 Risk Kaydı'nda zaten kayıtlıdır; merkezi `assets.contract_address` kolonu tek noktadan güncellemeyi mümkün kılar, bu ADR bu riski değiştirmez.

## Cross-ref

`docs/mimari-kararlar.md` TS-008, I-008, CODE-001; `docs/10_IMPLEMENTATION_ROADMAP.md` §4.4a; `docs/04_BACKEND_SPEC.md` §2; `.claude/rules/00-project-identity.md`; `.claude/skills/phase-04-managed-wallet-keys/iterations/04-mock-contract-deploy-infra.md`
