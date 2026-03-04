import { useMemo, useState, useCallback, type ReactNode } from "react";
import type { SeriesPoint } from "../../components/charts/chartTypes.ts";
import { LineChart } from "../../components/charts/LineChart.tsx";
import { Card } from "../../components/ui/Card.tsx";
import type { PartyId } from "../../data/types.ts";
import { useStore } from "../../state/store.ts";
import { PollDetailModal } from "./PollDetailModal.tsx";
import type { PartySum } from "./trendyStorage.ts";
import { getSumColor } from "./trendyStorage.ts";

// ---------------------------------------------------------------------------
// Month-based x encoding (aggregate mode): x = year*12 + month
// ---------------------------------------------------------------------------

function monthKeyToX(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return y * 12 + m;
}

function xToMonthKey(x: number): string {
  const year = Math.floor((x - 1) / 12);
  const month = ((x - 1) % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatXAsMonth(x: number): string {
  const [y, m] = xToMonthKey(x).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("sk-SK", {
    month: "short",
    year: "numeric",
  });
}

function monthRange(firstKey: string, lastKey: string): string[] {
  const start = monthKeyToX(firstKey);
  const end = monthKeyToX(lastKey);
  const keys: string[] = [];
  for (let x = start; x <= end; x++) keys.push(xToMonthKey(x));
  return keys;
}

// ---------------------------------------------------------------------------
// Day-based x encoding (individual poll mode): x = days since 2020-01-01
// ---------------------------------------------------------------------------

const DAY_EPOCH = new Date(2020, 0, 1).getTime();

function dateToX(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - DAY_EPOCH) / 86_400_000);
}

function xToDate(x: number): Date {
  return new Date(DAY_EPOCH + x * 86_400_000);
}

