import * as dotenv from "dotenv";
import { type HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

// Bu paket kendi .env'ini okur — apps/api'ninkini değil (Faz 4 §4.4a).
// Değerler apps/api/.env'dekiyle aynı olabilir ama kopyaları ayrıdır.
dotenv.config();

const deployerPrivateKey = process.env.CONTRACT_DEPLOYER_PRIVATE_KEY;
const accounts = deployerPrivateKey ? [deployerPrivateKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Tron Shasta burada YOK — Hardhat Tron ağlarını desteklemez; Shasta deploy'u
    // scripts/deploy-tron.ts içinde tronweb ile ayrı yürür (docs/adr/0001).
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "",
      accounts,
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL ?? "",
      accounts,
    },
  },
};

export default config;
