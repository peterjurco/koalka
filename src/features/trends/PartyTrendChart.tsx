import { useMemo, type ReactNode } from "react";
import type { SeriesPoint } from "../../components/charts/chartTypes.ts";
import { LineChart } from "../../components/charts/LineChart.tsx";
import { Card } from "../../components/ui/Card.tsx";
import type { PartyId } from "../../data/types.ts";
import { useStore } from "../../state/store.ts";
import type { PartySum } from "./trendyStorage.ts";
import { getSumColor } from "./trendyStorage.ts";

/** Month key "YYYY-MM" → numeric x for proportional time axis (x = year*12 + month, month 1–12) */
function monthKeyToX(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return y * 12 + m;
}

/** Numeric x → month key "YYYY-MM". x = year*12+month so e.g. Dec 2025 = 24312; must not use x/12 for year (24312/12=2026). */
function xToMonthKey(x: number): string {
  const year = Math.floor((x - 1) / 12);
  const month = ((x - 1) % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Numeric x → formatted month for axis/tooltip */
function formatXAsMonth(x: number): string {
  const [y, m] = xToMonthKey(x).split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString("sk-SK", { month: "short", year: "numeric" });
}

/** List all month keys from first to last (inclusive) */
function monthRange(firstKey: string, lastKey: string): string[] {
  const start = monthKeyToX(firstKey);
  const end = monthKeyToX(lastKey);
  const keys: string[] = [];
  for (let x = start; x <= end; x++) {
    keys.push(xToMonthKey(x));
  }
  return keys;
}

export interface PartyTrendChartProps {
  /** When provided, only these parties are shown in the chart */
  visiblePartyIds?: Set<PartyId>;
  /** Custom sums (e.g. PS + SaS + KDH) */
  customSums?: PartySum[];
  /** Which custom sum IDs are visible in the chart */
  visibleSumIds?: Set<string>;
}

export function PartyTrendChart({
  visiblePartyIds,
  customSums = [],
  visibleSumIds = new Set(),
}: PartyTrendChartProps) {
  const { filteredMonthlyAggregates, config, trendValueMode } = useStore();
  const isMandates = trendValueMode === "seatProjection";

  const { data, lines } = useMemo(() => {
    if (!config)
      return {
        data: [] as SeriesPoint[],
        lines: [] as { key: string; color: string; name?: string }[],
      };
    const parties = config.parties;
    const visible = visiblePartyIds ?? new Set(parties.map((p) => p.id));
    const partyList = parties
      .filter((p) => visible.has(p.id))
      .sort((a, b) => a.order - b.order);
    const sumList = customSums.filter((s) => visibleSumIds.has(s.id));

    const aggByMonth = new Map(
      filteredMonthlyAggregates.map((m) => [m.monthKey, m]),
    );
    const firstKey = filteredMonthlyAggregates[0]?.monthKey;
    const lastKey =
      filteredMonthlyAggregates[filteredMonthlyAggregates.length - 1]?.monthKey;
    if (!firstKey || !lastKey) return { data: [] as SeriesPoint[], lines: [] };

    const allMonths = monthRange(firstKey, lastKey);
    const data: SeriesPoint[] = allMonths.map((monthKey) => {
      const m = aggByMonth.get(monthKey);
      const point: SeriesPoint = { x: monthKeyToX(monthKey), monthKey };
      for (const party of partyList) {
        const beforeStart = party.start != null && monthKey < party.start;
        const afterEnd = party.end != null && monthKey > party.end;
        point[party.id] =
          beforeStart || afterEnd
            ? null
            : m
              ? (m.results[party.id] ?? 0)
              : null;
      }
      for (const sum of sumList) {
        if (m) {
          let value = 0;
          for (const pid of sum.partyIds) {
            value += m.results[pid] ?? 0;
          }
          point[sum.id] = value;
        } else {
          point[sum.id] = null;
        }
      }
      return point;
    });

    const partyLines = partyList.map((p) => ({
      key: p.id,
      color: p.color,
      name: p.shortName,
    }));
    const sumLines = sumList.map((s, i) => ({
      key: s.id,
      color: s.color ?? getSumColor(i),
      name: s.name,
    }));
    const lines = [...partyLines, ...sumLines];
    return { data, lines };
  }, [
    config,
    filteredMonthlyAggregates,
    visiblePartyIds,
    customSums,
    visibleSumIds,
  ]);

  if (!config || data.length === 0 || lines.length === 0) return null;

  const formatMonthHeader = (label: ReactNode): ReactNode => {
    if (label === undefined || label === null) return "";
    const monthKey =
      typeof label === "number" ? xToMonthKey(label) : String(label);
    const [y, m] = monthKey.split("-");
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString("sk-SK", { month: "long", year: "numeric" });
  };

  return (
    <Card title="Trendy strán">
      <LineChart
        data={data}
        xKey="x"
        lines={lines}
        height={640}
        yAxisLabel={isMandates ? "Mandáty" : "%"}
        tooltipLabelFormatter={formatMonthHeader}
        xAxisScale="linear"
        xAxisTickFormatter={formatXAsMonth}
        connectNulls
        referenceLineY={isMandates ? undefined : 5}
        referenceLineLabel={isMandates ? undefined : "5 % (volebný limit)"}
        valueFormatter={isMandates ? (v) => String(Math.round(v)) : undefined}
      />
    </Card>
  );
}
