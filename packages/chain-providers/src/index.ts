// @vault/chain-providers — IChainProvider soyutlaması + EVM/Tron implementasyon
// iskeletleri + chain ID allowlist zorlaması (Faz 2 §2.5).
// Kaynak: docs/mimari-kararlar.md I-001/I-002/SEC-005/CODE-004,
//         .claude/rules/13-critical-modules.md, .claude/rules/03-security-baseline.md.

export type {
  AssetRef,
  BroadcastResult,
  ChainType,
  DerivedWallet,
  IChainProvider,
  MintResult,
  RawTransactionInput,
  TransactionReceipt,
} from "./i-chain-provider";
export { CONFIRMATION_THRESHOLDS } from "./constants";
export { MOCK_ERC20_ABI, MOCK_TRC20_ABI } from "./abi/mock-erc20.abi";
export { isValidAddress } from "./address-validator";
export { classifyRpcError, type RpcErrorKind } from "./classify-rpc-error";
export {
  EVM_COIN_TYPE,
  TRON_COIN_TYPE,
  derivationPath,
  isValidMnemonic,
} from "./hd-wallet";
export { assertChainIdAllowed } from "./chain-id-allowlist";
export {
  ChainIdNotAllowedException,
  ChainProviderUnavailableException,
  NotImplementedException,
} from "./exceptions";
export { EvmProvider, type EvmNetworkConfig } from "./evm-provider";
export { TronProvider, type TronNetworkConfig } from "./tron-provider";
