/**
 * Testlerde paylaşılan, formatça geçerli env fixture'ı. Gerçek secret değil —
 * yalnızca `validateEnv` şemasını geçen deterministik placeholder'lar.
 *
 * `COOKIE_SECURE` ve `COINGECKO_API_KEY` bilinçli olarak yok: ikisi de opsiyonel
 * (`COOKIE_SECURE` varsayılanı `true`), varsayılan davranışları da bu fixture'la test edilir.
 */
export const validEnvFixture: Record<string, string> = {
  NODE_ENV: "development",
  LOG_LEVEL: "info",

  DATABASE_URL: "postgresql://vault:vault@localhost:5432/vault",
  REDIS_URL: "redis://localhost:6379",

  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_SECRET: "b".repeat(32),
  JWT_REFRESH_TTL: "7d",

  MASTER_ENCRYPTION_KEY: "0".repeat(64),
  HD_WALLET_MNEMONIC: "test test test test test test test test test test test junk",
  MINT_OPERATOR_PRIVATE_KEY: `0x${"1".repeat(64)}`,

  SEPOLIA_RPC_URL: "https://sepolia.infura.io/v3/dummy",
  BSC_TESTNET_RPC_URL: "https://bsc-testnet.publicnode.com",
  TRON_SHASTA_RPC_URL: "https://api.shasta.trongrid.io",

  ALCHEMY_API_KEY: "dummy-alchemy-key",
  ALCHEMY_WEBHOOK_SIGNING_KEY: "dummy-webhook-key",
  TRONGRID_API_KEY: "dummy-trongrid-key",

  CHAIN_ID_ALLOWLIST: "11155111,97,shasta",
  CORS_ORIGIN: "http://localhost:3000",
};
