# @vault/contracts

Vault'ın mock ERC-20 / TRC-20 test token'ları ve deploy araçları (Faz 4 §4.4a).

> **Bu paket `apps/api`'nin runtime bağımlılığı DEĞİLDİR.** Yalnızca bir kerelik
> (veya testnet reset sonrası tekrarlanan) deploy aracıdır. `apps/api` yalnızca
> deploy sonucu `assets.contract_address`'e yazılan adresleri okur.
> Karar: `docs/mimari-kararlar.md` TS-008, `docs/adr/0001-mock-contract-tooling.md`.

## İçerik

| Dosya | Rol |
| --- | --- |
| `contracts/MockERC20.sol` | OZ `ERC20` + `Ownable`; `mint(to, amount) onlyOwner` (docs/01 §2.10) |
| `hardhat.config.ts` | EVM ağ tanımları (`sepolia`, `bscTestnet`) — Tron burada yok |
| `scripts/deploy-evm.ts` | Hardhat + ethers ile Sepolia / BSC Testnet deploy'u |
| `scripts/deploy-tron.ts` | Hardhat'in dışında, `tronweb` ile Tron Shasta deploy'u |
| `scripts/write-contract-addresses.ts` | Adresleri `assets.contract_address`'e yazar (idempotent) |
| `scripts/token-catalog.ts` | Deploy edilecek token seti (seed'deki `assets` ile eşleşir) |

## Kurulum

```bash
cp .env.example .env      # değerleri doldur (docs/09_DEV_WORKFLOW.md §7)
pnpm install
```

`CONTRACT_DEPLOYER_PRIVATE_KEY`, üç ağın faucet'inden fonlanmış bir geliştirme
cüzdanı olmalıdır. Bu cüzdan kontratların `onlyOwner`'ı olur ve Faz 4 §4.4b'de
`POST /admin/mint` bu owner adına `mint()` çağırır — bu yüzden aynı değer
`apps/api/.env`'e `MINT_OPERATOR_PRIVATE_KEY` olarak kopyalanır.

## Deploy akışı

```bash
# 1. Derle (solc'u indirir — ağ erişimi gerekir)
pnpm --filter @vault/contracts run compile

# 2. Üç ağa deploy et, çıktıdaki adresleri ve owner adresini not al
pnpm --filter @vault/contracts run deploy:sepolia
pnpm --filter @vault/contracts run deploy:bsc-testnet
pnpm --filter @vault/contracts run deploy:tron-shasta

# 3. Adresleri contract-addresses.json'a yapıştır (şablon: contract-addresses.example.json)
cp contract-addresses.example.json contract-addresses.json
#    ... düzenle ...

# 4. assets.contract_address'e yaz
pnpm --filter @vault/contracts run write-addresses
```

### Doğrulama

- Block explorer'da (Etherscan Sepolia / BscScan Testnet / Shasta Tronscan)
  kontrat kodunun göründüğünü kontrol et.
- `assets.contract_address`'in üç satırda da dolduğunu sorgula:
  ```sql
  SELECT n.chain_id, a.symbol, a.contract_address
  FROM assets a JOIN networks n ON n.id = a.network_id
  WHERE a.symbol = 'USDT';
  ```

### Testnet reset

Bir ağ reset atarsa deploy adresleri geçersiz kalır
(`docs/10_IMPLEMENTATION_ROADMAP.md` §5). İlgili deploy script'ini yeniden
çalıştır, `contract-addresses.json`'u güncelle, `write-addresses`'i tekrar
çalıştır — script mevcut adresi sessizce üzerine yazar.
