import { JsonRpcProvider } from "ethers";
import { TronWeb } from "tronweb";

import { CONFIRMATION_THRESHOLDS } from "./constants";
import { EvmProvider } from "./evm-provider";
import { ChainProviderUnavailableException } from "./exceptions";
import { TronProvider } from "./tron-provider";

// docs/08_TESTING_STRATEGY.md §5 / .claude/rules/30-testing.md — confirmation
// worker'ının okuduğu makbuz primitifleri (`JsonRpcProvider.getTransactionReceipt`
// + `getBlockNumber`, `TronWeb.trx.getTransactionInfo` + `getCurrentBlock`) gerçek
// RPC'ye/TronGrid'e karşı çalışmaz; sabit mock yanıtlarla değiştirilir.
jest.mock("ethers", () => {
  const actual = jest.requireActual<typeof import("ethers")>("ethers");
  return { ...actual, JsonRpcProvider: jest.fn() };
});
jest.mock("tronweb", () => {
  const actual = jest.requireActual<typeof import("tronweb")>("tronweb");
  return { ...actual, TronWeb: jest.fn() };
});

const jsonRpcProviderMock = JsonRpcProvider as unknown as jest.Mock;
const tronWebMock = TronWeb as unknown as jest.Mock;

const ALLOWLIST = ["11155111", "97", "shasta"];
const SEPOLIA = { chainId: "11155111", rpcUrl: "https://sepolia.rpc.invalid" };
const SHASTA = { chainId: "shasta", rpcUrl: "https://api.shasta.trongrid.io" };

const TX_HASH = `0x${"cd".repeat(32)}`;
const BLOCK_HASH = `0x${"ef".repeat(32)}`;

beforeEach(() => {
  jsonRpcProviderMock.mockReset();
  tronWebMock.mockReset();
});

describe("CONFIRMATION_THRESHOLDS (I-004)", () => {
  it("Sepolia 12 / BSC Testnet 15 / Tron Shasta 19 (docs/mimari-kararlar I-004 birebir)", () => {
    expect(CONFIRMATION_THRESHOLDS).toEqual({
      "11155111": 12,
      "97": 15,
      shasta: 19,
    });
  });
});

describe("EvmProvider.getTransactionReceipt (§5.5)", () => {
  function mockRpc(receipt: unknown, blockNumber = 500): jest.Mock {
    const getTransactionReceipt = jest.fn().mockResolvedValue(receipt);
    jsonRpcProviderMock.mockImplementation(() => ({
      getTransactionReceipt,
      getBlockNumber: jest.fn().mockResolvedValue(blockNumber),
    }));
    return getTransactionReceipt;
  }

  it("makbuz null → status 'pending', blok alanları null, currentBlockHeight taze okunur", async () => {
    const getTransactionReceipt = mockRpc(null, 512);

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    const result = await provider.getTransactionReceipt(TX_HASH);

    expect(getTransactionReceipt).toHaveBeenCalledWith(TX_HASH);
    expect(result).toEqual({
      status: "pending",
      blockNumber: null,
      blockHash: null,
      currentBlockHeight: 512,
    });
  });

  it("receipt.status === 1 → 'success', blockNumber/blockHash döner", async () => {
    mockRpc(
      { status: 1, blockNumber: 480, blockHash: BLOCK_HASH },
      500,
    );

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    const result = await provider.getTransactionReceipt(TX_HASH);

    expect(result).toEqual({
      status: "success",
      blockNumber: 480,
      blockHash: BLOCK_HASH,
      currentBlockHeight: 500,
    });
  });

  it("receipt.status === 0 → 'reverted'", async () => {
    mockRpc({ status: 0, blockNumber: 480, blockHash: BLOCK_HASH }, 500);

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    const result = await provider.getTransactionReceipt(TX_HASH);

    expect(result.status).toBe("reverted");
    expect(result.blockNumber).toBe(480);
  });

  it("RPC hatası ChainProviderUnavailableException'a sarılır", async () => {
    jsonRpcProviderMock.mockImplementation(() => ({
      getTransactionReceipt: jest
        .fn()
        .mockRejectedValue(new Error("RPC 503 service unavailable")),
      getBlockNumber: jest.fn().mockResolvedValue(500),
    }));

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    await expect(provider.getTransactionReceipt(TX_HASH)).rejects.toBeInstanceOf(
      ChainProviderUnavailableException,
    );
  });
});

describe("TronProvider.getTransactionReceipt (§5.5)", () => {
  function mockTron(info: unknown, blockNumber = 1000): void {
    tronWebMock.mockImplementation(() => ({
      trx: {
        getTransactionInfo: jest.fn().mockResolvedValue(info),
        getCurrentBlock: jest.fn().mockResolvedValue({
          block_header: { raw_data: { number: blockNumber } },
        }),
      },
    }));
  }

  it("getTransactionInfo boş nesne ({}) → status 'pending'", async () => {
    mockTron({}, 1024);

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    const result = await provider.getTransactionReceipt(TX_HASH);

    expect(result).toEqual({
      status: "pending",
      blockNumber: null,
      blockHash: null,
      currentBlockHeight: 1024,
    });
  });

  it("bloğa girmiş + receipt.result 'SUCCESS' → 'success', blockHash null", async () => {
    mockTron(
      { blockNumber: 980, receipt: { result: "SUCCESS" } },
      1000,
    );

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    const result = await provider.getTransactionReceipt(TX_HASH);

    expect(result).toEqual({
      status: "success",
      blockNumber: 980,
      blockHash: null,
      currentBlockHeight: 1000,
    });
  });

  it("native TRX transferi (receipt.result yok) → 'success'", async () => {
    mockTron({ blockNumber: 980 }, 1000);

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    const result = await provider.getTransactionReceipt(TX_HASH);

    expect(result.status).toBe("success");
  });

  it("info.result === 'FAILED' → 'reverted'", async () => {
    mockTron({ blockNumber: 980, result: "FAILED" }, 1000);

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    const result = await provider.getTransactionReceipt(TX_HASH);

    expect(result.status).toBe("reverted");
  });

  it("receipt.result 'REVERT' → 'reverted'", async () => {
    mockTron({ blockNumber: 980, receipt: { result: "REVERT" } }, 1000);

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    const result = await provider.getTransactionReceipt(TX_HASH);

    expect(result.status).toBe("reverted");
  });

  it("TronGrid hatası ChainProviderUnavailableException'a sarılır", async () => {
    tronWebMock.mockImplementation(() => ({
      trx: {
        getTransactionInfo: jest
          .fn()
          .mockRejectedValue(new Error("TronGrid timeout")),
        getCurrentBlock: jest.fn().mockResolvedValue({
          block_header: { raw_data: { number: 1000 } },
        }),
      },
    }));

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    await expect(provider.getTransactionReceipt(TX_HASH)).rejects.toBeInstanceOf(
      ChainProviderUnavailableException,
    );
  });
});
