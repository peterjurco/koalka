import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { SeriesPoint } from './chartTypes.ts'

export interface BarChartProps {
  data: SeriesPoint[]
  xKey: string
  bars: { key: string; color: string; name?: string }[]
  height?: number
  layout?: 'vertical' | 'horizontal'
  /** If set, each data point can have this key (e.g. 'fill') for per-bar color */
  fillKey?: string
}

export function BarChart({
  data,
  xKey,
  bars,
  height = 300,
  layout = 'vertical',
  fillKey,
}: BarChartProps) {
  const isVertical = layout === 'vertical'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout={isVertical ? 'vertical' : 'horizontal'}
        margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        {isVertical ? (
          <>
            <XAxis type="number" />
            <YAxis type="category" dataKey={xKey} width={80} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} />
            <YAxis type="number" />
          </>
        )}
        <Tooltip />
        <Legend />
        {bars.map(({ key, color, name }) => (
          <Bar key={key} dataKey={key} name={name ?? key} fill={color}>
            {fillKey &&
              data.map((entry, i) => (
                <Cell key={i} fill={(entry[fillKey] as string) ?? color} />
              ))}
          </Bar>
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
