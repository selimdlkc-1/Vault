import { JsonRpcProvider } from "ethers";
import { TronWeb } from "tronweb";

import { classifyRpcError } from "./classify-rpc-error";
import { EvmProvider } from "./evm-provider";
import { ChainProviderUnavailableException } from "./exceptions";
import { TronProvider } from "./tron-provider";

// docs/08_TESTING_STRATEGY.md §5 / .claude/rules/30-testing.md — broadcast
// testleri gerçek RPC'ye/TronGrid'e karşı çalışmaz; yayınlama primitifleri
// (`JsonRpcProvider.broadcastTransaction`, `TronWeb.trx.sendRawTransaction`)
// sabit mock ile değiştirilir.
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

const EVM_SIGNED_TX = `0x${"ab".repeat(60)}`;
const EVM_TX_HASH = `0x${"11".repeat(32)}`;
const TRON_SIGNED_TX = JSON.stringify({ txID: "abc", raw_data: {}, signature: ["s"] });
const TRON_TX_ID = "9f".repeat(32);

beforeEach(() => {
  jsonRpcProviderMock.mockReset();
  tronWebMock.mockReset();
});

describe("EvmProvider.broadcastTransaction", () => {
  it("imzalı hex'i eth_sendRawTransaction'a verir, mempool tx hash'ini döner", async () => {
    const broadcastTransaction = jest
      .fn()
      .mockResolvedValue({ hash: EVM_TX_HASH });
    jsonRpcProviderMock.mockImplementation(() => ({ broadcastTransaction }));

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    const result = await provider.broadcastTransaction(EVM_SIGNED_TX);

    expect(broadcastTransaction).toHaveBeenCalledWith(EVM_SIGNED_TX);
    expect(result).toEqual({ txHash: EVM_TX_HASH });
  });

  it("RPC hatası ChainProviderUnavailableException'a sarılır, asıl hata cause'da korunur", async () => {
    const rpcError = Object.assign(new Error("nonce too low"), {
      code: "NONCE_EXPIRED",
    });
    jsonRpcProviderMock.mockImplementation(() => ({
      broadcastTransaction: jest.fn().mockRejectedValue(rpcError),
    }));

    const provider = new EvmProvider(SEPOLIA, ALLOWLIST);
    const promise = provider.broadcastTransaction(EVM_SIGNED_TX);

    await expect(promise).rejects.toBeInstanceOf(ChainProviderUnavailableException);
    await expect(promise).rejects.toMatchObject({ cause: rpcError });
  });
});

describe("TronProvider.broadcastTransaction", () => {
  it("serialize imzalı işlemi çözer, sendRawTransaction'a verir, txid'yi döner", async () => {
    const sendRawTransaction = jest
      .fn()
      .mockResolvedValue({ result: true, txid: TRON_TX_ID });
    tronWebMock.mockImplementation(() => ({ trx: { sendRawTransaction } }));

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    const result = await provider.broadcastTransaction(TRON_SIGNED_TX);

    expect(sendRawTransaction).toHaveBeenCalledWith(JSON.parse(TRON_SIGNED_TX));
    expect(result).toEqual({ txHash: TRON_TX_ID });
  });

  it("result:false yanıtı exception'a çevrilir (code korunur)", async () => {
    tronWebMock.mockImplementation(() => ({
      trx: {
        sendRawTransaction: jest.fn().mockResolvedValue({
          result: false,
          code: "SIGERROR",
          message: "validate signature error",
        }),
      },
    }));

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    const promise = provider.broadcastTransaction(TRON_SIGNED_TX);

    await expect(promise).rejects.toBeInstanceOf(ChainProviderUnavailableException);
    await expect(promise).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "SIGERROR" }),
    });
  });

  it("TronGrid ağ hatası ChainProviderUnavailableException'a sarılır", async () => {
    tronWebMock.mockImplementation(() => ({
      trx: {
        sendRawTransaction: jest
          .fn()
          .mockRejectedValue(new Error("TronGrid 503 service unavailable")),
      },
    }));

    const provider = new TronProvider(SHASTA, ALLOWLIST);
    await expect(
      provider.broadcastTransaction(TRON_SIGNED_TX),
    ).rejects.toBeInstanceOf(ChainProviderUnavailableException);
  });
});

describe("classifyRpcError — kalıcı / geçici ayrımı (§5.4)", () => {
  it("ethers INSUFFICIENT_FUNDS kodu → permanent", () => {
    expect(
      classifyRpcError(Object.assign(new Error("x"), { code: "INSUFFICIENT_FUNDS" })),
    ).toBe("permanent");
  });

  it("ethers NONCE_EXPIRED kodu → permanent", () => {
    expect(
      classifyRpcError(Object.assign(new Error("x"), { code: "NONCE_EXPIRED" })),
    ).toBe("permanent");
  });

  it("ethers TIMEOUT kodu → transient", () => {
    expect(
      classifyRpcError(Object.assign(new Error("x"), { code: "TIMEOUT" })),
    ).toBe("transient");
  });

  it("Node ECONNRESET soket hatası → transient", () => {
    expect(
      classifyRpcError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })),
    ).toBe("transient");
  });

  it("kod yok ama mesaj 'insufficient funds' içeriyor → permanent", () => {
    expect(classifyRpcError(new Error("err: insufficient funds for gas"))).toBe(
      "permanent",
    );
  });

  it("kod yok ama mesaj 'timeout' içeriyor → transient", () => {
    expect(classifyRpcError(new Error("request timeout after 30s"))).toBe(
      "transient",
    );
  });

  it("Tron SIGERROR kodu → permanent", () => {
    expect(classifyRpcError({ code: "SIGERROR", message: "sig" })).toBe(
      "permanent",
    );
  });

  it("ChainProviderUnavailableException sarmalını cause üzerinden çözer", () => {
    const wrapped = new ChainProviderUnavailableException(
      "EvmProvider.broadcastTransaction",
      { cause: Object.assign(new Error("x"), { code: "INSUFFICIENT_FUNDS" }) },
    );
    expect(classifyRpcError(wrapped)).toBe("permanent");
  });

  it("tanınmayan hata → güvenli varsayılan 'transient'", () => {
    expect(classifyRpcError(new Error("something weird happened"))).toBe(
      "transient",
    );
    expect(classifyRpcError(null)).toBe("transient");
    expect(classifyRpcError("just a string")).toBe("transient");
  });
});
