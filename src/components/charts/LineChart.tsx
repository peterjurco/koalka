import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "./chartTypes.ts";

export interface LineChartProps {
  data: SeriesPoint[];
  xKey: string;
  lines: { key: string; color: string; name?: string }[];
  height?: number;
  yAxisLabel?: string;
  /** Format the x-axis value shown as tooltip header (e.g. month). Receives label (string or number when x is numeric). */
  tooltipLabelFormatter?: (label: React.ReactNode) => React.ReactNode;
  /** 'category' = equal spacing (default); 'linear' = proportional to x values (e.g. time) */
  xAxisScale?: "category" | "linear";
  /** Format numeric x-axis ticks when xAxisScale is 'linear' */
  xAxisTickFormatter?: (value: number) => string;
  /** If false, null/undefined values in series create gaps in the line (default true for category, false for linear) */
  connectNulls?: boolean;
  /** Optional horizontal reference line (e.g. electoral threshold at 5%) */
  referenceLineY?: number;
  referenceLineLabel?: string;
  /** Format value in tooltip (default: X.X%) */
  valueFormatter?: (value: number) => string;
  /** Called when user clicks a data point; receives the full SeriesPoint payload */
  onPointClick?: (point: SeriesPoint) => void;
}

export function LineChart({
  data,
  xKey,
  lines,
  height = 300,
  yAxisLabel,
  tooltipLabelFormatter,
  xAxisScale = "category",
  xAxisTickFormatter,
  connectNulls,
  referenceLineY,
  referenceLineLabel,
  valueFormatter,
  onPointClick,
}: LineChartProps) {
  function handleChartClick(chartData: unknown) {
    const d = chartData as { activeIndex?: string | number } | null;
    if (d?.activeIndex == null) return;
    const index = parseInt(String(d.activeIndex));
    const payload = data[index];
    if (payload && onPointClick) onPointClick(payload);
  }

  const isLinear = xAxisScale === "linear";
  const shouldConnectNulls = connectNulls ?? !isLinear;
  const formatValue = valueFormatter ?? ((v: number) => `${v.toFixed(1)}%`);
  const labelStyle = { fill: "var(--chart-label-fill, #fff)" };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        style={onPointClick ? { cursor: "pointer" } : undefined}
        onClick={onPointClick ? handleChartClick : undefined}
      >
        <CartesianGrid strokeDasharray="3 3" />
        {referenceLineY != null && (
          <ReferenceLine
            y={referenceLineY}
            stroke="var(--reference-line-stroke, #ef4444)"
            strokeWidth={2}
            strokeDasharray="6 3"
            label={{
              value: referenceLineLabel ?? `${referenceLineY}%`,
              position: "insideTopRight",
              fill: "var(--reference-line-stroke, #ef4444)",
              fontWeight: 600,
              fontSize: 12,
            }}
          />
        )}
        <XAxis
          dataKey={xKey}
          type={isLinear ? "number" : "category"}
          domain={isLinear ? ["dataMin", "dataMax"] : undefined}
          tickFormatter={
            isLinear && xAxisTickFormatter ? xAxisTickFormatter : undefined
          }
          tick={labelStyle}
        />
        <YAxis
          label={
            yAxisLabel
              ? {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  style: labelStyle,
                }
              : undefined
          }
          tick={labelStyle}
        />
        <Tooltip
          labelFormatter={tooltipLabelFormatter}
          formatter={(value: number | undefined) =>
            value != null ? formatValue(value) : ""
          }
          contentStyle={{
            backgroundColor: "var(--tooltip-bg, #fff)",
            border: "1px solid var(--border, #ccc)",
            borderRadius: 4,
          }}
          labelStyle={{
            color: "var(--tooltip-fg, #333)",
            fontWeight: 600,
            marginBottom: 4,
          }}
          itemStyle={{ color: "var(--tooltip-fg, #333)" }}
        />
        <Legend wrapperStyle={labelStyle} formatter={(value) => <span style={labelStyle}>{value}</span>} />
        {lines.map(({ key, color, name }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={name ?? key}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={shouldConnectNulls}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
