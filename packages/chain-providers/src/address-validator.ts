import { isAddress as isEvmAddress } from "ethers";
import { TronWeb } from "tronweb";

import type { ChainType } from "./i-chain-provider";

/**
 * Ağa özel adres format doğrulaması (`docs/mimari-kararlar.md` §6 [W-001],
 * `docs/08_TESTING_STRATEGY.md` §4 senaryo #12). Tek bir ortak regex
 * **kullanılmaz** — her ağ ailesi kendi kanonik format kontrolünü uygular:
 *
 * - **EVM** (Sepolia, BSC Testnet): `0x` + 40 hex; karışık büyük/küçük harf
 *   kullanıldıysa EIP-55 checksum doğrulanır, tamamı küçük/büyük harfse
 *   standart davranışla kabul edilir (EIP-55 spesifikasyonunun kendisi böyledir,
 *   bkz. iterasyon "Risk / dikkat" notu). `ethers.isAddress()` `0x` öneki
 *   olmadan da 40 hex'i kabul ettiğinden, öneki burada ayrıca zorunlu kılıyoruz.
 * - **Tron** (Shasta): `T` ile başlayan base58check adres (`tronweb`'in
 *   `TronWeb.isAddress()` yardımcısı). Bu yardımcı 42 karakterlik hex `41...`
 *   biçimini de kabul ettiğinden, `T` önekini ayrıca zorunlu kılıyoruz.
 *
 * `IChainProvider` arayüzüne dokunulmaz — bu bağımsız, dışa aktarılan bir
 * yardımcıdır; `apps/api` `WalletsService` (Faz 3 §3.1) ve ileride transfer
 * hedef adresi doğrulaması bunu çağırır.
 */
export function isValidAddress(chainType: ChainType, address: string): boolean {
  if (typeof address !== "string" || address.length === 0) {
    return false;
  }

  if (chainType === "evm") {
    return address.startsWith("0x") && isEvmAddress(address);
  }

  if (chainType === "tron") {
    return address.startsWith("T") && TronWeb.isAddress(address);
  }

  return false;
}
