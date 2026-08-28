import { JsonRpcProvider } from "ethers";

import { assertChainIdAllowed } from "./chain-id-allowlist";
import { NotImplementedException } from "./exceptions";
import type { BroadcastResult, IChainProvider } from "./i-chain-provider";

/**
 * EVM ağ yapılandırması. Sepolia ve BSC Testnet aynı `EvmProvider` kodunu
 * paylaşır (docs/mimari-kararlar.md I-001) — yalnızca bu config değişir.
 */
export interface EvmNetworkConfig {
  /** Ağın `chain_id` değeri; Sepolia "11155111", BSC Testnet "97". */
  readonly chainId: string;
  /** Testnet JSON-RPC endpoint URL'i. */
  readonly rpcUrl: string;
}

export class EvmProvider implements IChainProvider {
  readonly chainType = "evm" as const;

  private readonly rpc: JsonRpcProvider;

  constructor(network: EvmNetworkConfig, allowlist: readonly string[]) {
    assertChainIdAllowed(network.chainId, allowlist);

    // Bu iterasyonda provider yalnızca saklanır; gerçek RPC çağrısı Faz 3 §3.2
    // (getBalance) ve Faz 5 (broadcastTransaction) ile eklenecek.
    this.rpc = new JsonRpcProvider(network.rpcUrl);
  }

  // Stub imzaları bilinçli olarak parametresizdir — arayüz sözleşmesi (daha az
  // parametre alan bir metot atanabilir) korunur, gövde Faz 3 §3.2 / Faz 5
  // tarafından tam imzayla doldurulacaktır.
  getBalance(): Promise<string> {
    throw new NotImplementedException("EvmProvider.getBalance");
  }

  broadcastTransaction(): Promise<BroadcastResult> {
    throw new NotImplementedException("EvmProvider.broadcastTransaction");
  }
}
