import type { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../config/env.schema";
import { EnvelopeEncryptionService } from "./envelope-encryption.service";

const MASTER_KEY_HEX = "a".repeat(64);
const OTHER_MASTER_KEY_HEX = "b".repeat(64);

// Örnek bir EVM private key (0x önekli 32 byte hex) — gerçek bir cüzdana ait değil.
const PRIVATE_KEY = `0x${"1234567890abcdef".repeat(4)}`;

function buildService(masterKeyHex = MASTER_KEY_HEX): EnvelopeEncryptionService {
  const config = {
    get: (key: keyof EnvConfig) =>
      key === "MASTER_ENCRYPTION_KEY" ? masterKeyHex : undefined,
  } as unknown as ConfigService<EnvConfig, true>;
  return new EnvelopeEncryptionService(config);
}

describe("EnvelopeEncryptionService", () => {
  it("encryptPrivateKey → decryptPrivateKey round-trip orijinal değeri birebir verir", () => {
    const service = buildService();

    const { encryptedPrivateKey, encryptedDek } =
      service.encryptPrivateKey(PRIVATE_KEY);

    expect(service.decryptPrivateKey(encryptedPrivateKey, encryptedDek)).toBe(
      PRIVATE_KEY,
    );
  });

  it("encryptedPrivateKey ve encryptedDek düz metin private key'i içermez", () => {
    const service = buildService();

    const { encryptedPrivateKey, encryptedDek } =
      service.encryptPrivateKey(PRIVATE_KEY);

    for (const field of [encryptedPrivateKey, encryptedDek]) {
      expect(field).not.toContain(PRIVATE_KEY);
      expect(Buffer.from(field, "base64").toString("utf8")).not.toContain(
        PRIVATE_KEY,
      );
    }
  });

  it("aynı private key iki kez şifrelendiğinde farklı ciphertext üretir (rastgele IV + rastgele DEK)", () => {
    const service = buildService();

    const first = service.encryptPrivateKey(PRIVATE_KEY);
    const second = service.encryptPrivateKey(PRIVATE_KEY);

    expect(first.encryptedPrivateKey).not.toBe(second.encryptedPrivateKey);
    expect(first.encryptedDek).not.toBe(second.encryptedDek);
    // İkisi de aynı orijinale çözülür.
    expect(
      service.decryptPrivateKey(first.encryptedPrivateKey, first.encryptedDek),
    ).toBe(PRIVATE_KEY);
    expect(
      service.decryptPrivateKey(second.encryptedPrivateKey, second.encryptedDek),
    ).toBe(PRIVATE_KEY);
  });

  it("encryptedPrivateKey içindeki tek bir byte değiştirildiğinde decrypt hata fırlatır (GCM auth tag)", () => {
    const service = buildService();
    const { encryptedPrivateKey, encryptedDek } =
      service.encryptPrivateKey(PRIVATE_KEY);

    const tampered = flipLastByte(encryptedPrivateKey);

    expect(() => service.decryptPrivateKey(tampered, encryptedDek)).toThrow();
  });

  it("encryptedDek içindeki tek bir byte değiştirildiğinde decrypt hata fırlatır (GCM auth tag)", () => {
    const service = buildService();
    const { encryptedPrivateKey, encryptedDek } =
      service.encryptPrivateKey(PRIVATE_KEY);

    const tampered = flipLastByte(encryptedDek);

    expect(() =>
      service.decryptPrivateKey(encryptedPrivateKey, tampered),
    ).toThrow();
  });

  it("farklı bir master key ile çözme denemesi hata fırlatır", () => {
    const encrypter = buildService(MASTER_KEY_HEX);
    const { encryptedPrivateKey, encryptedDek } =
      encrypter.encryptPrivateKey(PRIVATE_KEY);

    const wrongKeyService = buildService(OTHER_MASTER_KEY_HEX);

    expect(() =>
      wrongKeyService.decryptPrivateKey(encryptedPrivateKey, encryptedDek),
    ).toThrow();
  });
});

/** base64 payload'ın son byte'ını çevirir — ciphertext'i bozar. */
function flipLastByte(base64Payload: string): string {
  const raw = Buffer.from(base64Payload, "base64");
  raw[raw.length - 1] ^= 0x01;
  return raw.toString("base64");
}
