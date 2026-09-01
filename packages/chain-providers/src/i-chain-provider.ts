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
 * `confirmation` worker'ının (Faz 5 §5.5) blok derinliği izlemek için okuduğu
 * ağ-agnostik işlem makbuzu.
 *
 * - `status: 'pending'` → işlem henüz bir bloğa girmedi (`blockNumber`/`blockHash`
 *   `null`). Bir bloğa girmişken sonradan `pending`'e dönmesi bir reorg işaretidir.
 * - `status: 'success'` → işlem bir bloğa girdi ve execution başarılı.
 * - `status: 'reverted'` → işlem bir bloğa girdi ama execution revert etti (EVM) /
 *   `FAILED` sonucu döndü (Tron) → worker `confirming → failed`.
 *
 * `currentBlockHeight` her çağrıda taze okunur; onay derinliği
 * `currentBlockHeight - blockNumber` ile **her poll turunda yeniden** hesaplanır
 * (reorg sonrası sayaç sıfırlanmaz, `docs/mimari-kararlar.md` I-007). `blockHash`
 * yalnızca EVM'de doludur — Tron tarafında reorg riski confirmation eşiğiyle
 * pratikte sıfırdır (I-007), `TronProvider` bu alanı `null` döner.
 */
export interface TransactionReceipt {
  readonly status: "pending" | "success" | "reverted";
  readonly blockNumber: number | null;
  readonly blockHash: string | null;
  readonly currentBlockHeight: number;
}

/**
 * `signing` worker'ının `IChainProvider.signTransaction()`'a geçirdiği ağ-agnostik
 * transfer tanımı (Faz 5 §5.3). Ağa özel ham işlem yapısı (EVM `TransactionRequest`,
 * Tron `transactionBuilder` çıktısı) implementasyonun içinde kurulur — worker bu
 * ayrıntıyı bilmez. `asset.contractAddress === null` → native coin transferi
 * (ETH/BNB/TRX); dolu → ERC-20/TRC-20 `transfer(to, amount)` çağrısı.
 */
export interface RawTransactionInput {
  /** Gönderen managed cüzdanın adresi. */
  readonly from: string;
  /** Kullanıcının girdiği hedef adres. */
  readonly to: string;
  /** Transfer tutarı, en küçük birimde (wei/sun) BigInt string — asla JS `number`. */
  readonly amount: string;
  /** Transfer edilen varlık; `contractAddress === null` ise native coin. */
  readonly asset: AssetRef;
}

export interface MintResult {
  /** Mock kontratın `mint()` çağrısının onaylanmış işlem hash'i. */
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
   * `input`'tan ağa özel bir ham işlem kurar, `privateKey` ile imzalar ve imzalı
   * ham işlemi (EVM: `0x`-önekli hex; Tron: serialize edilmiş imzalı işlem JSON'ı)
   * döner — **ağa göndermez** (`docs/01_DOMAIN_MODEL.md` §5.2 `pending_signature →
   * signed`). `signing` worker'ı çağırır; `privateKey` yalnızca çağrı süresince
   * bellekte tutulur, hiçbir log'a yazılmaz (`.claude/rules/03-security-baseline.md`
   * madde 1). İmzalama başarısızsa `ChainProviderUnavailableException` fırlatır —
   * worker bunu doğrudan `failed`'e çevirir (BullMQ retry yok, `docs/01` §5.2).
   */
  signTransaction(privateKey: string, input: RawTransactionInput): Promise<string>;

  /**
   * `signing` worker'ının ürettiği imzalı ham işlemi (`signTransaction` çıktısı —
   * EVM: `0x`-önekli hex; Tron: `JSON.stringify` edilmiş imzalı işlem) zincire
   * yayınlar ve mempool'a giren işlemin hash'ini döner — blok onayını **beklemez**
   * (o Faz 5 §5.5 confirmation worker'ı). `broadcast` worker'ı çağırır
   * (`docs/01_DOMAIN_MODEL.md` §5.2 `signed → broadcast`).
   *
   * Hata `ChainProviderUnavailableException`'a (`{ cause }` ile asıl RPC hatası
   * korunur) sarılır; worker `cause`'u `classifyRpcError` ile kalıcı/geçici
   * ayırır (`permanent → failed`, `transient → BullMQ retry`).
   */
  broadcastTransaction(signedTxHex: string): Promise<BroadcastResult>;

  /**
   * `txHash`'in güncel makbuzunu ve zincirin güncel blok yüksekliğini döner
   * (`confirmation` worker'ı çağırır, Faz 5 §5.5, `docs/01_DOMAIN_MODEL.md` §5.2
   * `broadcast → confirming → confirmed/dropped/failed`). Blok onayını **beklemez** —
   * tek bir anlık okuma yapar; derinlik eşiğini worker değerlendirir.
   *
   * EVM: `eth_getTransactionReceipt` + `eth_blockNumber`. Tron:
   * `getTransactionInfo` + `getCurrentBlock`. RPC hatası
   * `ChainProviderUnavailableException`'a `{ cause }` ile sarılır — worker bunu
   * yutar, state geçişi yapmadan bir sonraki poll turunu bekler (polling zaten
   * tekrar eder, `docs/04_BACKEND_SPEC.md` §8).
   */
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt>;

  /**
   * `contractAddress`'teki mock ERC-20/TRC-20 kontratının `mint(toAddress,
   * amountRaw)` fonksiyonunu `operatorPrivateKey` (kontrat owner'ı) adına çağırır,
   * işlemin onaylanmasını bekler ve tx hash'ini döner (`POST /admin/mint`,
   * Faz 4 §4.4b). `amountRaw` en küçük birimde bir BigInt string'idir — asla
   * `number`. RPC hatasında / `onlyOwner` revert'inde
   * `ChainProviderUnavailableException` fırlatır.
   *
   * Senkron olarak HTTP yaşam döngüsü içinde beklenir (Faz 5'in worker'larının
   * aksine kuyruğa devredilmez) — mint akışı Transfer state machine'in parçası
   * değildir ve testnet blok süresi kadar gecikme admin panelinde kabul edilir.
   */
  mintToken(
    contractAddress: string,
    toAddress: string,
    amountRaw: string,
    operatorPrivateKey: string,
  ): Promise<MintResult>;
}
