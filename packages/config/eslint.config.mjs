// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Paylaşılan taban ESLint yapılandırması.
 * `.claude/rules/02-language-naming.md` naming convention'ını zorlar:
 * camelCase fonksiyon/değişken, PascalCase class/type, UPPER_CASE enum/const.
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "default", format: ["camelCase"] },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
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
  {
    ignores: ["dist/**", ".next/**", "node_modules/**", ".turbo/**"],
  },
);
