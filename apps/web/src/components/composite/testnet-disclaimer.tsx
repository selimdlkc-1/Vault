import { messages } from "@/lib/messages";

/**
 * `TestnetDisclaimer` ortak bileşeni (docs/06_SCREEN_CATALOG.md §6). "testnet
 * varlıkları — gösterge değerdir" ibaresini `authenticated` ve `admin`
 * layout'larının üstünde sabit gösterir; ekran bazında ayrıca eklenmez.
 */
export function TestnetDisclaimer() {
  return (
    <p className="bg-muted px-6 py-1.5 text-center text-xs text-muted-foreground">
      {messages.testnetDisclaimer}
    </p>
  );
}
