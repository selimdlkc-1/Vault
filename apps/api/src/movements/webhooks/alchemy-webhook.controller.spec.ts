import { createHmac } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import type { MovementsService } from "../movements.service";
import { AlchemyWebhookController } from "./alchemy-webhook.controller";

const SIGNING_KEY = "test-alchemy-signing-key";

function sign(body: string): string {
  return createHmac("sha256", SIGNING_KEY).update(Buffer.from(body)).digest("hex");
}

function req(body: string): RawBodyRequest<Request> {
  return { rawBody: Buffer.from(body) } as unknown as RawBodyRequest<Request>;
}

/** Alchemy `Address Activity` payload'ının bu iterasyonda kullanılan alt kümesi. */
function payload(activity: unknown[], network = "ETH_SEPOLIA"): string {
  return JSON.stringify({
    createdAt: "2026-08-25T12:00:00.000Z",
    event: { network, activity },
  });
}

describe("AlchemyWebhookController", () => {
  let movements: jest.Mocked<Pick<MovementsService, "indexWebhookMovement">>;
  let controller: AlchemyWebhookController;

  beforeEach(() => {
    movements = { indexWebhookMovement: jest.fn().mockResolvedValue(true) };
    const config = {
      getOrThrow: jest.fn().mockReturnValue(SIGNING_KEY),
    } as unknown as ConfigService;
    controller = new AlchemyWebhookController(
      config,
      movements as unknown as MovementsService,
    );
  });

  describe("imza doğrulama (state değiştiren yolun ilk adımı)", () => {
    it("geçersiz imza → hata fırlatır, hiçbir DB yazımı denenmez", async () => {
      const body = payload([]);
      await expect(
        controller.handle(req(body), "deadbeef"),
      ).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID", httpStatus: 401 });
      expect(movements.indexWebhookMovement).not.toHaveBeenCalled();
    });

    it("imza header'ı yok → hata fırlatır", async () => {
      const body = payload([]);
      await expect(
        controller.handle(req(body), undefined),
      ).rejects.toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
    });

    it("geçerli imza → işlenir (fırlatmaz)", async () => {
      const body = payload([]);
      await expect(
        controller.handle(req(body), sign(body)),
      ).resolves.toBeUndefined();
    });
  });

  describe("index — geçerli imza", () => {
    it("token transferi: incoming (to) + outgoing (from) iki bacak da yazılır", async () => {
      const body = payload([
        {
          fromAddress: "0xSENDER",
          toAddress: "0xRECEIVER",
          hash: "0xtx1",
          rawContract: {
            rawValue: "0x0de0b6b3a7640000", // 1e18
            address: "0xTOKEN",
            decimals: 18,
          },
        },
      ]);

      await controller.handle(req(body), sign(body));

      expect(movements.indexWebhookMovement).toHaveBeenCalledTimes(2);
      expect(movements.indexWebhookMovement).toHaveBeenNthCalledWith(1, {
        chainId: "11155111",
        address: "0xRECEIVER",
        contractAddress: "0xTOKEN",
        txHash: "0xtx1",
        direction: "incoming",
        amount: "1000000000000000000",
        occurredAt: new Date("2026-08-25T12:00:00.000Z"),
      });
      expect(movements.indexWebhookMovement).toHaveBeenNthCalledWith(2, {
        chainId: "11155111",
        address: "0xSENDER",
        contractAddress: "0xTOKEN",
        txHash: "0xtx1",
        direction: "outgoing",
        amount: "1000000000000000000",
        occurredAt: new Date("2026-08-25T12:00:00.000Z"),
      });
    });

    it("native transfer: contractAddress null olarak geçilir", async () => {
      const body = payload([
        {
          toAddress: "0xRECEIVER",
          hash: "0xtx2",
          rawContract: { rawValue: "0x01", address: null },
        },
      ]);

      await controller.handle(req(body), sign(body));

      expect(movements.indexWebhookMovement).toHaveBeenCalledTimes(1);
      expect(movements.indexWebhookMovement).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress: null, amount: "1", direction: "incoming" }),
      );
    });

    it("BSC Testnet ağı → chain_id 97'ye çevrilir", async () => {
      const body = payload(
        [{ toAddress: "0xR", hash: "0xtx3", rawContract: { rawValue: "0x2" } }],
        "BNB_TESTNET",
      );
      await controller.handle(req(body), sign(body));
      expect(movements.indexWebhookMovement).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: "97" }),
      );
    });

    it("bilinmeyen ağ → hiçbir hareket işlenmez", async () => {
      const body = payload(
        [{ toAddress: "0xR", hash: "0xtx4", rawContract: { rawValue: "0x2" } }],
        "ETH_MAINNET",
      );
      await controller.handle(req(body), sign(body));
      expect(movements.indexWebhookMovement).not.toHaveBeenCalled();
    });

    it("rawValue yok → o aktivite atlanır", async () => {
      const body = payload([{ toAddress: "0xR", hash: "0xtx5", rawContract: {} }]);
      await controller.handle(req(body), sign(body));
      expect(movements.indexWebhookMovement).not.toHaveBeenCalled();
    });

    it("geçersiz JSON (imza geçerli) → sessizce döner, fırlatmaz", async () => {
      const body = "{ not json";
      await expect(
        controller.handle(req(body), sign(body)),
      ).resolves.toBeUndefined();
      expect(movements.indexWebhookMovement).not.toHaveBeenCalled();
    });
  });
});
