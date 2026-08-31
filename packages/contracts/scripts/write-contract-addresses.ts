/**
 * Deploy script'lerinin ürettiği kontrat adreslerini `assets.contract_address`
 * kolonuna yazar (docs/02_DATABASE_SCHEMA.md §2.3, docs/mimari-kararlar.md I-008).
 *
 * Akış (Faz 4 §4.4a):
 *   1. deploy-evm.ts / deploy-tron.ts çıktısındaki adresleri
 *      `contract-addresses.json` dosyasına elle yapıştır
 *      (şablon: `contract-addresses.example.json`).
 *   2. pnpm --filter @vault/contracts run write-addresses
 *
 * İdempotenttir: mevcut bir `contract_address`'i sessizce üzerine yazar, hata
 * vermez — testnet reset sonrası yeniden deploy edilip tekrar çalıştırılabilir
 * (docs/10_IMPLEMENTATION_ROADMAP.md §5 Risk Kaydı).
 *
 * Bu, `packages/contracts`'ın apps/api Prisma client'ına bağımlı olduğu TEK
 * yerdir — bir deploy aracıdır, runtime kodu değildir (docs/adr/0001).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const INPUT_PATH = path.resolve(__dirname, "..", "contract-addresses.json");

interface ContractAddressEntry {
  /** `networks.chain_id` ile birebir aynı ("11155111" | "97" | "shasta") */
  chainId: string;
  /** `assets.symbol` ("USDT") */
  symbol: string;
  /** Deploy edilen kontrat adresi (EVM: 0x..., Tron: base58 T...) */
  address: string;
}

function readEntries(): ContractAddressEntry[] {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(
      `Girdi dosyası yok: ${INPUT_PATH}\n` +
        "contract-addresses.example.json'u kopyalayıp deploy çıktısındaki adreslerle doldur.",
    );
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("contract-addresses.json bir dizi olmalı: [{ chainId, symbol, address }]");
  }

  return parsed.map((raw, index): ContractAddressEntry => {
    const entry = raw as Partial<ContractAddressEntry>;
    if (!entry.chainId || !entry.symbol || !entry.address) {
      throw new Error(`Girdi[${index}] eksik alan içeriyor: chainId, symbol ve address zorunlu`);
    }
    return { chainId: entry.chainId, symbol: entry.symbol, address: entry.address };
  });
}

async function main(): Promise<void> {
  const entries = readEntries();
  const prisma = new PrismaClient();

  try {
    for (const entry of entries) {
      const network = await prisma.network.findUnique({ where: { chainId: entry.chainId } });
      if (!network) {
        throw new Error(`networks.chain_id = '${entry.chainId}' bulunamadı (seed çalıştı mı?)`);
      }

      const asset = await prisma.asset.findUnique({
        where: { networkId_symbol: { networkId: network.id, symbol: entry.symbol } },
      });
      if (!asset) {
        throw new Error(`assets satırı yok: network '${entry.chainId}', symbol '${entry.symbol}'`);
      }

      await prisma.asset.update({
        where: { id: asset.id },
        data: { contractAddress: entry.address },
      });

      console.log(`${entry.chainId} / ${entry.symbol} -> ${entry.address}`);
    }

    console.log(`\n${entries.length} asset güncellendi.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
