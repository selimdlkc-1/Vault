"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { MovementDirectionValue } from "@vault/types";
import { ExplorerLink } from "@/components/composite/explorer-link";
import { UsdtValue } from "@/components/composite/usdt-value";
import { Button } from "@/components/ui/button";
import { useAssetCatalog } from "@/hooks/use-asset-catalog";
import { useMovements, type MovementItem } from "@/hooks/use-movements";
import { useNetworks } from "@/hooks/use-networks";
import { useWallets } from "@/hooks/use-wallets";
import { messages } from "@/lib/messages";
import { formatTokenAmount } from "@/lib/token-amount";

const t = messages.movements;

interface Filters {
  walletId: string;
  networkId: string;
  assetId: string;
  direction: "" | MovementDirectionValue;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = {
  walletId: "",
  networkId: "",
  assetId: "",
  direction: "",
  dateFrom: "",
  dateTo: "",
};

const selectClass =
  "h-9 rounded-md border border-border bg-white px-2 text-sm text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

/**
 * S-MOVEMENTS (`docs/06_SCREEN_CATALOG.md` §4.3). Kullanıcının cüzdanlarının
 * birleşik, filtrelenebilir zincir hareketi geçmişi. Bu fazda tüm satırlar
 * `source: 'chain'` (`transfers` tablosu Faz 5'te gelir — `docs/10` §3.6); satıra
 * tıklama yalnızca `ExplorerLink` üzerinden harici gezginde açılır, dahili
 * S-TRANSFER-DETAIL yönlendirmesi Faz 5'e aittir.
 *
 * `useSearchParams` Next 15'te Suspense sınırı ister; S-WALLET-DETAIL'in
 * "Tüm Hareketleri Gör" linki `?walletId=` ile buraya gelir.
 */
export default function MovementsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto h-96 max-w-4xl rounded-xl bg-muted"
          aria-hidden
        />
      }
    >
      <MovementsContent />
    </Suspense>
  );
}

function MovementsContent() {
  const initialWalletId = useSearchParams().get("walletId") ?? "";

  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    walletId: initialWalletId,
  });
  const [page, setPage] = useState(1);

  const wallets = useWallets();
  const networks = useNetworks();
  const catalog = useAssetCatalog();

  const dateRangeInvalid =
    !!filters.dateFrom &&
    !!filters.dateTo &&
    filters.dateFrom > filters.dateTo;

  const activeFilters = useMemo(
    () => (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).some((k) => filters[k] !== ""),
    [filters],
  );

  const movements = useMovements({
    page,
    walletId: filters.walletId || undefined,
    networkId: filters.networkId || undefined,
    assetId: filters.assetId || undefined,
    direction: filters.direction || undefined,
    // Geçersiz aralık backend'e gönderilmez — kullanıcı inline uyarıyı görür,
    // mevcut sonuç listesi kullanılabilir kalır.
    dateFrom: dateRangeInvalid ? undefined : filters.dateFrom || undefined,
    dateTo: dateRangeInvalid ? undefined : filters.dateTo || undefined,
  });

  const patch = (next: Partial<Filters>) => {
    setPage(1);
    setFilters((prev) => {
      const merged = { ...prev, ...next };
      // Ağ değişince, o ağa ait olmayan varlık filtresi düşer.
      if (next.networkId !== undefined && merged.assetId) {
        const asset = catalog.byId.get(merged.assetId);
        if (!asset || asset.networkId !== merged.networkId) merged.assetId = "";
      }
      return merged;
    });
  };

  const clearFilters = () => {
    setPage(1);
    setFilters(EMPTY_FILTERS);
  };

  const networkName = (id: string) =>
    networks.data?.find((n) => n.id === id)?.name ?? id;
  const chainId = (networkId: string) =>
    networks.data?.find((n) => n.id === networkId)?.chainId ?? "";

  const assetOptions = useMemo(() => {
    const all = [...catalog.byId.values()];
    const scoped = filters.networkId
      ? all.filter((a) => a.networkId === filters.networkId)
      : all;
    return scoped.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [catalog.byId, filters.networkId]);

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-900">{t.title}</h1>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.filterWalletLabel}
          <select
            value={filters.walletId}
            onChange={(e) => patch({ walletId: e.target.value })}
            className={selectClass}
          >
            <option value="">{t.filterAll}</option>
            {wallets.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {`${networkName(w.networkId)} · ${shorten(w.address)}`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.filterNetworkLabel}
          <select
            value={filters.networkId}
            onChange={(e) => patch({ networkId: e.target.value })}
            className={selectClass}
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
          {t.filterAssetLabel}
          <select
            value={filters.assetId}
            onChange={(e) => patch({ assetId: e.target.value })}
            className={selectClass}
          >
            <option value="">{t.filterAll}</option>
            {assetOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {filters.networkId ? a.symbol : `${a.symbol} · ${networkName(a.networkId)}`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.filterDirectionLabel}
          <select
            value={filters.direction}
            onChange={(e) =>
              patch({ direction: e.target.value as "" | MovementDirectionValue })
            }
            className={selectClass}
          >
            <option value="">{t.filterAll}</option>
            <option value="incoming">{t.directionIncoming}</option>
            <option value="outgoing">{t.directionOutgoing}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.filterDateFromLabel}
          <input
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || undefined}
            onChange={(e) => patch({ dateFrom: e.target.value })}
            className={selectClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.filterDateToLabel}
          <input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom || undefined}
            onChange={(e) => patch({ dateTo: e.target.value })}
            className={selectClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t.filterStateLabel}
          <select
            value=""
            disabled
            title={messages.testnetDisclaimer}
            className={selectClass}
          >
            <option value="">{t.filterAll}</option>
          </select>
        </label>

        {activeFilters ? (
          <Button variant="secondary" onClick={clearFilters}>
            {t.clearFilters}
          </Button>
        ) : null}
      </div>

      {dateRangeInvalid ? (
        <p role="alert" className="text-sm text-danger">
          {t.dateRangeError}
        </p>
      ) : null}

      <MovementsList
        query={movements}
        catalog={catalog}
        networkName={networkName}
        chainId={chainId}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        page={page}
        onPageChange={setPage}
      />
    </section>
  );
}

