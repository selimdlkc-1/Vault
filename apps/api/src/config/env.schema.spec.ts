import { validEnvFixture } from "./env.fixture";
import { validateEnv } from "./env.schema";

/** `env`'den verilen anahtarlar çıkarılmış bir kopya döner (eksik-değişken senaryoları için). */
function withoutKeys(env: Record<string, string>, keys: string[]): Record<string, string> {
  const copy = { ...env };
  for (const key of keys) {
    delete copy[key];
  }
  return copy;
}

/** Tüm zorunlu değişkenleri içeren, formatça geçerli bir env fixture'ı (paylaşılan). */
const validEnv: Record<string, string> = validEnvFixture;

describe("validateEnv", () => {
  it("tüm zorunlu değişkenler geçerliyken başarıyla parse eder", () => {
    const result = validateEnv(validEnv);

    expect(result.NODE_ENV).toBe("development");
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.COOKIE_SECURE).toBe(true);
  });

  it("COINGECKO_API_KEY olmadan da başarıyla parse eder (opsiyonel alan)", () => {
    expect(() => validateEnv(validEnv)).not.toThrow();
    expect(validateEnv(validEnv).COINGECKO_API_KEY).toBeUndefined();
  });

  it("COOKIE_SECURE belirtilmediğinde varsayılan olarak true döner", () => {
    const result = validateEnv(validEnv);
    expect(result.COOKIE_SECURE).toBe(true);
  });

  it("COOKIE_SECURE='false' açıkça verildiğinde false'a dönüşür", () => {
    const result = validateEnv({ ...validEnv, COOKIE_SECURE: "false" });
    expect(result.COOKIE_SECURE).toBe(false);
  });

  it.each([
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "MASTER_ENCRYPTION_KEY",
    "HD_WALLET_MNEMONIC",
    "MINT_OPERATOR_PRIVATE_KEY",
    "SEPOLIA_RPC_URL",
    "BSC_TESTNET_RPC_URL",
    "TRON_SHASTA_RPC_URL",
    "ALCHEMY_API_KEY",
    "ALCHEMY_WEBHOOK_SIGNING_KEY",
    "TRONGRID_API_KEY",
    "CHAIN_ID_ALLOWLIST",
    "CORS_ORIGIN",
    "NODE_ENV",
    "LOG_LEVEL",
  ])("%s eksikken doğrulama hatası fırlatır (fail-fast)", (missingKey) => {
    expect(() => validateEnv(withoutKeys(validEnv, [missingKey]))).toThrow();
  });

  it("NODE_ENV yalnızca development|test kabul eder — 'production' reddedilir", () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: "production" })).toThrow();
  });

  it("MASTER_ENCRYPTION_KEY 64 karakterlik hex değilse reddedilir", () => {
    expect(() => validateEnv({ ...validEnv, MASTER_ENCRYPTION_KEY: "not-a-hex-key" })).toThrow();
  });

  it("MINT_OPERATOR_PRIVATE_KEY '0x' önekiyle başlamıyorsa reddedilir", () => {
    expect(() =>
      validateEnv({ ...validEnv, MINT_OPERATOR_PRIVATE_KEY: "1".repeat(64) }),
    ).toThrow();
  });

  it("HD_WALLET_MNEMONIC 12 kelimeden azsa reddedilir", () => {
    expect(() => validateEnv({ ...validEnv, HD_WALLET_MNEMONIC: "kısa mnemonic" })).toThrow();
  });

  it("CORS_ORIGIN geçerli bir URL değilse reddedilir", () => {
    expect(() => validateEnv({ ...validEnv, CORS_ORIGIN: "not-a-url" })).toThrow();
  });

  it("birden fazla eksik/geçersiz alan tek bir hatada birleştirilir", () => {
    const rest = withoutKeys(validEnv, ["DATABASE_URL", "REDIS_URL"]);

    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
    expect(() => validateEnv(rest)).toThrow(/REDIS_URL/);
  });
});
