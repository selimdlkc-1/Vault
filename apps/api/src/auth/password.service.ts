import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/**
 * Şifre hash'leme ve doğrulama — argon2id (`docs/mimari-kararlar.md` A-001,
 * `docs/07_SECURITY_IMPLEMENTATION.md` §2).
 *
 * argon2 paketinin varsayılan memory/time cost parametreleri kasıtlı olarak
 * elle zayıflatılmaz (`.claude/skills/phase-01-auth-roles` İterasyon 1 risk notu).
 * Düz metin şifre hiçbir zaman loglanmaz veya persist edilmez
 * (`.claude/rules/03-security-baseline.md` madde 1).
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
