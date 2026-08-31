/**
 * MockERC20'yi (aynı derlenmiş bytecode) Tron Shasta'ya deploy eder.
 *
 * Hardhat'in DIŞINDA çalışır — Hardhat Tron ağlarını desteklemez, bu yüzden
 * deploy doğrudan tronweb ile yapılır (docs/adr/0001-mock-contract-tooling.md).
 * Önce `pnpm --filter @vault/contracts run compile` ile artifact üretilmiş olmalı.
 *
 * Çalıştırma:
 *   pnpm --filter @vault/contracts run deploy:tron-shasta
 */
import * as fs from "node:fs";
import * as path from "node:path";

import * as dotenv from "dotenv";
import { TronWeb, type Types } from "tronweb";

import { TRON_TOKENS } from "./token-catalog";

dotenv.config();

const ARTIFACT_PATH = path.resolve(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "MockERC20.sol",
  "MockERC20.json",
);

interface HardhatArtifact {
  abi: Types.ContractAbiInterface;
  bytecode: string;
}

async function main(): Promise<void> {
  const fullHost = process.env.TRON_SHASTA_RPC_URL;
  const rawPrivateKey = process.env.CONTRACT_DEPLOYER_PRIVATE_KEY;

  if (!fullHost || !rawPrivateKey) {
    throw new Error("TRON_SHASTA_RPC_URL ve CONTRACT_DEPLOYER_PRIVATE_KEY .env'de tanımlı olmalı");
  }

  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error(`Artifact bulunamadı: ${ARTIFACT_PATH} — önce 'run compile' çalıştır`);
  }

  // tronweb 0x öneksiz private key bekler (packages/chain-providers/tron-provider ile aynı kural).
  const privateKey = rawPrivateKey.replace(/^0x/, "");
  const trongridApiKey = process.env.TRONGRID_API_KEY;

  const tronWeb = new TronWeb({
    fullHost,
    privateKey,
    headers: trongridApiKey ? { "TRON-PRO-API-KEY": trongridApiKey } : undefined,
  });

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8")) as HardhatArtifact;
  const deployerAddress = tronWeb.defaultAddress.base58;

  console.log("Ağ: tron-shasta");
  console.log(`Deploy eden (owner): ${String(deployerAddress)}`);
  console.log("---");

  for (const token of TRON_TOKENS) {
    const instance = await tronWeb.contract().new({
      abi: artifact.abi,
      bytecode: artifact.bytecode.replace(/^0x/, ""),
      feeLimit: 1_500_000_000,
      parameters: [token.name, token.symbol, token.decimals],
    });

    const base58Address = tronWeb.address.fromHex(instance.address as string);
    console.log(`${token.symbol} (${token.decimals} decimals) -> ${base58Address}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
