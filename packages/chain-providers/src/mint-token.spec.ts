import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { TronWeb } from "tronweb";

import { EvmProvider } from "./evm-provider";
import { ChainProviderUnavailableException } from "./exceptions";
import { TronProvider } from "./tron-provider";

// docs/08_TESTING_STRATEGY.md §5 / .claude/rules/30-testing.md — chain provider
// testleri gerçek RPC'ye/TronGrid'e karşı çalışmaz. `mint()` çağrısı sabit mock
// yanıtlarla doğrulanır; `mintToken` başarı yolu + geçici sağlayıcı hatasının
// `ChainProviderUnavailableException`'a sarılması (kritik modül, `docs/03` §5.8).
jest.mock("ethers", () => {
  const actual = jest.requireActual<typeof import("ethers")>("ethers");
  return {
    ...actual,
    JsonRpcProvider: jest.fn(),
    Contract: jest.fn(),
    Wallet: jest.fn(),
  };
});
jest.mock("tronweb", () => {
  const actual = jest.requireActual<typeof import("tronweb")>("tronweb");
  return { ...actual, TronWeb: jest.fn() };
});

const jsonRpcProviderMock = JsonRpcProvider as unknown as jest.Mock;
const contractMock = Contract as unknown as jest.Mock;
const walletMock = Wallet as unknown as jest.Mock;
const tronWebMock = TronWeb as unknown as jest.Mock;

const ALLOWLIST = ["11155111", "97", "shasta"];
const SEPOLIA = { chainId: "11155111", rpcUrl: "https://sepolia.rpc.invalid" };
const SHASTA = { chainId: "shasta", rpcUrl: "https://api.shasta.trongrid.io" };

const OPERATOR_PK = `0x${"1".repeat(64)}`;
const EVM_CONTRACT = "0x1234567890123456789012345678901234567890";
const EVM_RECIPIENT = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const TRON_CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const TRON_RECIPIENT = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const AMOUNT_RAW = "1000000"; // 1 USDT @ 6 decimals

beforeEach(() => {
  jsonRpcProviderMock.mockReset();
  contractMock.mockReset();
  walletMock.mockReset();
  tronWebMock.mockReset();
  jsonRpcProviderMock.mockImplementation(() => ({}));
  walletMock.mockImplementation(() => ({ __wallet: true }));
});

describe("EvmProvider.mintToken", () => {
  it("mint() çağırır, tx.wait()'i bekler ve onaylanmış tx hash'ini döner", async () => {
    const wait = jest.fn().mockResolvedValue({ hash: "0xreceipthash" });
    const mint = jest.fn().mockResolvedValue({ hash: "0xpendinghash", wait });
    contractMock.mockImplementation(() => ({ mint }));

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    const result = await provider.mintToken(
      EVM_CONTRACT,
      EVM_RECIPIENT,
      AMOUNT_RAW,
      OPERATOR_PK,
    );

    expect(result).toEqual({ txHash: "0xreceipthash" });
    expect(walletMock).toHaveBeenCalledWith(OPERATOR_PK, expect.anything());
    expect(contractMock).toHaveBeenCalledWith(
      EVM_CONTRACT,
      expect.any(Array),
      expect.anything(),
    );
    // `amountRaw` bigint olarak geçer — asla number.
    expect(mint).toHaveBeenCalledWith(EVM_RECIPIENT, BigInt(AMOUNT_RAW));
  });

  it("receipt null dönerse pending tx hash'ine düşer", async () => {
    const wait = jest.fn().mockResolvedValue(null);
    const mint = jest.fn().mockResolvedValue({ hash: "0xpendingonly", wait });
    contractMock.mockImplementation(() => ({ mint }));

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    const result = await provider.mintToken(
      EVM_CONTRACT,
      EVM_RECIPIENT,
      AMOUNT_RAW,
      OPERATOR_PK,
    );

    expect(result).toEqual({ txHash: "0xpendingonly" });
  });

  it("RPC hatası / onlyOwner revert'i ChainProviderUnavailableException'a sarılır", async () => {
    const mint = jest.fn().mockRejectedValue(
      Object.assign(new Error("execution reverted: Ownable"), { code: "CALL_EXCEPTION" }),
    );
    contractMock.mockImplementation(() => ({ mint }));

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    await expect(
      provider.mintToken(EVM_CONTRACT, EVM_RECIPIENT, AMOUNT_RAW, OPERATOR_PK),
    ).rejects.toBeInstanceOf(ChainProviderUnavailableException);
  });
});

describe("TronProvider.mintToken", () => {
  function mockTronWeb(mintSend: jest.Mock): jest.Mock {
    const mintFn = jest.fn().mockReturnValue({ send: mintSend });
    const contract = jest.fn().mockReturnValue({ mint: mintFn });
    tronWebMock.mockImplementation(() => ({
      trx: { getBalance: jest.fn() },
      contract,
    }));
    return mintFn;
  }

  it("mint().send() sonucunu tx hash olarak döner (paylaşılan tronWeb mutate edilmez)", async () => {
    const send = jest.fn().mockResolvedValue("tron-tx-id");
    const mintFn = mockTronWeb(send);

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    const result = await provider.mintToken(
      TRON_CONTRACT,
      TRON_RECIPIENT,
      AMOUNT_RAW,
      OPERATOR_PK,
    );

    expect(result).toEqual({ txHash: "tron-tx-id" });
    // constructor + imzalayıcı = iki ayrı TronWeb örneği.
    expect(tronWebMock).toHaveBeenCalledTimes(2);
    expect(tronWebMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ privateKey: OPERATOR_PK }),
    );
    expect(mintFn).toHaveBeenCalledWith(TRON_RECIPIENT, BigInt(AMOUNT_RAW));
  });

  it("TronGrid hatası ChainProviderUnavailableException'a sarılır", async () => {
    const send = jest.fn().mockRejectedValue(new Error("TronGrid 503"));
    mockTronWeb(send);

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    await expect(
      provider.mintToken(TRON_CONTRACT, TRON_RECIPIENT, AMOUNT_RAW, OPERATOR_PK),
    ).rejects.toBeInstanceOf(ChainProviderUnavailableException);
  });
});
