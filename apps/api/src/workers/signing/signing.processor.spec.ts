import type { Job } from "bullmq";
import type { IChainProvider } from "@vault/chain-providers";
import type { ChainProviderFactory } from "../../networks/chain-provider.factory";
import type { PrismaService } from "../../prisma/prisma.service";
import type { TransferStateMachine } from "../../transfers/transfer-state-machine.service";
import type {
  SigningContext,
  TransfersService,
} from "../../transfers/transfers.service";
import type { EnvelopeEncryptionService } from "../../wallets/envelope-encryption.service";
import type { WalletsService } from "../../wallets/wallets.service";
import { SIGN_JOB } from "./signing.queue";
import { SigningProcessor } from "./signing.processor";

const TRANSFER_ID = "99999999-9999-4999-8999-999999999999";
const WALLET_ID = "22222222-2222-4222-8222-222222222222";
const TX = { __tx: true };

function context(overrides: Partial<SigningContext> = {}): SigningContext {
  return {
    transferId: TRANSFER_ID,
    walletId: WALLET_ID,
    toAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    amount: "1000",
    chain: { chainType: "evm", chainId: "11155111" },
    asset: { contractAddress: null, decimals: 18 },
    ...overrides,
  };
}

function job(data: unknown = { transferId: TRANSFER_ID }, name = SIGN_JOB): Job {
  return { name, data } as unknown as Job;
}

