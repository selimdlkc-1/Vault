import type { Config } from "tailwindcss";

/**
 * Tasarım token'ları (docs/05_FRONTEND_SPEC.md §7). Renkler doğrudan class
 * isimleriyle kullanılır (`bg-primary`, `text-danger`); bileşen kodunda ham hex
 * yazılmaz. Palet Faz 3+ ekranları geldikçe genişletilir.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2563eb",
          foreground: "#ffffff",
          hover: "#1d4ed8",
        },
        danger: {
          DEFAULT: "#dc2626",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#f4f4f5",
          foreground: "#71717a",
        },
        border: "#e4e4e7",
      },
    },
  },
  plugins: [],
};

export default config;
