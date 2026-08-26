import vaultConfig from "@vault/config/eslint";

export default [
  // jest.config.js CommonJS tooling dosyasıdır (Node globals: module/require);
  // paylaşılan taban config bunları tanımadığından uygulama kodu dışında bırakılır.
  { ignores: ["jest.config.js"] },
  ...vaultConfig,
];
