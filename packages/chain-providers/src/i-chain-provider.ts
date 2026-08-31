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

/**
 * HD wallet türetmesinin çıktısı (`docs/01_DOMAIN_MODEL.md` §5.1 Managed akışı).
 * `privateKey` yalnızca çağıranın (`WalletsService`) bellek-içi akışına döner;
 * hiçbir log/yanıt/cache'e yazılmaz (`.claude/rules/03-security-baseline.md`
 * madde 1) — `WalletsService` bunu doğrudan `EnvelopeEncryptionService`'e geçirir.
 *
 * `privateKey` biçimi ağ ailesinin imzalama SDK'sının beklediği kanonik biçimdir:
 * EVM için `0x` önekli hex (ethers), Tron için `0x` öneksiz hex (tronweb).
 */
export interface DerivedWallet {
  readonly address: string;
  readonly privateKey: string;
}

export interface IChainProvider {
  /** Hangi implementasyonun kullanıldığını ayırt eder. */
  readonly chainType: ChainType;

  /**
   * `address`'in `asset` cinsinden bakiyesini en küçük birimde (wei/sun)
   * string olarak döner (`balance-sync` worker'ı çağırır, Faz 3 §3.2).
   */
  getBalance(address: string, asset: AssetRef): Promise<string>;

  /**
   * `HD_WALLET_MNEMONIC`'ten `m/44'/<coinType>'/0'/0/<index>` yoluyla bir cüzdan
   * türetir (`docs/01_DOMAIN_MODEL.md` §5.1, `docs/mimari-kararlar.md` W-001).
   * `coinType` implementasyona sabittir: EVM 60, Tron 195. Türetme secp256k1
   * ile zincir-agnostiktir; yalnızca adres kodlaması ağa göre değişir. Senkron —
   * RPC çağrısı yapmaz. `POST /wallets/managed` içinde `WalletsService` çağırır.
   */
  deriveWallet(mnemonic: string, index: number): DerivedWallet;

  /**
   * İmzalı ham işlemi zincire yayınlar ve tx hash'ini döner. Faz 5 dolduracak.
   */
  broadcastTransaction(signedTxHex: string): Promise<BroadcastResult>;
}
