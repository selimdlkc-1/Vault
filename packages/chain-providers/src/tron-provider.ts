import { HDNodeWallet } from "ethers";
import { TronWeb, Types } from "tronweb";

import { MOCK_TRC20_ABI } from "./abi/mock-erc20.abi";
import { assertChainIdAllowed } from "./chain-id-allowlist";
import { ChainProviderUnavailableException } from "./exceptions";
import { TRON_COIN_TYPE, derivationPath } from "./hd-wallet";
import type {
  AssetRef,
  BroadcastResult,
  DerivedWallet,
  IChainProvider,
  MintResult,
  RawTransactionInput,
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

  /** `mintToken` imzalama için ayrı, private key'li bir `TronWeb` kurabilmek üzere saklanır. */
  private readonly fullHost: string;

  constructor(network: TronNetworkConfig, allowlist: readonly string[]) {
    assertChainIdAllowed(network.chainId, allowlist);

    this.fullHost = network.rpcUrl;
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

  /**
   * `input`'tan bir Tron işlemi kurar ve `privateKey` ile imzalar (Faz 5 §5.3).
   * Native TRX → `transactionBuilder.sendTrx`; TRC-20 → `transfer(address,uint256)`
   * için `triggerSmartContract`. İmzalama, paylaşılan `tronWeb` mutate edilmeden
   * private key'li ayrı bir `TronWeb` örneğiyle yapılır (`mintToken` kalıbı).
   * `trx.sign` imzalı işlem nesnesini döner; serialize edilmiş JSON'ı döndürülür —
   * ağa **gönderilmez** (broadcast Faz 5 §5.4). Hata `ChainProviderUnavailableException`'a
   * sarılır — `signing` worker'ı bunu `failed`'e çevirir.
   */
  async signTransaction(
    privateKey: string,
    input: RawTransactionInput,
  ): Promise<string> {
    try {
      const signer = new TronWeb({ fullHost: this.fullHost, privateKey });

      let unsigned;
      if (input.asset.contractAddress === null) {
        // `sendTrx` sun tutarını `number` bekler — tronweb SDK sınırı; testnet
        // demo tutarları güvenli tamsayı aralığındadır (P-015 sınır notu).
        unsigned = await signer.transactionBuilder.sendTrx(
          input.to,
          Number(input.amount),
          input.from,
        );
      } else {
        const wrapper = await signer.transactionBuilder.triggerSmartContract(
          input.asset.contractAddress,
          "transfer(address,uint256)",
          {},
          [
            { type: "address", value: input.to },
            { type: "uint256", value: input.amount },
          ],
          input.from,
        );
        unsigned = wrapper.transaction;
      }

      const signed = await signer.trx.sign(unsigned, privateKey);
      return JSON.stringify(signed);
    } catch (error) {
      throw new ChainProviderUnavailableException(
        "TronProvider.signTransaction",
        { cause: error },
      );
    }
  }

  /**
   * `signTransaction`'ın serialize ettiği imzalı işlemi (`JSON.stringify`)
   * çözer ve `trx.sendRawTransaction` ile Shasta full-node'una yayınlar; işlem
   * id'sini (`txid`) döner — blok onayını beklemez (Faz 5 §5.4). tronweb
   * başarısız yayında exception fırlatmayıp `{ result: false, code, message }`
   * dönebildiğinden, bu durum da açıkça exception'a çevrilir. Tüm hatalar
   * `ChainProviderUnavailableException`'a `{ cause }` ile sarılır; `broadcast`
   * worker'ı `cause`'u `classifyRpcError` ile sınıflandırır (`code` alanı
   * `SIGERROR`/`CONTRACT_VALIDATE_ERROR` gibi kalıcı hataları ayırt etmede
   * kullanılır).
   */
  async broadcastTransaction(signedTxJson: string): Promise<BroadcastResult> {
    try {
      const signed = JSON.parse(signedTxJson) as Types.SignedTransaction;
      const result = await this.tronWeb.trx.sendRawTransaction(signed);
      if (!result.result) {
        const detail = result.code
          ? `${result.code}: ${result.message ?? ""}`.trim()
          : "Tron sendRawTransaction sonucu result:false döndü.";
        // `code`'u koruyan bir hata — `classifyRpcError` bunu `cause` üzerinden okur.
        throw Object.assign(new Error(detail), { code: result.code });
      }
      return { txHash: result.txid };
    } catch (error) {
      throw new ChainProviderUnavailableException(
        "TronProvider.broadcastTransaction",
        { cause: error },
      );
    }
  }

  /**
   * Mock TRC-20 kontratının `mint()`'ini owner cüzdanı adına çağırır (`docs/03`
   * §5.8). İmzalama için constructor'daki paylaşılan `tronWeb` mutate edilmez —
   * private key'li ayrı bir `TronWeb` örneği kurulur. `amountRaw` kontrata
   * `bigint` olarak verilir (tronweb `Numbers = bigint | number`) — `number`'a
   * daraltılmaz. TronGrid hatası / revert → `ChainProviderUnavailableException`.
   */
  async mintToken(
    contractAddress: string,
    toAddress: string,
    amountRaw: string,
    operatorPrivateKey: string,
  ): Promise<MintResult> {
    try {
      const signer = new TronWeb({
        fullHost: this.fullHost,
        privateKey: operatorPrivateKey,
      });
      const contract = signer.contract(MOCK_TRC20_ABI, contractAddress);
      const txHash = (await contract
        .mint(toAddress, BigInt(amountRaw))
        .send()) as string;
      return { txHash };
    } catch (error) {
      throw new ChainProviderUnavailableException("TronProvider.mintToken", {
        cause: error,
      });
    }
  }
}
