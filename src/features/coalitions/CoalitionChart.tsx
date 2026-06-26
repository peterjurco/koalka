import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Party } from '../../data/types.ts';
import type { CoalitionResult } from '../../core/coalition/types.ts';
import { useIsMobile } from '../../utils/useMediaQuery.ts';
import type { SavedCoalition } from './coalitionStorage.ts';

interface Props {
  coalitions: SavedCoalition[];
  coalitionResults: Array<CoalitionResult | null>;
  parties: Party[];
}

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  fill: string;
}

function CoalitionTooltip({
  active,
  payload,
  label,
  partyById,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  partyById: Map<string, Party>;
}) {
  if (!active || !payload?.length) return null;

  const entries = payload.filter((p) => p.value > 0);
  const total = entries.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="coalition-tooltip">
      <div className="coalition-tooltip-title">{label}</div>
      {entries.map((p) => (
        <div key={p.dataKey} className="coalition-tooltip-row">
          <span className="coalition-tooltip-dot" style={{ background: p.fill }} />
          <span className="coalition-tooltip-name">
            {partyById.get(p.dataKey)?.shortName ?? p.dataKey}
          </span>
          <span className="coalition-tooltip-val">{p.value}</span>
        </div>
      ))}
      <div className="coalition-tooltip-total">
        <span>Spolu</span>
        <span className="coalition-tooltip-val">{total}</span>
      </div>
    </div>
  );
}

type ChartRow = Record<string, string | number>;

/** Renders a party's abbreviation centred inside its stacked bar segment. */
function makeBarLabel(name: string) {
  // recharts' bar-label callback props aren't cleanly exported; read loosely.
  return function BarSegmentLabel(props: {
    x?: string | number;
    y?: string | number;
    width?: string | number;
    height?: string | number;
    value?: string | number | null;
  }) {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const value = Number(props.value ?? 0);
    // Skip empty segments and ones too short to fit any text.
    if (!value || value <= 0 || height < 9) return null;
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        style={{ fill: '#000', pointerEvents: 'none' }}
      >
        {name}
      </text>
    );
  };
}

export function CoalitionChart({ coalitions, coalitionResults, parties }: Props) {
  const isMobile = useIsMobile();

  if (coalitions.length === 0) {
    return (
      <div className="coalition-chart-empty">
        Pridajte koalíciu pomocou tlačidla nižšie.
      </div>
    );
  }

  const partyById = new Map(parties.map((p) => [p.id, p]));

  const allPartyIds = [...new Set(coalitions.flatMap((c) => c.partyIds))];

  const data: ChartRow[] = coalitions.map((coalition, i) => {
    const result = coalitionResults[i];
    const label = coalition.partyIds
      .map((id) => partyById.get(id)?.shortName ?? id)
      .join('+');
    const row: ChartRow = { label };
    for (const pid of allPartyIds) {
      row[pid] = coalition.partyIds.includes(pid)
        ? (result?.perPartySeats[pid] ?? 0)
        : 0;
    }
    return row;
  });

  // Y-axis tops out at 100 (keeps both majority lines comfortably in view) but
  // stretches in steps of 10 — up to the 150-seat parliament — if a coalition
  // climbs higher than that.
  const maxSeats = Math.max(0, ...coalitionResults.map((r) => r?.totalSeats ?? 0));
  const domainMax = maxSeats <= 100 ? 100 : Math.min(150, Math.ceil(maxSeats / 10) * 10);
  const baseTicks = [0, 30, 60, 76, 90, 120, 150].filter((t) => t <= domainMax);
  const yTicks = baseTicks.includes(domainMax) ? baseTicks : [...baseTicks, domainMax];

  // Columns are identified by the abbreviations inside each segment and the
  // cards below, so the x-axis needs no labels — keep just the baseline.
  const chartHeight = isMobile ? 300 : 360;

  return (
    <div className="coalition-chart-container">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          margin={{ top: 24, right: 12, bottom: 8, left: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid vertical={false} strokeOpacity={0.12} />
          <XAxis type="category" dataKey="label" tick={false} height={8} />
          <YAxis
            type="number"
            domain={[0, domainMax]}
            ticks={yTicks}
            tick={{ fontSize: 11 }}
            width={32}
          />
          <Tooltip
            cursor={{ fillOpacity: 0.08 }}
            content={(props) => (
              <CoalitionTooltip
                active={props.active}
                payload={props.payload as TooltipPayloadEntry[]}
                label={props.label as string}
                partyById={partyById}
              />
            )}
          />
          <ReferenceLine
            y={76}
            stroke="#f59e0b"
            strokeDasharray="5 3"
            strokeWidth={2}
          />
          <ReferenceLine
            y={90}
            stroke="#f87171"
            strokeDasharray="5 3"
            strokeWidth={2}
          />
          {allPartyIds.map((pid) => (
            <Bar
              key={pid}
              dataKey={pid}
              stackId="coalition"
              fill={partyById.get(pid)?.color ?? '#888'}
              isAnimationActive={false}
              radius={0}
              label={
                makeBarLabel(
                  partyById.get(pid)?.abbr ?? partyById.get(pid)?.shortName ?? pid,
                ) as never
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
