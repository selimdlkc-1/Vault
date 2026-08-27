import type { Metadata } from "next";
import { SessionExpiredDialog } from "@/components/features/session-expired-dialog";
import { Providers } from "@/context/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vault",
  description: "Testnet portföy ve transfer uygulaması",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <Providers>
          {children}
          <SessionExpiredDialog />
        </Providers>
      </body>
    </html>
  );
}
