import { Wallet } from "ethers";
import { TronWeb } from "tronweb";

import { EvmProvider } from "./evm-provider";
import { ChainProviderUnavailableException } from "./exceptions";
import type { RawTransactionInput } from "./i-chain-provider";
import { TronProvider } from "./tron-provider";

// docs/08_TESTING_STRATEGY.md §5 / .claude/rules/30-testing.md — chain provider
// testleri gerçek RPC'ye/TronGrid'e karşı çalışmaz. İmzalama primitiflerini
// (`Wallet`, `TronWeb`) sabit mock ile değiştiririz; `Interface` (ERC-20 `data`
// encode) gerçek implementasyonda kalır — sabit girdi sabit `data` üretir.
jest.mock("ethers", () => {
  const actual = jest.requireActual<typeof import("ethers")>("ethers");
  return { ...actual, JsonRpcProvider: jest.fn(), Wallet: jest.fn() };
});
jest.mock("tronweb", () => {
  const actual = jest.requireActual<typeof import("tronweb")>("tronweb");
  return { ...actual, TronWeb: jest.fn() };
});

const walletMock = Wallet as unknown as jest.Mock;
const tronWebMock = TronWeb as unknown as jest.Mock;

const ALLOWLIST = ["11155111", "97", "shasta"];
const SEPOLIA = { chainId: "11155111", rpcUrl: "https://sepolia.rpc.invalid" };
const SHASTA = { chainId: "shasta", rpcUrl: "https://api.shasta.trongrid.io" };

const PK = `0x${"1".repeat(64)}`;
const EVM_FROM = "0x1111111111111111111111111111111111111111";
const EVM_TO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const EVM_TOKEN = "0x1234567890123456789012345678901234567890";
const TRON_FROM = "TQ5NqPY1Eqe4B4hV1hVFCJmZ9dRmM6C7Gr";
const TRON_TO = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const TRON_TOKEN = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

/** ERC-20 `transfer(address,uint256)` fonksiyon seçicisi. */
const TRANSFER_SELECTOR = "0xa9059cbb";

function evmInput(overrides: Partial<RawTransactionInput> = {}): RawTransactionInput {
  return {
    from: EVM_FROM,
    to: EVM_TO,
    amount: "1000",
    asset: { contractAddress: null, decimals: 18 },
    ...overrides,
  };
}

function tronInput(overrides: Partial<RawTransactionInput> = {}): RawTransactionInput {
  return {
    from: TRON_FROM,
    to: TRON_TO,
    amount: "5000000",
    asset: { contractAddress: null, decimals: 6 },
    ...overrides,
  };
}

beforeEach(() => {
  walletMock.mockReset();
  tronWebMock.mockReset();
});

describe("EvmProvider.signTransaction", () => {
  let populateTransaction: jest.Mock;
  let signTransaction: jest.Mock;

  beforeEach(() => {
    populateTransaction = jest
      .fn()
      .mockImplementation(async (req: Record<string, unknown>) => ({
        ...req,
        nonce: 7,
        gasLimit: 21_000n,
        maxFeePerGas: 2_000_000_000n,
        chainId: 11_155_111n,
      }));
    signTransaction = jest.fn().mockResolvedValue("0xSIGNEDEVMRAWTX");
    walletMock.mockImplementation(() => ({ populateTransaction, signTransaction }));
  });

  it("native coin: { to, value } kurar, populate + sign eder, imzalı hex döner", async () => {
    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);

    const result = await provider.signTransaction(PK, evmInput());

    expect(walletMock).toHaveBeenCalledWith(PK, expect.anything());
    expect(populateTransaction).toHaveBeenCalledWith({
      to: EVM_TO,
      value: 1000n,
      from: EVM_FROM,
    });
    expect(signTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ to: EVM_TO, value: 1000n, nonce: 7 }),
    );
    expect(result).toBe("0xSIGNEDEVMRAWTX");
  });

  it("ERC-20: kontrata transfer(to, amount) data'sı encode edilir (deterministik seçici)", async () => {
    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);

    await provider.signTransaction(
      PK,
      evmInput({ asset: { contractAddress: EVM_TOKEN, decimals: 6 }, amount: "2500000" }),
    );

    const [request] = populateTransaction.mock.calls[0] as [Record<string, string>];
    expect(request.to).toBe(EVM_TOKEN);
    expect(request.data.startsWith(TRANSFER_SELECTOR)).toBe(true);
    // Aynı girdi her çağrıda aynı calldata'yı üretir.
    expect(request.data).toHaveLength(2 + 8 + 64 + 64);
  });

  it("amount BigInt'e çevrilir — asla JS number", async () => {
    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    await provider.signTransaction(PK, evmInput({ amount: "1000" }));
    const [request] = populateTransaction.mock.calls[0] as [{ value: unknown }];
    expect(typeof request.value).toBe("bigint");
  });

  it("imzalama hatası ChainProviderUnavailableException'a sarılır", async () => {
    signTransaction.mockRejectedValue(new Error("bad key"));
    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);

    await expect(
      provider.signTransaction(PK, evmInput()),
    ).rejects.toBeInstanceOf(ChainProviderUnavailableException);
  });
});

