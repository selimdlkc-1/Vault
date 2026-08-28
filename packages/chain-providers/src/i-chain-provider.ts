// IChainProvider — tüm zincir etkileşimlerinin arkasına gizlendiği soyutlama
// (docs/mimari-kararlar.md I-001). İki implementasyon: `EvmProvider` (ethers v6,
// Sepolia + BSC Testnet aynı kod) ve `TronProvider` (tronweb).
//
// Sayısal tip disiplini (.claude/rules/15-backend-data.md, mimari-kararlar P-015):
// zincir bakiyeleri/tutarları en küçük birimde string olarak taşınır —
// dönüş tipleri asla `number` değildir.

export type ChainType = "evm" | "tron";

/**
 * Bakiyesi sorgulanan varlığın tanımı. Native varlık (ETH/BNB/TRX) için
 * `contractAddress` null'dır; ERC-20/TRC-20 token için kontrat adresidir.
 */
export interface AssetRef {
  readonly contractAddress: string | null;
  readonly decimals: number;
}

export interface BroadcastResult {
  /** Zincire yayınlanan işlemin hash'i. */
  readonly txHash: string;
}

export interface IChainProvider {
  /** Hangi implementasyonun kullanıldığını ayırt eder. */
  readonly chainType: ChainType;

  /**
   * `address`'in `asset` cinsinden bakiyesini en küçük birimde (wei/sun)
   * string olarak döner. Faz 3 §3.2 dolduracak.
   */
  getBalance(address: string, asset: AssetRef): Promise<string>;

  /**
   * İmzalı ham işlemi zincire yayınlar ve tx hash'ini döner. Faz 5 dolduracak.
   */
  broadcastTransaction(signedTxHex: string): Promise<BroadcastResult>;
}
