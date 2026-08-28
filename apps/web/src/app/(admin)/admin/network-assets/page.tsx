"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNetworkAssets, type NetworkAsset } from "@/hooks/use-network-assets";
import { useNetworks, type Network } from "@/hooks/use-networks";
import { useToggleNetworkAsset } from "@/hooks/use-toggle-network-asset";
import { messages } from "@/lib/messages";

const t = messages.admin.networkAssets;

/**
 * S-ADMIN-NETWORK-ASSETS (docs/06_SCREEN_CATALOG.md §4.4). Network/asset
 * kataloğunu listeler; her satırda aktif/pasif switch toggle anında `PATCH`
 * tetikler (ayrı "Kaydet" yok). Faz 2 İnsan onay noktasının frontend tarafı.
 */
export default function NetworkAssetsPage() {
  const networks = useNetworks();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900">{t.title}</h1>

      {networks.isPending ? <TableSkeleton /> : null}

      {networks.isError ? (
        <ErrorBanner
          message={t.loadError}
          onRetry={() => void networks.refetch()}
        />
      ) : null}

      {networks.data?.map((network) => (
        <NetworkSection
          key={network.id}
          network={network}
          onToggleError={() => setToast(t.toggleError)}
        />
      ))}

      {toast ? (
        <div
          role="alert"
          className="fixed bottom-4 right-4 max-w-xs rounded-md bg-danger px-4 py-3 text-sm text-danger-foreground shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </section>
  );
}

function NetworkSection({
  network,
  onToggleError,
}: {
  network: Network;
  onToggleError: () => void;
}) {
  const assets = useNetworkAssets(network.id);
  const toggle = useToggleNetworkAsset(network.id);

  return (
    <div className="rounded-xl border border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{network.name}</h2>
        <p className="text-xs text-muted-foreground">
          {network.chainType.toUpperCase()} · chainId {network.chainId}
        </p>
      </div>

      {assets.isPending ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {messages.common.loading}
        </div>
      ) : null}

      {assets.isError ? (
        <div className="px-4 py-3">
          <ErrorBanner
            message={t.loadError}
            onRetry={() => void assets.refetch()}
          />
        </div>
      ) : null}

      {assets.data ? (
        <ul>
          {assets.data.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              pending={
                toggle.isPending && toggle.variables?.assetId === asset.id
              }
              onToggle={(next) =>
                toggle.mutate(
                  { assetId: asset.id, isActive: next },
                  { onError: onToggleError },
                )
              }
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AssetRow({
  asset,
  pending,
  onToggle,
}: {
  asset: NetworkAsset;
  pending: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-zinc-900">{asset.symbol}</p>
        {!asset.isActive ? (
          <p className="text-xs text-muted-foreground">{t.readonlyNote}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-medium ${
            asset.isActive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {asset.isActive ? t.statusActive : t.statusPassive}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={asset.isActive}
          aria-label={`${asset.symbol} — ${
            asset.isActive ? t.statusActive : t.statusPassive
          }`}
          disabled={pending}
          onClick={() => onToggle(!asset.isActive)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${
            asset.isActive ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              asset.isActive ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </li>
  );
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

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 rounded-xl border border-border bg-muted" />
      ))}
    </div>
  );
}
