"use client";

import { useState } from "react";
import { messages } from "@/lib/messages";

interface ExplorerLinkProps {
  /** `networks.chain_id` — Sepolia `"11155111"`, BSC Testnet `"97"`, Tron Shasta `"shasta"`. */
  chainId: string;
  /** İşlem hash'i (tam). */
  txHash: string;
}

/**
 * `ExplorerLink` ortak bileşeni (`docs/06_SCREEN_CATALOG.md` §6). Ağa göre doğru
 * testnet blok gezgini URL'ini üretir ve tx hash'i kısaltılmış olarak harici
 * sekmede açan bir link + panoya kopyala butonu gösterir. Tx hash gösteren her
 * yerde (S-MOVEMENTS, Faz 5'te S-TRANSFER-DETAIL) kullanılır.
 *
 * Bilinmeyen bir `chainId` için link üretmez, yalnızca kısaltılmış hash'i
 * gösterir (testnet ağ listesi genişlemedikçe tetiklenmez — `.claude/rules/00`
 * allowlist).
 *
 * a11y: link/buton gerçek `<a>`/`<button>` (klavye + odak tarayıcıdan);
 * `rel="noopener noreferrer"`, harici sekme ve kopyalama durumu `aria-label` ile
 * belirtilir (`.claude/rules/24` renk-bağımsız durum).
 */
export function ExplorerLink({ chainId, txHash }: ExplorerLinkProps) {
  const [copied, setCopied] = useState(false);
  const href = explorerTxUrl(chainId, txHash);
  const shown = shortenHash(txHash);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano erişimi reddedilirse sessiz geç — hash zaten tooltip'te görünür.
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={txHash}
          aria-label={`${messages.movements.explorerLinkAria}: ${shown}`}
          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {shown}
          <span aria-hidden>↗</span>
        </a>
      ) : (
        <span className="font-mono text-xs text-muted-foreground" title={txHash}>
          {shown}
        </span>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? messages.common.copied : messages.common.copy}
        title={messages.common.copy}
        className="rounded p-1 text-muted-foreground transition-colors hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

/**
 * Ağ blok gezgini işlem URL'i. EVM ağları `/tx/<hash>`, Tron `/#/transaction/<hash>`
 * biçimini kullanır (güncel testnet gezgin adresleri).
 */
export function explorerTxUrl(chainId: string, txHash: string): string | null {
  switch (chainId) {
    case "11155111":
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    case "97":
      return `https://testnet.bscscan.com/tx/${txHash}`;
    case "shasta":
      return `https://shasta.tronscan.org/#/transaction/${txHash}`;
    default:
      return null;
  }
}

/** Kısaltılmış hash (`0x1234...abcd`). Kısa hash'ler olduğu gibi gösterilir. */
export function shortenHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}
