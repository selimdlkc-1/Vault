import { Contract, HDNodeWallet, Interface, JsonRpcProvider, Wallet } from "ethers";

import { MOCK_ERC20_ABI } from "./abi/mock-erc20.abi";
import { assertChainIdAllowed } from "./chain-id-allowlist";
import {
  ChainProviderUnavailableException,
  NotImplementedException,
} from "./exceptions";
import { EVM_COIN_TYPE, derivationPath } from "./hd-wallet";
import type {
  AssetRef,
  BroadcastResult,
  DerivedWallet,
  IChainProvider,
  MintResult,
  RawTransactionInput,
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

/** ERC-20 `transfer` — `signTransaction` token transferinde `data`'yı bununla encode eder. */
const ERC20_TRANSFER_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
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

  /**
   * `input`'tan bir EVM işlemi kurar ve `privateKey` ile imzalar (Faz 5 §5.3).
   * Native coin → `{ to, value }`; ERC-20 → kontrata `transfer(to, amount)`
   * çağrısını taşıyan `{ to: contract, data }`. `Wallet.populateTransaction`
   * eksik alanları (`nonce`, `gasLimit`, fee, `chainId`) RPC'den doldurur; bu bir
   * durum değiştiren zincir çağrısı değildir. `signTransaction` imzalı ham hex'i
   * döner, ağa **göndermez** (broadcast Faz 5 §5.4). Hata `ChainProviderUnavailableException`'a
   * sarılır — `signing` worker'ı bunu `failed`'e çevirir.
   */
  async signTransaction(
    privateKey: string,
    input: RawTransactionInput,
  ): Promise<string> {
    try {
      const wallet = new Wallet(privateKey, this.rpc);
      const request =
        input.asset.contractAddress === null
          ? { to: input.to, value: BigInt(input.amount) }
          : {
              to: input.asset.contractAddress,
              data: new Interface(ERC20_TRANSFER_ABI).encodeFunctionData(
                "transfer",
                [input.to, BigInt(input.amount)],
              ),
            };
      const populated = await wallet.populateTransaction({
        ...request,
        from: input.from,
      });
      return await wallet.signTransaction(populated);
    } catch (error) {
      throw new ChainProviderUnavailableException("EvmProvider.signTransaction", {
        cause: error,
      });
    }
  }

  broadcastTransaction(): Promise<BroadcastResult> {
    throw new NotImplementedException("EvmProvider.broadcastTransaction");
  }

  /**
   * Mock ERC-20 kontratının `mint()`'ini owner cüzdanı adına çağırır ve işlemin
   * madenlenmesini bekler (`docs/03_API_CONTRACTS.md` §5.8). `amountRaw` ethers'a
   * `bigint` olarak verilir — string aritmetiği yok, `number`'a çevrilmez.
   * RPC hatası / `onlyOwner` revert'i (`CALL_EXCEPTION`) tek bir
   * `ChainProviderUnavailableException`'a sarılır.
   */
  async mintToken(
    contractAddress: string,
    toAddress: string,
    amountRaw: string,
    operatorPrivateKey: string,
  ): Promise<MintResult> {
    try {
      const operator = new Wallet(operatorPrivateKey, this.rpc);
      const contract = new Contract(contractAddress, MOCK_ERC20_ABI, operator);
      const tx = (await contract.mint(toAddress, BigInt(amountRaw))) as {
        hash: string;
        wait: () => Promise<{ hash: string } | null>;
      };
      const receipt = await tx.wait();
      return { txHash: receipt?.hash ?? tx.hash };
    } catch (error) {
      throw new ChainProviderUnavailableException("EvmProvider.mintToken", {
        cause: error,
      });
    }
  }
}
