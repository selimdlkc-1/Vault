import vaultConfig from "@vault/config/eslint";

export default [
  // jest.config.js CommonJS tooling dosyasıdır (Node globals: module/require);
  // paylaşılan taban config bunları tanımadığından paket kodu dışında bırakılır
  // (apps/api/eslint.config.mjs ile aynı gerekçe).
  { ignores: ["jest.config.js"] },
  ...vaultConfig,
];
