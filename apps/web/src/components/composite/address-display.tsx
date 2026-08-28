"use client";

import { useState } from "react";
import { messages } from "@/lib/messages";

interface AddressDisplayProps {
  address: string;
  /** Kısaltma yapılmadan tam adres gösterilsin mi (dar alanlarda `false`). */
  full?: boolean;
}

/**
 * `AddressDisplay` ortak bileşeni (docs/06_SCREEN_CATALOG.md §6). Adresi
 * kısaltılmış gösterir (`0x1234...abcd`), tam adresi `title` (tooltip) üzerinde
 * taşır ve "kopyala" ikonuyla panoya kopyalar. S-WALLET-DETAIL, S-MOVEMENTS ve
 * watch-only ekleme özet adımında kullanılır.
 *
 * a11y: kopyala butonu gerçek `<button>` (klavye + odak tarayıcıdan); kopyalama
 * durumu yalnızca ikonla değil `aria-label` metniyle de belirtilir
 * (`.claude/rules/24` renk-bağımsız durum).
 */
export function AddressDisplay({ address, full = false }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const shown = full ? address : shortenAddress(address);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano erişimi reddedilirse sessiz geç — adres zaten tooltip'te görünür.
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm text-zinc-900" title={address}>
        {shown}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? messages.walletDetail.copied : messages.walletDetail.copyAddress}
        title={messages.walletDetail.copyAddress}
        className="rounded p-1 text-muted-foreground transition-colors hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

/** Kısaltılmış adres (`0x1234...abcd`). Çok kısa adresler olduğu gibi gösterilir. */
export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
