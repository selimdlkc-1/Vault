import vaultConfig from "@vault/config/eslint";

export default [
  // Hardhat üretilen çıktılar + Solidity kaynağı ESLint kapsamı dışında.
  {
    ignores: ["artifacts/**", "cache/**", "typechain-types/**", "contracts/**", "dist/**"],
  },
  ...vaultConfig,
];