function formatXAsDay(x: number): string {
  return xToDate(x).toLocaleDateString("sk-SK", {
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------

export interface PartyTrendChartProps {
  visiblePartyIds?: Set<PartyId>;
  customSums?: PartySum[];
  visibleSumIds?: Set<string>;
}

export function PartyTrendChart({
  visiblePartyIds,
  customSums = [],
  visibleSumIds = new Set(),
}: PartyTrendChartProps) {
  const { filteredMonthlyAggregates, filteredPolls, filters, config, trendValueMode } =
    useStore();
  const isMandates = trendValueMode === "seatProjection";
  const isIndividualMode = filters.agency !== null && filters.agency !== "";

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

    // ------------------------------------------------------------------
    // Individual mode: one data point per poll, sorted by fieldworkEnd
    // ------------------------------------------------------------------
    if (isIndividualMode) {
      const sorted = [...filteredPolls].sort(
        (a, b) =>
          new Date(a.fieldworkEnd).getTime() -
          new Date(b.fieldworkEnd).getTime(),
      );
      if (sorted.length === 0) return { data: [] as SeriesPoint[], lines };

      const data: SeriesPoint[] = sorted.map((poll) => {
        const values =
          isMandates
            ? (poll.metadata?.seatProjection ?? {})
            : poll.results;
        const monthKey = poll.fieldworkEnd.slice(0, 7);
        const point: SeriesPoint = {
          x: dateToX(poll.fieldworkEnd),
          monthKey,
        };
        for (const party of partyList) {
          const beforeStart = party.start != null && monthKey < party.start;
          const afterEnd = party.end != null && monthKey > party.end;
          point[party.id] =
            beforeStart || afterEnd ? null : (values[party.id] ?? null);
        }
        for (const sum of sumList) {
          let value = 0;
          for (const pid of sum.partyIds) value += values[pid] ?? 0;
          point[sum.id] = value;
        }
        return point;
      });

      return { data, lines };
    }

    // ------------------------------------------------------------------
    // Aggregate mode: average per month (current behaviour)
    // ------------------------------------------------------------------
    const aggByMonth = new Map(
      filteredMonthlyAggregates.map((m) => [m.monthKey, m]),
    );
    const firstKey = filteredMonthlyAggregates[0]?.monthKey;
    const lastKey =
      filteredMonthlyAggregates[filteredMonthlyAggregates.length - 1]
        ?.monthKey;
    if (!firstKey || !lastKey) return { data: [] as SeriesPoint[], lines };

    const data: SeriesPoint[] = monthRange(firstKey, lastKey).map(
      (monthKey) => {
        const m = aggByMonth.get(monthKey);
        const point: SeriesPoint = { x: monthKeyToX(monthKey), monthKey };
        for (const party of partyList) {
          const beforeStart = party.start != null && monthKey < party.start;
          const afterEnd = party.end != null && monthKey > party.end;
          point[party.id] =
            beforeStart || afterEnd ? null : m ? (m.results[party.id] ?? 0) : null;
        }
        for (const sum of sumList) {
          if (m) {
            let value = 0;
            for (const pid of sum.partyIds) value += m.results[pid] ?? 0;
            point[sum.id] = value;
          } else {
            point[sum.id] = null;
          }
        }
        return point;
      },
    );

    return { data, lines };
  }, [
    config,
    filteredMonthlyAggregates,
    filteredPolls,
    filters.agency,
    isIndividualMode,
    isMandates,
    visiblePartyIds,
    customSums,
    visibleSumIds,
  ]);

  // Modal state
  const [modalPolls, setModalPolls] = useState<typeof filteredPolls>([]);
  const [modalTitle, setModalTitle] = useState("");

  const handlePointClick = useCallback(
    (point: SeriesPoint) => {
      if (isIndividualMode) {
        const x = point.x as number;
        const matched = filteredPolls.filter(
          (p) => dateToX(p.fieldworkEnd) === x,
        );
        if (matched.length === 0) return;
        const poll = matched[0]!;
        const dateLabel = xToDate(x).toLocaleDateString("sk-SK", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        setModalTitle(`${poll.agency} – ${dateLabel}`);
        setModalPolls(matched);
      } else {
        const monthKey = point.monthKey as string;
        if (!monthKey) return;
        const matched = filteredPolls.filter(
          (p) => p.fieldworkEnd.slice(0, 7) === monthKey,
        );
        if (matched.length === 0) return;
        const [y, m] = monthKey.split("-");
        const label = new Date(
          parseInt(y, 10),
          parseInt(m, 10) - 1,
          1,
        ).toLocaleDateString("sk-SK", { month: "long", year: "numeric" });
        setModalTitle(label);
        setModalPolls(matched);
      }
    },
    [isIndividualMode, filteredPolls],
  );

  if (!config || data.length === 0 || lines.length === 0) return null;

  const formatMonthHeader = (label: ReactNode): ReactNode => {
    if (label === undefined || label === null) return "";
    const monthKey =
      typeof label === "number" ? xToMonthKey(label) : String(label);
    const [y, m] = monthKey.split("-");
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleDateString(
      "sk-SK",
      { month: "long", year: "numeric" },
    );
  };

  const formatDayHeader = (label: ReactNode): ReactNode => {
    if (label === undefined || label === null) return "";
    const x = typeof label === "number" ? label : parseInt(String(label), 10);
    return xToDate(x).toLocaleDateString("sk-SK", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <>
      <Card title="Trendy strán">
        <LineChart
          data={data}
          xKey="x"
          lines={lines}
          height={640}
          yAxisLabel={isMandates ? "Mandáty" : "%"}
          tooltipLabelFormatter={isIndividualMode ? formatDayHeader : formatMonthHeader}
          xAxisScale="linear"
          xAxisTickFormatter={isIndividualMode ? formatXAsDay : formatXAsMonth}
          connectNulls={!isIndividualMode}
          referenceLineY={isMandates ? undefined : 5}
          referenceLineLabel={isMandates ? undefined : "5 % (volebné kvórum)"}
          valueFormatter={isMandates ? (v) => String(Math.round(v)) : undefined}
          onPointClick={handlePointClick}
        />
      </Card>

      {modalPolls.length > 0 && config && (
        <PollDetailModal
          polls={modalPolls}
          parties={config.parties}
          thresholdPercent={config.rules.thresholdPercent}
          trendValueMode={trendValueMode}
          title={modalTitle}
          onClose={() => setModalPolls([])}
        />
      )}
    </>
  );
}
