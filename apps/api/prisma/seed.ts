// Vault — Prisma seed script'i.
// Faz 0 §0.5: yalnızca idempotent upsert kalıbının iskeleti. Gerçek network/asset
// kataloğu, admin ve demo kullanıcı verisi Faz 2 §2.1'de bu diziler doldurularak
// eklenir — kalıp (upsert) o zaman da değişmez, yalnızca içerik dolar.
// Kaynak: docs/02_DATABASE_SCHEMA.md §9, docs/09_DEV_WORKFLOW.md §6.
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Faz 2'de doldurulacak: Sepolia/BSC Testnet/Tron Shasta satırları (docs/02 §9).
const networks: Prisma.NetworkCreateInput[] = [];

// Faz 2'de doldurulacak: her ağın native varlığı + mock USDT satırları (docs/02 §9).
const assets: Array<{ networkChainId: string; data: Omit<Prisma.AssetCreateInput, "network"> }> = [];

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

async function main(): Promise<void> {
  await seedNetworks();
  await seedAssets();
}

main()
  .catch((error: unknown) => {
    console.error("Seed başarısız oldu:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