function MovementsList({
  query,
  catalog,
  networkName,
  chainId,
  activeFilters,
  onClearFilters,
  page,
  onPageChange,
}: {
  query: ReturnType<typeof useMovements>;
  catalog: ReturnType<typeof useAssetCatalog>;
  networkName: (id: string) => string;
  chainId: (id: string) => string;
  activeFilters: boolean;
  onClearFilters: () => void;
  page: number;
  onPageChange: (next: number) => void;
}) {
  if (query.isPending) {
    return <TableSkeleton />;
  }

  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md bg-danger/10 px-3 py-2">
        <p role="alert" className="text-sm text-danger">
          {t.loadError}
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {messages.common.retry}
        </Button>
      </div>
    );
  }

  const { data, pagination } = query.data;

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border px-6 py-16 text-center">
        <span aria-hidden className="text-2xl">
          🗒️
        </span>
        <p className="text-sm text-muted-foreground">
          {activeFilters ? t.emptyFiltered : t.emptyNoFilter}
        </p>
        {activeFilters ? (
          <Button variant="secondary" onClick={onClearFilters}>
            {t.clearFilters}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">{t.columnDate}</th>
              <th className="py-2 font-medium">{t.columnDirection}</th>
              <th className="py-2 font-medium">{t.columnAsset}</th>
              <th className="py-2 font-medium">{t.columnAmount}</th>
              <th className="py-2 text-right font-medium">{t.columnValue}</th>
              <th className="py-2 font-medium">{t.columnTx}</th>
              <th className="py-2 font-medium">{t.columnSource}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((movement) => (
              <MovementRow
                key={`${movement.txHash}-${movement.direction}-${movement.assetId}`}
                movement={movement}
                catalog={catalog}
                networkName={networkName}
                chainId={chainId(movement.networkId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {t.prevPage}
          </Button>
          <span className="text-xs text-muted-foreground">
            {`${t.pageWord} ${pagination.page} / ${pagination.totalPages}`}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pagination.totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            {t.nextPage}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function MovementRow({
  movement,
  catalog,
  networkName,
  chainId,
}: {
  movement: MovementItem;
  catalog: ReturnType<typeof useAssetCatalog>;
  networkName: (id: string) => string;
  chainId: string;
}) {
  const asset = catalog.byId.get(movement.assetId);
  const symbol = asset?.symbol ?? "—";
  const amount =
    asset === undefined
      ? movement.amount
      : formatTokenAmount(movement.amount, asset.decimals);
  const incoming = movement.direction === "incoming";

  return (
    <tr className="border-b border-border/60">
      <td className="py-2 text-muted-foreground">
        {dateFormat.format(new Date(movement.occurredAt))}
      </td>
      <td className="py-2">
        <span
          className={`inline-flex items-center gap-1 font-medium ${
            incoming ? "text-success" : "text-danger"
          }`}
        >
          <span aria-hidden>{incoming ? "↓" : "↑"}</span>
          {incoming ? t.directionIncoming : t.directionOutgoing}
        </span>
      </td>
      <td className="py-2 font-medium text-zinc-900">
        {symbol}
        <span className="ml-1 text-xs text-muted-foreground">
          {networkName(movement.networkId)}
        </span>
      </td>
      <td className="py-2 tabular-nums text-zinc-900">{amount}</td>
      <td className="py-2 text-right">
        <UsdtValue value={movement.valueUsdtAtTime} />
      </td>
      <td className="py-2">
        <ExplorerLink chainId={chainId} txHash={movement.txHash} />
      </td>
      <td className="py-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {movement.source === "system" ? t.sourceSystem : t.sourceChain}
        </span>
      </td>
    </tr>
  );
}

function shorten(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-11 rounded-lg border border-border bg-muted" />
      ))}
    </div>
  );
}
