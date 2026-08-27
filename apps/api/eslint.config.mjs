import vaultConfig from "@vault/config/eslint";

export default [
  // jest.config.js CommonJS tooling dosyasıdır (Node globals: module/require);
  // paylaşılan taban config bunları tanımadığından uygulama kodu dışında bırakılır.
  { ignores: ["jest.config.js"] },
  ...vaultConfig,
  {
    // NestJS dekoratör fabrikaları (`@Public()`, `@Roles()`, `@CurrentUser()`)
    // kullanım yerinde bir dekoratör/sınıf gibi okunur ve ekosistem genelinde
    // PascalCase yazılır — bu klasörde `variable` formatına PascalCase eklenir.
    files: ["src/common/decorators/**/*.ts"],
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
        },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["UPPER_CASE"] },
        { selector: "import", format: null },
        { selector: "objectLiteralProperty", format: null },
        { selector: "typeProperty", format: null },
      ],
    },
  },
];
