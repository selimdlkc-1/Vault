// Vault — Prisma seed script'i.
// Faz 2 §2.1: Faz 0'da iskeleti kurulan bu script, üç testnet ağı + native
// varlıklar + mock USDT (tüm (network, asset) çiftleri is_active = true) ve
// 1 admin kullanıcı ile dolduruldu. İdempotent upsert kalıbı korunur —
// `pnpm --filter api run seed` istediğiniz kadar tekrar çalıştırılabilir.
//
// Kaynak: docs/02_DATABASE_SCHEMA.md §2.2-2.4 (şema) ve §9 (seed verisi),
//         docs/mimari-kararlar.md I-004 (confirmation threshold), I-008 (mock
//         kontrat deploy'u Faz 4 — bu fazda contract_address NULL kalır),
//         docs/09_DEV_WORKFLOW.md §6.
//
// Not: chain_id string'leri ('11155111', '97', 'shasta') Faz 2 §2.5'te
// eklenecek CHAIN_ID_ALLOWLIST env değeriyle birebir aynı olmalıdır.
import "reflect-metadata";
import { PrismaClient, type Prisma } from "@prisma/client";

import { PasswordService } from "../src/auth/password.service";

const prisma = new PrismaClient();
const passwords = new PasswordService();

// Sabit admin kullanıcı (docs/02 §9). Şifre argon2id ile hash'lenir; düz metin
// yalnızca bu geliştirme seed'inde sabittir, hiçbir zaman persist/log edilmez.
const ADMIN_EMAIL = "admin@vault.local";
const ADMIN_PASSWORD = "Vault-Admin-2026";

// --- Network kataloğu (docs/02 §2.2, §9; threshold: mimari-kararlar I-004) ---
const networks: Prisma.NetworkCreateInput[] = [
  { name: "Sepolia", chainType: "evm", chainId: "11155111", confirmationThreshold: 12 },
  { name: "BSC Testnet", chainType: "evm", chainId: "97", confirmationThreshold: 15 },
  { name: "Tron Shasta", chainType: "tron", chainId: "shasta", confirmationThreshold: 19 },
];

// --- Asset kataloğu (docs/02 §2.3, §9) ---
// Her ağın native varlığı + mock USDT. Mock USDT kontratları Faz 4 §4.4'te
// deploy edilir; o zamana dek contract_address NULL kalır (docs/10 §4.4, I-008).
const assets: Array<{ networkChainId: string; data: Omit<Prisma.AssetCreateInput, "network"> }> = [
  {
    networkChainId: "11155111",
    data: { symbol: "ETH", decimals: 18, contractAddress: null, coingeckoId: "ethereum" },
  },
  {
    networkChainId: "11155111",
    data: { symbol: "USDT", decimals: 6, contractAddress: null, coingeckoId: "tether" },
  },
  {
    networkChainId: "97",
    data: { symbol: "BNB", decimals: 18, contractAddress: null, coingeckoId: "binancecoin" },
  },
  {
    networkChainId: "97",
    data: { symbol: "USDT", decimals: 6, contractAddress: null, coingeckoId: "tether" },
  },
  {
    networkChainId: "shasta",
    data: { symbol: "TRX", decimals: 6, contractAddress: null, coingeckoId: "tron" },
  },
  {
    networkChainId: "shasta",
    data: { symbol: "USDT", decimals: 6, contractAddress: null, coingeckoId: "tether" },
  },
];

async function seedNetworks(): Promise<void> {
  for (const network of networks) {
    await prisma.network.upsert({
      where: { chainId: network.chainId },
      update: network,
      create: network,
    });
  }
}

async function seedAssets(): Promise<void> {
  for (const { networkChainId, data } of assets) {
    const network = await prisma.network.findUniqueOrThrow({ where: { chainId: networkChainId } });

    await prisma.asset.upsert({
      where: { networkId_symbol: { networkId: network.id, symbol: data.symbol } },
      update: data,
      create: { ...data, network: { connect: { id: network.id } } },
    });
  }
}

// Her (network, asset) çifti aktif (docs/02 §9, AP-001/AUTH-003).
async function seedNetworkAssets(): Promise<void> {
  const now = new Date();

  for (const { networkChainId, data } of assets) {
    const network = await prisma.network.findUniqueOrThrow({ where: { chainId: networkChainId } });
    const asset = await prisma.asset.findUniqueOrThrow({
      where: { networkId_symbol: { networkId: network.id, symbol: data.symbol } },
    });

    await prisma.networkAsset.upsert({
      where: { networkId_assetId: { networkId: network.id, assetId: asset.id } },
      update: { isActive: true, activatedAt: now },
      create: { networkId: network.id, assetId: asset.id, isActive: true, activatedAt: now },
    });
  }
}

// Sabit admin kullanıcı (docs/02 §9, mimari-kararlar A-003). Yeniden çalıştırmada
// hash'i tekrar üretip yazmamak için `update` yalnızca rolü sabitler.
async function seedAdminUser(): Promise<void> {
  const passwordHash = await passwords.hash(ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "admin" },
    create: { email: ADMIN_EMAIL, passwordHash, role: "admin" },
  });
}

async function main(): Promise<void> {
  await seedNetworks();
  await seedAssets();
  await seedNetworkAssets();
  await seedAdminUser();
}

main()
  .catch((error: unknown) => {
    console.error("Seed başarısız oldu:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
