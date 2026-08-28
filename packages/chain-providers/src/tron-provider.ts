import { TronWeb } from "tronweb";

import { assertChainIdAllowed } from "./chain-id-allowlist";
import { NotImplementedException } from "./exceptions";
import type { BroadcastResult, IChainProvider } from "./i-chain-provider";

/**
 * Tron ağ yapılandırması. Tron Shasta, EVM ağlarından ayrı bir SDK (tronweb)
 * ve ayrı adres formatı kullandığından kendi implementasyon sınıfındadır
 * (docs/mimari-kararlar.md I-001).
 */
export interface TronNetworkConfig {
  /** Ağın `chain_id` değeri; Tron Shasta için "shasta". */
  readonly chainId: string;
  /** Shasta full-node HTTP endpoint'i (ör. TronGrid). */
  readonly rpcUrl: string;
}

export class TronProvider implements IChainProvider {
  readonly chainType = "tron" as const;

  private readonly tronWeb: TronWeb;

  constructor(network: TronNetworkConfig, allowlist: readonly string[]) {
    assertChainIdAllowed(network.chainId, allowlist);

    // Bu iterasyonda istemci yalnızca saklanır; gerçek çağrılar Faz 3 §3.2
    // (getBalance) ve Faz 5 (broadcastTransaction) ile eklenecek.
    this.tronWeb = new TronWeb({ fullHost: network.rpcUrl });
  }

  // Stub imzaları bilinçli olarak parametresizdir — arayüz sözleşmesi korunur,
  // gövde Faz 3 §3.2 / Faz 5 tarafından tam imzayla doldurulacaktır.
  getBalance(): Promise<string> {
    throw new NotImplementedException("TronProvider.getBalance");
  }

  broadcastTransaction(): Promise<BroadcastResult> {
    throw new NotImplementedException("TronProvider.broadcastTransaction");
  }
}
