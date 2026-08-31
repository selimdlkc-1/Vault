import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../config/env.schema";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DEK_LENGTH = 32;

/**
 * İki katmanlı envelope encryption ile managed cüzdan private key'lerini
 * şifreler/çözer (`docs/07_SECURITY_IMPLEMENTATION.md` §5,
 * `docs/mimari-kararlar.md` SEC-006, `docs/02_DATABASE_SCHEMA.md` §2.5/§6).
 *
 * Katman 1: private key, cüzdana özel rastgele bir DEK ile AES-256-GCM
 * kullanılarak şifrelenir → `encryptedPrivateKey`.
 * Katman 2: DEK'in kendisi tek bir master key (`MASTER_ENCRYPTION_KEY`) ile
 * yine AES-256-GCM ile şifrelenir → `encryptedDek`.
 *
 * Her iki alan da `base64(iv(12) || authTag(16) || ciphertext)` biçimindedir
 * (`docs/02` §6). GCM auth tag doğrulaması başarısız olursa node `crypto`
 * otomatik hata fırlatır; bu davranışa müdahale edilmez.
 *
 * Güvenlik sınırı (`.claude/rules/03-security-baseline.md` madde 1,
 * `docs/04_BACKEND_SPEC.md` §9): çözülmüş private key ve DEK hiçbir log
 * satırına, API yanıtına, cache'e veya DB kolonuna yazılmaz — yalnızca
 * çağıranın bellek-içi akışına döndürülür. `decryptPrivateKey`'in dönüş
 * değeri hiçbir `logger.*` çağrısına argüman geçirilemez.
 */
@Injectable()
export class EnvelopeEncryptionService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  /**
   * Yeni bir DEK üretir, private key'i bu DEK ile şifreler, DEK'i master key
   * ile şifreler. DEK bu fonksiyonun dışına hiçbir biçimde taşınmaz.
   */
  encryptPrivateKey(privateKeyHex: string): {
    encryptedPrivateKey: string;
    encryptedDek: string;
  } {
    const dek = randomBytes(DEK_LENGTH);
    const encryptedPrivateKey = this.aesGcmEncrypt(
      Buffer.from(privateKeyHex, "utf8"),
      dek,
    );
    const encryptedDek = this.aesGcmEncrypt(dek, this.getMasterKey());
    return { encryptedPrivateKey, encryptedDek };
  }

  /**
   * Önce DEK'i master key ile çözer, sonra private key'i bu DEK ile çözer.
   * Yalnızca imzalama akışının bellek-içi kullanımı içindir.
   */
  decryptPrivateKey(encryptedPrivateKey: string, encryptedDek: string): string {
    const dek = this.aesGcmDecrypt(encryptedDek, this.getMasterKey());
    const privateKey = this.aesGcmDecrypt(encryptedPrivateKey, dek);
    return privateKey.toString("utf8");
  }

  /** `base64(iv || authTag || ciphertext)` üretir; her çağrıda yeni rastgele IV. */
  private aesGcmEncrypt(plaintext: Buffer, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  }

  /**
   * Payload'ı `iv | authTag | ciphertext` olarak ayırıp çözer. Auth tag
   * doğrulaması başarısız olursa `cipher.final()` hata fırlatır — olduğu gibi
   * yukarı taşınır.
   */
  private aesGcmDecrypt(payload: string, key: Buffer): Buffer {
    const raw = Buffer.from(payload, "base64");
    const ivEnd = IV_LENGTH;
    const authTagEnd = ivEnd + AUTH_TAG_LENGTH;
    const iv = raw.subarray(0, ivEnd);
    const authTag = raw.subarray(ivEnd, authTagEnd);
    const ciphertext = raw.subarray(authTagEnd);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * `MASTER_ENCRYPTION_KEY`'i hex decode eder (env şeması 64 karakterlik hex =
   * 32 byte = AES-256 anahtar uzunluğu olarak zaten fail-fast doğrular —
   * `apps/api/src/config/env.schema.ts`, `docs/09_DEV_WORKFLOW.md` §7).
   */
  private getMasterKey(): Buffer {
    return Buffer.from(this.config.get<string>("MASTER_ENCRYPTION_KEY"), "hex");
  }
}
