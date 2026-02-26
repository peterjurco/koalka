import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { SeriesPoint } from './chartTypes.ts'

export interface LineChartProps {
  data: SeriesPoint[]
  xKey: string
  lines: { key: string; color: string; name?: string }[]
  height?: number
  yAxisLabel?: string
  /** Format the x-axis value shown as tooltip header (e.g. month) */
  tooltipLabelFormatter?: (label: string) => React.ReactNode
}

export function LineChart({ data, xKey, lines, height = 300, yAxisLabel, tooltipLabelFormatter }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={xKey} />
        <YAxis label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined} />
        <Tooltip
          labelFormatter={tooltipLabelFormatter}
          formatter={(value: number | undefined) => (value != null ? `${value.toFixed(1)}%` : '')}
          contentStyle={{
            backgroundColor: 'var(--tooltip-bg, #fff)',
            border: '1px solid var(--border, #ccc)',
            borderRadius: 4,
          }}
          labelStyle={{
            color: 'var(--tooltip-fg, #333)',
            fontWeight: 600,
            marginBottom: 4,
          }}
          itemStyle={{ color: 'var(--tooltip-fg, #333)' }}
        />
        <Legend />
        {lines.map(({ key, color, name }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={name ?? key}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}