describe("SigningProcessor", () => {
  let transfers: jest.Mocked<Pick<TransfersService, "getSigningContext">>;
  let stateMachine: jest.Mocked<Pick<TransferStateMachine, "transitionTo">>;
  let wallets: jest.Mocked<Pick<WalletsService, "getSigningMaterial">>;
  let envelope: jest.Mocked<Pick<EnvelopeEncryptionService, "decryptPrivateKey">>;
  let providers: jest.Mocked<Pick<ChainProviderFactory, "getProvider">>;
  let provider: jest.Mocked<Pick<IChainProvider, "signTransaction">>;
  let prisma: { $transaction: jest.Mock };
  let broadcastQueue: { add: jest.Mock };
  let processor: SigningProcessor;

  beforeEach(() => {
    transfers = {
      getSigningContext: jest.fn().mockResolvedValue(context()),
    };
    stateMachine = {
      transitionTo: jest.fn().mockResolvedValue(undefined),
    };
    wallets = {
      getSigningMaterial: jest.fn().mockResolvedValue({
        address: "0x1111111111111111111111111111111111111111",
        encryptedPrivateKey: "enc-pk",
        encryptedDek: "enc-dek",
      }),
    };
    envelope = {
      decryptPrivateKey: jest.fn().mockReturnValue(`0x${"1".repeat(64)}`),
    };
    provider = { signTransaction: jest.fn().mockResolvedValue("0xSIGNEDRAWTX") };
    providers = { getProvider: jest.fn().mockReturnValue(provider) };
    prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(TX)),
    };
    broadcastQueue = { add: jest.fn().mockResolvedValue(undefined) };
    processor = new SigningProcessor(
      transfers as unknown as TransfersService,
      stateMachine as unknown as TransferStateMachine,
      wallets as unknown as WalletsService,
      envelope as unknown as EnvelopeEncryptionService,
      providers as unknown as ChainProviderFactory,
      prisma as unknown as PrismaService,
      broadcastQueue as never,
    );
  });

  it("başarı: decrypt → sign → pending_signature → signed geçişi (aynı $transaction)", async () => {
    await processor.process(job());

    expect(envelope.decryptPrivateKey).toHaveBeenCalledWith("enc-pk", "enc-dek");
    expect(providers.getProvider).toHaveBeenCalledWith({
      chainType: "evm",
      chainId: "11155111",
    });
    expect(provider.signTransaction).toHaveBeenCalledWith(`0x${"1".repeat(64)}`, {
      from: "0x1111111111111111111111111111111111111111",
      to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      amount: "1000",
      asset: { contractAddress: null, decimals: 18 },
    });
    expect(stateMachine.transitionTo).toHaveBeenCalledWith(
      TX,
      TRANSFER_ID,
      "signed",
      "worker:signing",
    );
  });

  it("başarı: signed geçişinden sonra broadcast kuyruğuna {transferId, signedTx} eklenir (jobId + attempts:5 + exponential backoff)", async () => {
    await processor.process(job());

    expect(broadcastQueue.add).toHaveBeenCalledWith(
      "broadcast",
      { transferId: TRANSFER_ID, signedTx: "0xSIGNEDRAWTX" },
      {
        jobId: `${TRANSFER_ID}:broadcast`,
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
      },
    );
  });

  it("imzalama hatası: broadcast kuyruğuna hiçbir şey eklenmez", async () => {
    provider.signTransaction.mockRejectedValue(new Error("bad key"));

    await processor.process(job());

    expect(broadcastQueue.add).not.toHaveBeenCalled();
  });

  it("imzalama hatası: BullMQ retry değil — doğrudan failed (failureReason + metadata)", async () => {
    provider.signTransaction.mockRejectedValue(new Error("libsecp: invalid key"));

    await processor.process(job());

    expect(stateMachine.transitionTo).toHaveBeenCalledTimes(1);
    expect(stateMachine.transitionTo).toHaveBeenCalledWith(
      TX,
      TRANSFER_ID,
      "failed",
      "worker:signing",
      {
        failureReason: "İmzalama başarısız oldu.",
        metadata: { step: "signing", reason: "SIGNING_FAILED" },
      },
    );
  });

  it("imzalama hatası: ham hata mesajı state event metadata'sına sızmaz", async () => {
    provider.signTransaction.mockRejectedValue(
      new Error("PRIVATE KEY 0xdeadbeef... rejected"),
    );

    await processor.process(job());

    const [, , , , options] = stateMachine.transitionTo.mock.calls[0];
    expect(JSON.stringify(options)).not.toContain("0xdeadbeef");
  });

  it("cüzdan materyali hatası (watch-only / eksik) → failed", async () => {
    wallets.getSigningMaterial.mockRejectedValue(new Error("WALLET_NOT_MANAGED"));

    await processor.process(job());

    expect(provider.signTransaction).not.toHaveBeenCalled();
    expect(stateMachine.transitionTo).toHaveBeenCalledWith(
      TX,
      TRANSFER_ID,
      "failed",
      "worker:signing",
      expect.objectContaining({ failureReason: expect.any(String) }),
    );
  });

  it("idempotency: state 'pending_signature' değilse (getSigningContext null) hiçbir yan etki yok", async () => {
    transfers.getSigningContext.mockResolvedValue(null);

    await processor.process(job());

    expect(wallets.getSigningMaterial).not.toHaveBeenCalled();
    expect(envelope.decryptPrivateKey).not.toHaveBeenCalled();
    expect(provider.signTransaction).not.toHaveBeenCalled();
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(broadcastQueue.add).not.toHaveBeenCalled();
  });

  it("bilinmeyen job adı: sessizce çıkar", async () => {
    await processor.process(job({ transferId: TRANSFER_ID }, "garip-job"));

    expect(transfers.getSigningContext).not.toHaveBeenCalled();
    expect(stateMachine.transitionTo).not.toHaveBeenCalled();
  });

  it("ERC-20 transferi: signTransaction'a kontrat adresi + amount string geçer", async () => {
    transfers.getSigningContext.mockResolvedValue(
      context({
        asset: { contractAddress: "0xtoken0000000000000000000000000000000000", decimals: 6 },
        amount: "2500000",
      }),
    );

    await processor.process(job());

    expect(provider.signTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        amount: "2500000",
        asset: { contractAddress: "0xtoken0000000000000000000000000000000000", decimals: 6 },
      }),
    );
  });
});
