import { isValidMnemonic } from "@vault/chain-providers";
import { z } from "zod";

/**
 * Ortam değişkeni tam listesi ve temin yolu: `docs/09_DEV_WORKFLOW.md` §7.
 * Bu şema fail-fast doğrulama sağlar — eksik/geçersiz bir değişken varsa
 * uygulama `bootstrap()` aşamasında (bkz. `src/main.ts`) başlamadan durur.
 *
 * `COOKIE_SECURE` dışında hiçbir alanın kod-içi varsayılanı yoktur;
 * tek doğruluk kaynağı geliştiricinin kendi `apps/api/.env` dosyasıdır.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test"]),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),

  DATABASE_URL: z.string().url("DATABASE_URL geçerli bir bağlantı string'i olmalı"),
  REDIS_URL: z.string().url("REDIS_URL geçerli bir bağlantı string'i olmalı"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET en az 32 karakter olmalı"),
  JWT_ACCESS_TTL: z.string().min(1, "JWT_ACCESS_TTL boş olamaz"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET en az 32 karakter olmalı"),
  JWT_REFRESH_TTL: z.string().min(1, "JWT_REFRESH_TTL boş olamaz"),

  MASTER_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "MASTER_ENCRYPTION_KEY 32 byte'lık hex string (64 karakter) olmalı"),
  // ethers v6'nın kendi BIP-39 doğrulayıcısı (kelime listesi + checksum) —
  // yeni bir `bip39` bağımlılığı eklenmez (Faz 4 §4.2). Managed cüzdan
  // türetmesinin kök seed'i; `MASTER_ENCRYPTION_KEY` kadar kritik, log'a
  // asla yazılmaz (`docs/04_BACKEND_SPEC.md` §10).
  HD_WALLET_MNEMONIC: z
    .string()
    .refine(isValidMnemonic, "HD_WALLET_MNEMONIC geçerli bir BIP-39 mnemonic olmalı"),
  MINT_OPERATOR_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "MINT_OPERATOR_PRIVATE_KEY 0x önekli 32 byte'lık hex string olmalı"),

  SEPOLIA_RPC_URL: z.string().url("SEPOLIA_RPC_URL geçerli bir URL olmalı"),
  BSC_TESTNET_RPC_URL: z.string().url("BSC_TESTNET_RPC_URL geçerli bir URL olmalı"),
  TRON_SHASTA_RPC_URL: z.string().url("TRON_SHASTA_RPC_URL geçerli bir URL olmalı"),

  ALCHEMY_API_KEY: z.string().min(1, "ALCHEMY_API_KEY boş olamaz"),
  ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().min(1, "ALCHEMY_WEBHOOK_SIGNING_KEY boş olamaz"),
  TRONGRID_API_KEY: z.string().min(1, "TRONGRID_API_KEY boş olamaz"),
  // CoinGecko public tier için boş bırakılabilir (docs/09 §7).
  COINGECKO_API_KEY: z.string().optional(),

  // Sabit değer, genişletilmez: "11155111,97,shasta" — `networks.chain_id` ile
  // birebir aynı biçim (seed + docs/02 §2.2; provider constructor'ı bu değeri
  // `assertChainIdAllowed`'a geçirir). Genişletme değil, biçim eşleşmesi (docs/09 §7).
  CHAIN_ID_ALLOWLIST: z.string().min(1, "CHAIN_ID_ALLOWLIST boş olamaz"),
  CORS_ORIGIN: z.string().url("CORS_ORIGIN geçerli bir URL olmalı"),

  // Varsayılan `true`'dur; yalnızca yerel geliştirici açıkça "false" yazarak
  // kapatabilir (.claude/rules/03-security-baseline.md, mimari-kararlar SEC-007).
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((value) => value === "true"),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * `process.env`'i doğrular. Başarısızsa, tüm doğrulama hatalarını tek bir
 * okunabilir mesajda toplayan bir `Error` fırlatır — çağıran taraf (bkz.
 * `main.ts`) bunu yakalayıp `process.exit(1)` ile uygulamayı fail-fast durdurur.
 */
export function validateEnv(rawEnv: Record<string, string | undefined>): EnvConfig {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(bilinmeyen alan)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Ortam değişkenleri doğrulanamadı:\n${issues}`);
  }

  return result.data;
}
