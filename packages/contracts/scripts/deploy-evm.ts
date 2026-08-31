/**
 * MockERC20'yi bir EVM testnet'ine (Sepolia veya BSC Testnet) deploy eder.
 *
 * Çalıştırma (Faz 4 §4.4a, docs/09_DEV_WORKFLOW.md §6 madde 7):
 *   pnpm --filter @vault/contracts run deploy:sepolia
 *   pnpm --filter @vault/contracts run deploy:bsc-testnet
 *
 * Çıktıdaki adresleri contract-addresses.json'a yapıştır, sonra
 * write-contract-addresses.ts ile assets.contract_address'e yaz.
 *
 * Deploy eden cüzdan kontratın onlyOwner'ıdır; adresi not al — bu cüzdanın
 * private key'i apps/api/.env'e MINT_OPERATOR_PRIVATE_KEY olarak kopyalanır
 * (docs/04_BACKEND_SPEC.md §10).
 */
import { ethers, network } from "hardhat";

import { EVM_TOKENS } from "./token-catalog";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();

  console.log(`Ağ: ${network.name}`);
  console.log(`Deploy eden (owner): ${deployer.address}`);
  console.log("---");

  for (const token of EVM_TOKENS) {
    const factory = await ethers.getContractFactory("MockERC20");
    const contract = await factory.deploy(token.name, token.symbol, token.decimals);
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log(`${token.symbol} (${token.decimals} decimals) -> ${address}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
