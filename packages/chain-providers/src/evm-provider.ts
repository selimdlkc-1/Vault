import { Contract, HDNodeWallet, JsonRpcProvider } from "ethers";

import { assertChainIdAllowed } from "./chain-id-allowlist";
import { NotImplementedException } from "./exceptions";
import { EVM_COIN_TYPE, derivationPath } from "./hd-wallet";
import type {
  AssetRef,
  BroadcastResult,
  DerivedWallet,
  IChainProvider,
} from "./i-chain-provider";

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

/**
 * Minimal ERC-20 ABI — yalnızca `balanceOf` okuması. Transfer/allowance vb.
 * imzalama akışı Faz 5'e aittir, bu fazda kapsam dışıdır.
 */
const ERC20_BALANCE_OF_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
] as const;

export class EvmProvider implements IChainProvider {
  readonly chainType = "evm" as const;

  private readonly rpc: JsonRpcProvider;

  constructor(network: EvmNetworkConfig, allowlist: readonly string[]) {
    assertChainIdAllowed(network.chainId, allowlist);

    this.rpc = new JsonRpcProvider(network.rpcUrl);
  }

  /**
   * `address`'in `asset` cinsinden bakiyesini en küçük birimde (wei) string
   * olarak döner (docs/mimari-kararlar.md I-002 — EVM: RPC). Native varlık
   * (`contractAddress === null`) için `eth_getBalance`; ERC-20 için kontratın
   * `balanceOf` view çağrısı. Dönüş her zaman `bigint.toString()` — asla
   * `number` (`.claude/rules/13-critical-modules.md`, P-015).
   */
  async getBalance(address: string, asset: AssetRef): Promise<string> {
    if (asset.contractAddress === null) {
      const balance = await this.rpc.getBalance(address);
      return balance.toString();
    }

    const contract = new Contract(asset.contractAddress, ERC20_BALANCE_OF_ABI, this.rpc);
    const balance = (await contract.balanceOf(address)) as bigint;
    return balance.toString();
  }

  /**
   * `m/44'/60'/0'/0/<index>` yoluyla EVM cüzdanı türetir (Sepolia + BSC Testnet
   * ortak coinType 60). Adres EIP-55 checksum'lı, `privateKey` `0x` önekli hex
   * (ethers kanonik biçimi). RPC çağrısı yapmaz.
   */
  deriveWallet(mnemonic: string, index: number): DerivedWallet {
    const node = HDNodeWallet.fromPhrase(
      mnemonic,
      undefined,
      derivationPath(EVM_COIN_TYPE, index),
    );
    return { address: node.address, privateKey: node.privateKey };
  }

  broadcastTransaction(): Promise<BroadcastResult> {
    throw new NotImplementedException("EvmProvider.broadcastTransaction");
  }
}
