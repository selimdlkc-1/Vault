### İterasyon 4 — Mock Kontrat + Deploy Altyapısı (§4.4a)

**Hedef:** `MockERC20.sol`, Hardhat ile derlenip Sepolia ve BSC Testnet'e deploy ediliyor; aynı bytecode `tronweb` ile Tron Shasta'ya ayrı bir script'te deploy ediliyor; üç adres `assets.contract_address`'e yazılıyor.

**Teslim çıktısı:**
- Yeni workspace: `packages/contracts/` (`package.json`, `hardhat.config.ts`, `tsconfig.json`, `.env.example`)
- `packages/contracts/contracts/MockERC20.sol`
- `packages/contracts/scripts/{deploy-evm.ts, deploy-tron.ts, write-contract-addresses.ts}`

**Önkoşullar:**
- [ ] İterasyon 3 Stop tamam
- [ ] `docs/mimari-kararlar.md` TS-008 ve `docs/adr/0001-mock-contract-tooling.md` onaylandı (bu iterasyon o kararın uygulamasıdır)

**Docs okuma sırası:**
1. `docs/10_IMPLEMENTATION_ROADMAP.md` §4.4 (a kısmı) — kapsam
2. `docs/mimari-kararlar.md` TS-008, `docs/adr/0001-mock-contract-tooling.md` — tooling kararı ve gerekçesi
3. `docs/02_DATABASE_SCHEMA.md` §2.4 `assets.contract_address` — native varlıkta `NULL`, kontrat tabanlıda deploy adresi
4. `docs/09_DEV_WORKFLOW.md` §6 madde 7, §7 — kurulum adımı ve `HD_WALLET_MNEMONIC` benzeri secret temini deseni (bu iterasyonun kendi `CONTRACT_DEPLOYER_PRIVATE_KEY`'i için aynı desen)

**Uygulama planı:**
1. `git-phase-branch` ile `feat/mock-contract-deploy-infra` branch'i aç.
2. `packages/contracts/`: `pnpm init`, Hardhat + TypeScript + `@openzeppelin/contracts` (yalnızca bu paketin `devDependencies`'i — `apps/api` bu paketi runtime'da import etmez, `docs/04_BACKEND_SPEC.md` §2 notu) kur; `hardhat.config.ts`'te üç ağ tanımlanır: `sepolia`, `bscTestnet` (ikisi de `SEPOLIA_RPC_URL`/`BSC_TESTNET_RPC_URL` + `CONTRACT_DEPLOYER_PRIVATE_KEY` okur — bu paketin kendi `.env`'inden, `apps/api`'ninkinden değil).
3. `contracts/MockERC20.sol`: OpenZeppelin `ERC20` + `Ownable`'dan türeyen, `symbol`/`name` constructor parametreli, `mint(address to, uint256 amount) external onlyOwner` fonksiyonlu minimal bir kontrat — `docs/01_DOMAIN_MODEL.md` §2.10 MintOperation'ın "ilgili mock kontratın `mint()` fonksiyonu çağrılır" tanımına birebir karşılık gelir.
4. `scripts/deploy-evm.ts`: Hardhat + ethers `ContractFactory` ile `MockERC20`'yi hem `sepolia` hem `bscTestnet` network'üne deploy eder (`npx hardhat run --network sepolia` / `--network bscTestnet`), her ikisi için deploy edilen adresi konsola yazar.
5. `scripts/deploy-tron.ts`: **Hardhat'in dışında**, doğrudan `tronweb` ile çalışır — Hardhat'in derlediği `MockERC20` artifact'ının (ABI + bytecode) `tronWeb.contract().new({ abi, bytecode, ... })` ile Tron Shasta'ya deploy edilmesi (Hardhat Tron ağlarını desteklemediği için ayrı script, `docs/adr/0001` notu).
6. `scripts/write-contract-addresses.ts`: üç deploy script'inin çıktısı olan adresleri (manuel olarak bir küçük JSON/env dosyasına yapıştırılır) okuyup, ilgili `assets` satırlarının `contract_address` kolonunu (`network` + `symbol` eşleşmesiyle) günceller — `apps/api/prisma`'nın Prisma client'ını kullanan küçük, tek seferlik bir script (`packages/contracts`'tan `apps/api`'nin Prisma client'ına bağımlılık, yalnızca bu script'te — runtime kodunda değil).
7. `packages/contracts/.env.example`: `CONTRACT_DEPLOYER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `BSC_TESTNET_RPC_URL`, `TRON_SHASTA_RPC_URL` (değerler `apps/api/.env`'dekiyle aynı olabilir ama bu paket kendi kopyasını okur); `.gitignore`'a `packages/contracts/.env` eklenir.
8. Üç ağda gerçek deploy'u manuel çalıştır (`docs/09` §6 madde 7), adresleri doğrula (block explorer'da kontrat kodu göründüğünü kontrol et), `write-contract-addresses.ts`'i çalıştırıp `assets.contract_address`'in dolduğunu manuel sorgula.
9. PR aç.

**Dosya kapsamı:**

| İşlem | Path |
| ----- | ---- |
| Oluştur | `packages/contracts/**` (yeni workspace) |
| Güncelle | kök `pnpm-workspace.yaml` (yeni paket eklenir), `turbo.json` (varsa `contracts` için `build` task'ı) |
| Dokunma | `apps/api` runtime kodu (bu iterasyonda değişmez — yalnızca sonraki iterasyonda `assets.contract_address` okunur) |

**Spec → kod eşlemesi:**

| Gereksinim | Docs referansı | Uygulama notu |
| ---------- | -------------- | ------------- |
| Mock ERC-20/TRC-20 üç ağa deploy | `docs/10` §4.4, `mimari-kararlar` I-008 | Aynı bytecode, EVM'de Hardhat, Tron'da `tronweb` |
| Kontrat adresleri `assets.contract_address`'e yazılır | `docs/02` §2.4 | `write-contract-addresses.ts` |
| Hardhat + TypeScript tooling | `mimari-kararlar` TS-008 | `packages/contracts` workspace |

**Kalite kapıları:**
- [ ] `MockERC20.sol` Hardhat ile derleniyor (`pnpm --filter contracts run compile`)
- [ ] Üç ağda gerçek deploy manuel doğrulandı (block explorer'da kontrat kodu görünür)
- [ ] `assets.contract_address` üç satırda da dolu (manuel DB sorgusu)
- [ ] lint/typecheck yeşil (`packages/contracts` da kök ESLint/TS config'ini kullanır — `packages/config`)

**Bu iterasyonda yok:** `mint_operations` tablosu, `POST /admin/mint` (İterasyon 5); Solidity kontratının kendi unit testleri (`docs/08_TESTING_STRATEGY.md` kapsamı yalnızca TypeScript kodunu hedefler; bir mock kontratın Hardhat/Chai testleri bu projenin kritik modül tanımına girmez, over-engineering sayılır — bkz. Risk).

**Risk / dikkat:** Testnet reset'lerinde deploy edilen adreslerin geçersiz kalması bilinen bir dış risktir (`docs/10_IMPLEMENTATION_ROADMAP.md` §5 Risk Kaydı); bu durumda İterasyon 4'ün deploy script'leri yeniden çalıştırılır, `write-contract-addresses.ts` idempotent olacak şekilde yazılmalıdır (mevcut `contract_address`'i sessizce üzerine yazar, hata vermez). `CONTRACT_DEPLOYER_PRIVATE_KEY`'in gerçek bir testnet faucet'inden fonlanmış olması gerekir — bu bir uygulama sırrı değil, yalnızca deploy zamanı ihtiyaç duyulan bir araçtır; `MASTER_ENCRYPTION_KEY`/`HD_WALLET_MNEMONIC` ile karıştırılmamalıdır. **Önemli:** Deploy eden cüzdan aynı zamanda kontratın `onlyOwner`'ıdır ve İterasyon 5'in `POST /admin/mint`'i çalışma zamanında `mint()`'i bu owner adına çağırmak zorundadır — bu yüzden bu iterasyonda kullanılan `CONTRACT_DEPLOYER_PRIVATE_KEY` değeri, İterasyon 5'te `apps/api/.env`'e `MINT_OPERATOR_PRIVATE_KEY` adıyla **aynen kopyalanmalıdır** (`docs/04_BACKEND_SPEC.md` §10). Deploy sırasında bu adresi not al.

**Stop:**
- [ ] `pnpm --filter contracts run compile`
- [ ] Üç ağda manuel deploy doğrulaması
- [ ] PR/onay → İterasyon 5