describe("TronProvider.signTransaction", () => {
  let sendTrx: jest.Mock;
  let triggerSmartContract: jest.Mock;
  let sign: jest.Mock;

  beforeEach(() => {
    sendTrx = jest.fn().mockResolvedValue({ raw_data: "trx-unsigned" });
    triggerSmartContract = jest
      .fn()
      .mockResolvedValue({ transaction: { raw_data: "trc20-unsigned" } });
    sign = jest
      .fn()
      .mockImplementation(async (tx: Record<string, unknown>) => ({
        ...tx,
        signature: ["deadbeef"],
      }));
    tronWebMock.mockImplementation(() => ({
      transactionBuilder: { sendTrx, triggerSmartContract },
      trx: { sign },
    }));
  });

  it("native TRX: sendTrx(to, amount, from) + sign, serialize edilmiş imzalı işlem döner", async () => {
    const provider = new TronProvider(SHASTA, ALLOWLIST);

    const result = await provider.signTransaction(PK, tronInput());

    expect(sendTrx).toHaveBeenCalledWith(TRON_TO, 5_000_000, TRON_FROM);
    expect(sign).toHaveBeenCalledWith({ raw_data: "trx-unsigned" }, PK);
    // imzalayıcı = private key'li ayrı TronWeb örneği (constructor + signer = 2).
    expect(tronWebMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ privateKey: PK }),
    );
    expect(JSON.parse(result)).toMatchObject({ signature: ["deadbeef"] });
  });

  it("TRC-20: triggerSmartContract transfer(address,uint256) çağrısını kurar", async () => {
    const provider = new TronProvider(SHASTA, ALLOWLIST);

    await provider.signTransaction(
      PK,
      tronInput({ asset: { contractAddress: TRON_TOKEN, decimals: 6 }, amount: "42" }),
    );

    expect(triggerSmartContract).toHaveBeenCalledWith(
      TRON_TOKEN,
      "transfer(address,uint256)",
      {},
      [
        { type: "address", value: TRON_TO },
        { type: "uint256", value: "42" },
      ],
      TRON_FROM,
    );
    expect(sign).toHaveBeenCalledWith({ raw_data: "trc20-unsigned" }, PK);
  });

  it("imzalama hatası ChainProviderUnavailableException'a sarılır", async () => {
    sign.mockRejectedValue(new Error("tron sign failed"));
    const provider = new TronProvider(SHASTA, ALLOWLIST);

    await expect(
      provider.signTransaction(PK, tronInput()),
    ).rejects.toBeInstanceOf(ChainProviderUnavailableException);
  });
});

describe("signTransaction — ağ formatı ayrımı", () => {
  it("EVM 0x-önekli hex, Tron JSON döner (farklı imza formatı)", async () => {
    walletMock.mockImplementation(() => ({
      populateTransaction: jest.fn().mockResolvedValue({}),
      signTransaction: jest.fn().mockResolvedValue("0xabc123"),
    }));
    tronWebMock.mockImplementation(() => ({
      transactionBuilder: {
        sendTrx: jest.fn().mockResolvedValue({ raw_data: "x" }),
        triggerSmartContract: jest.fn(),
      },
      trx: { sign: jest.fn().mockResolvedValue({ txID: "abc", signature: ["s"] }) },
    }));

    const evm = await new EvmProvider(SEPOLIA, ALLOWLIST).signTransaction(PK, evmInput());
    const tron = await new TronProvider(SHASTA, ALLOWLIST).signTransaction(PK, tronInput());

    expect(evm.startsWith("0x")).toBe(true);
    expect(() => JSON.parse(tron)).not.toThrow();
    expect(evm).not.toBe(tron);
  });
});
