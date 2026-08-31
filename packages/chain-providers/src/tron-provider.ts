import { HDNodeWallet } from "ethers";
import { TronWeb } from "tronweb";

import { assertChainIdAllowed } from "./chain-id-allowlist";
import { NotImplementedException } from "./exceptions";
import { TRON_COIN_TYPE, derivationPath } from "./hd-wallet";
import type {
  AssetRef,
  BroadcastResult,
  DerivedWallet,
  IChainProvider,
} from "./i-chain-provider";

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

/** Minimal TRC-20 ABI — yalnızca `balanceOf` okuması (bkz. EvmProvider notu). */
const TRC20_BALANCE_OF_ABI = [
  {
    constant: true,
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export class TronProvider implements IChainProvider {
  readonly chainType = "tron" as const;

  private readonly tronWeb: TronWeb;

  constructor(network: TronNetworkConfig, allowlist: readonly string[]) {
    assertChainIdAllowed(network.chainId, allowlist);

    this.tronWeb = new TronWeb({ fullHost: network.rpcUrl });
  }

  /**
   * `address`'in `asset` cinsinden bakiyesini en küçük birimde (sun) string
   * olarak döner (docs/mimari-kararlar.md I-002 — Tron: TronGrid). Native TRX
   * için `trx.getBalance`; TRC-20 için kontratın `balanceOf` constant çağrısı.
   * tronweb `getBalance` bir JS `number` döndürdüğünden değer hemen `BigInt`'e
   * genişletilir; sonuç asla `number` olarak dışa verilmez (P-015).
   */
  async getBalance(address: string, asset: AssetRef): Promise<string> {
    if (asset.contractAddress === null) {
      const balanceSun = await this.tronWeb.trx.getBalance(address);
      return BigInt(balanceSun).toString();
    }

    const contract = this.tronWeb.contract(TRC20_BALANCE_OF_ABI, asset.contractAddress);
    // Constant çağrı için `from` verilir — aksi halde tronweb "owner address is
    // not set" hatası verebilir; sorgulanan adres owner olarak yeterlidir.
    const raw: unknown = await contract.balanceOf(address).call({ from: address });
    return BigInt((raw as { toString(): string }).toString()).toString();
  }

  /**
   * `m/44'/195'/0'/0/<index>` yoluyla Tron cüzdanı türetir. Türetme secp256k1
   * ile EVM ile aynıdır (`HDNodeWallet.fromPhrase` zincir-agnostik); yalnızca
   * çıkan raw private key `TronWeb.address.fromPrivateKey()` ile Tron
   * base58check adresine kodlanır. `privateKey` `0x` öneksiz hex (tronweb
   * kanonik biçimi). RPC çağrısı yapmaz.
   */
  deriveWallet(mnemonic: string, index: number): DerivedWallet {
    const node = HDNodeWallet.fromPhrase(
      mnemonic,
      undefined,
      derivationPath(TRON_COIN_TYPE, index),
    );
    const privateKey = node.privateKey.slice(2);
    const address = TronWeb.address.fromPrivateKey(privateKey);
    if (address === false) {
      throw new Error("Tron adresi türetilemedi (geçersiz private key).");
    }
    return { address, privateKey };
  }

  broadcastTransaction(): Promise<BroadcastResult> {
    throw new NotImplementedException("TronProvider.broadcastTransaction");
  }
}
