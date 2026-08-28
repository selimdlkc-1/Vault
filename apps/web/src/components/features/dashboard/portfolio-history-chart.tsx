import type { PortfolioHistoryPoint } from "@/hooks/use-portfolio-history";
import { messages } from "@/lib/messages";

interface PortfolioHistoryChartProps {
  points: PortfolioHistoryPoint[];
}

const WIDTH = 640;
const HEIGHT = 180;
const PAD = 8;

/**
 * Bağımlılıksız SVG çizgi grafiği (S-DASHBOARD geçmiş grafiği). Ayrı bir grafik
 * kütüphanesi eklemek ADR gerektirir (`.claude/rules/00`) ve demo ölçeğinde
 * over-engineering'dir (`.claude/rules/01`); snapshot serisi tek bir polyline
 * olarak yeterince okunur. En az 2 nokta yoksa boş durum döner.
 */
export function PortfolioHistoryChart({ points }: PortfolioHistoryChartProps) {
  if (points.length < 2) {
    return (
      <p className="rounded-lg border border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
        {messages.dashboard.historyEmpty}
      </p>
    );
  }

  const values = points.map((p) => Number(p.totalValueUsdt));
  const times = points.map((p) => new Date(p.timestamp).getTime());
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const valueSpan = maxValue - minValue || 1;
  const timeSpan = maxTime - minTime || 1;

  const coords = points.map((_, i) => {
    const x = PAD + ((times[i] - minTime) / timeSpan) * (WIDTH - 2 * PAD);
    const y =
      HEIGHT - PAD - ((values[i] - minValue) / valueSpan) * (HEIGHT - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const first = new Date(minTime).toLocaleDateString("tr-TR");
  const last = new Date(maxTime).toLocaleDateString("tr-TR");

  return (
    <figure className="rounded-lg border border-border p-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-44 w-full"
        role="img"
        aria-label={`Portföy değeri ${first} – ${last} arası değişimi`}
        preserveAspectRatio="none"
      >
        <polyline
          points={coords.join(" ")}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className="stroke-primary"
        />
      </svg>
      <figcaption className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{first}</span>
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}
