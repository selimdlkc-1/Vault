"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PortfolioHistoryChart } from "@/components/features/dashboard/portfolio-history-chart";
import { UsdtValue } from "@/components/composite/usdt-value";
import { Button, buttonClasses } from "@/components/ui/button";
import { useNetworks } from "@/hooks/use-networks";
import { usePortfolioHistory } from "@/hooks/use-portfolio-history";
import {
  usePortfolioSummary,
  type PortfolioWallet,
} from "@/hooks/use-portfolio-summary";
import { messages } from "@/lib/messages";
import { sumUsdtValues } from "@/lib/usdt";

const t = messages.dashboard;
const DAY_MS = 86_400_000;
const RANGES = [
  { days: 7, label: t.rangeLabels.d7 },
  { days: 30, label: t.rangeLabels.d30 },
  { days: 90, label: t.rangeLabels.d90 },
] as const;

/**
 * S-DASHBOARD (docs/06_SCREEN_CATALOG.md §4.2). Faz 1 §1.7 placeholder'ının yerini
 * alır. Toplam USDT değeri + cüzdan bazlı varlık dağılımı + tarih aralığı filtreli
 * geçmiş grafiği. Boş durumda (hiç cüzdan yok) toplam ve grafik gizlenir, CTA
 * ortada gösterilir.
 */
export default function DashboardPage() {
  const summary = usePortfolioSummary();
  const networks = useNetworks();
  const [now] = useState(() => Date.now());
  const [rangeDays, setRangeDays] = useState<number>(30);
  const range = useMemo(
    () => ({
      dateFrom: new Date(now - rangeDays * DAY_MS).toISOString(),
      dateTo: new Date(now).toISOString(),
    }),
    [now, rangeDays],
  );

  if (summary.isPending) {
    return <DashboardSkeleton />;
  }

  if (summary.isError) {
    return (
      <ErrorBanner
        message={t.loadError}
        onRetry={() => void summary.refetch()}
      />
    );
  }

  const wallets = summary.data.wallets;
  const networkName = (id: string) =>
    networks.data?.find((n) => n.id === id)?.name ?? id;

  if (wallets.length === 0) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">{t.empty}</p>
        <Link href="/wallets/add" className={buttonClasses("primary")}>
          {t.addWallet}
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {t.totalValueLabel}
          </span>
          <UsdtValue value={summary.data.totalValueUsdt} emphasis />
        </div>
        <Link href="/wallets/add" className={buttonClasses("secondary")}>
          {t.addWallet}
        </Link>
      </header>

      <HistorySection range={range} rangeDays={rangeDays} onRange={setRangeDays} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          {t.walletDistributionTitle}
        </h2>
        <ul className="flex flex-col gap-2">
          {wallets.map((wallet) => (
            <WalletRow
              key={wallet.walletId}
              wallet={wallet}
              networkName={networkName(wallet.networkId)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function HistorySection({
  range,
  rangeDays,
  onRange,
}: {
  range: { dateFrom: string; dateTo: string };
  rangeDays: number;
  onRange: (days: number) => void;
}) {
  const history = usePortfolioHistory(range);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">{t.historyTitle}</h2>
        <div className="flex gap-1" role="group" aria-label={t.historyTitle}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={rangeDays === r.days}
              onClick={() => onRange(r.days)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                rangeDays === r.days
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-zinc-900"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {history.isPending ? (
        <div
          className="h-44 animate-pulse rounded-lg border border-border bg-muted"
          aria-hidden
        />
      ) : history.isError ? (
        <ErrorBanner
          message={t.historyError}
          onRetry={() => void history.refetch()}
        />
      ) : (
        <PortfolioHistoryChart points={history.data} />
      )}
    </div>
  );
}

function WalletRow({
  wallet,
  networkName,
}: {
  wallet: PortfolioWallet;
  networkName: string;
}) {
  const walletTotal = sumUsdtValues(wallet.assets.map((a) => a.valueUsdt));

  return (
    <li>
      <Link
        href={`/wallets/${wallet.walletId}`}
        className="flex flex-col gap-2 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-900">
            {networkName}
          </span>
          <UsdtValue value={walletTotal} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {wallet.assets.length === 0 ? (
            <span>—</span>
          ) : (
            wallet.assets.map((asset) => (
              <span key={asset.assetId}>
                {asset.symbol}: <UsdtValue value={asset.valueUsdt} />
              </span>
            ))
          )}
        </div>
      </Link>
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

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8" aria-hidden>
      <div className="h-12 w-64 rounded-md bg-muted" />
      <div className="h-44 rounded-lg border border-border bg-muted" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg border border-border bg-muted" />
        ))}
      </div>
    </div>
  );
}
