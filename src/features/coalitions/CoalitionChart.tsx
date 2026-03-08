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

export function CoalitionChart({ coalitions, coalitionResults, parties }: Props) {
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

  const longestLabel = coalitions.reduce((max, c) => {
    const len = c.partyIds.map((id) => partyById.get(id)?.shortName ?? id).join('+').length;
    return Math.max(max, len);
  }, 0);
  const yAxisWidth = Math.min(260, Math.max(140, longestLabel * 7 + 16));

  const chartHeight = coalitions.length * 52 + 80;

  return (
    <div className="coalition-chart-container">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 32, bottom: 8, left: 8 }}
          barCategoryGap="30%"
        >
          <CartesianGrid horizontal={false} strokeOpacity={0.12} />
          <XAxis
            type="number"
            domain={[0, 150]}
            ticks={[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150]}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={yAxisWidth}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
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
            x={76}
            stroke="#f59e0b"
            strokeDasharray="5 3"
            strokeWidth={2}
            label={{
              value: 'Väčšina (76)',
              position: 'insideTopRight',
              fontSize: 10,
              fill: '#f59e0b',
              dy: -2,
            }}
          />
          <ReferenceLine
            x={90}
            stroke="#f87171"
            strokeDasharray="5 3"
            strokeWidth={2}
            label={{
              value: 'Úst. väčšina (90)',
              position: 'insideTopRight',
              fontSize: 10,
              fill: '#f87171',
              dy: -2,
            }}
          />
          {allPartyIds.map((pid) => (
            <Bar
              key={pid}
              dataKey={pid}
              stackId="coalition"
              fill={partyById.get(pid)?.color ?? '#888'}
              isAnimationActive={false}
              radius={0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
