"use client";

import Link from "next/link";
import { useState } from "react";
import type { WalletTypeValue } from "@vault/types";
import { UsdtValue } from "@/components/composite/usdt-value";
import { Button, buttonClasses } from "@/components/ui/button";
import { useNetworks } from "@/hooks/use-networks";
import { useWallets, type WalletListItem } from "@/hooks/use-wallets";
import { messages } from "@/lib/messages";
import { sumUsdtValues } from "@/lib/usdt";

const t = messages.wallets;

const TYPE_LABEL: Record<WalletTypeValue, string> = {
  watch_only: t.typeWatchOnly,
  managed: t.typeManaged,
};

/**
 * S-WALLET-LIST (docs/06_SCREEN_CATALOG.md §4.2). Kullanıcının tüm cüzdanları
 * ağ/tip filtreli bir tabloda. Satıra tıklama S-WALLET-DETAIL'e (İterasyon 7)
 * götürür — route hedefi burada tanımlanır.
 */
export default function WalletsPage() {
  const networks = useNetworks();
  const [networkId, setNetworkId] = useState<string>("");
  const [type, setType] = useState<"" | WalletTypeValue>("");

  const wallets = useWallets({
    networkId: networkId || undefined,
    type: type || undefined,
  });

  const networkName = (id: string) =>
    networks.data?.find((n) => n.id === id)?.name ?? id;

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-zinc-900">{t.title}</h1>
        <Link href="/wallets/add" className={buttonClasses("primary")}>
          {t.addWallet}
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.networkFilterLabel}
          <select
            value={networkId}
            onChange={(e) => setNetworkId(e.target.value)}
            className="h-9 rounded-md border border-border bg-white px-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <option value="">{t.filterAll}</option>
            {networks.data?.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.typeFilterLabel}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "" | WalletTypeValue)}
            className="h-9 rounded-md border border-border bg-white px-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <option value="">{t.filterAll}</option>
            <option value="watch_only">{t.typeWatchOnly}</option>
            <option value="managed">{t.typeManaged}</option>
          </select>
        </label>
      </div>

      {wallets.isPending ? (
        <ListSkeleton />
      ) : wallets.isError ? (
        <ErrorBanner
          message={t.loadError}
          onRetry={() => void wallets.refetch()}
        />
      ) : wallets.data.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t.empty}</p>
          <Link href="/wallets/add" className={buttonClasses("primary")}>
            {t.addWallet}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {wallets.data.map((wallet) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              networkName={networkName(wallet.networkId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function WalletRow({
  wallet,
  networkName,
}: {
  wallet: WalletListItem;
  networkName: string;
}) {
  const total = sumUsdtValues(wallet.balances.map((b) => b.valueUsdt));

  return (
    <li>
      <Link
        href={`/wallets/${wallet.id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-900">
            {networkName}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {TYPE_LABEL[wallet.type]}
          </span>
          <span
            className="font-mono text-xs text-muted-foreground"
            title={wallet.address}
          >
            {shortenAddress(wallet.address)}
          </span>
        </div>
        <UsdtValue value={total} />
      </Link>
    </li>
  );
}

/** Kısaltılmış adres (`0x1234...abcd`). Tam `AddressDisplay` bileşeni İterasyon 7'de. */
function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-danger/10 px-3 py-2">
      <p role="alert" className="text-sm text-danger">
        {message}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        {messages.common.retry}
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 rounded-lg border border-border bg-muted" />
      ))}
    </div>
  );
}
