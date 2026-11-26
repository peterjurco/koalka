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
import type { TextProps } from "recharts";
import type { ReactNode } from "react";
import type { SeriesPoint } from "./chartTypes.ts";

type ChartMargin = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

export interface LineChartProps {
  data: SeriesPoint[];
  xKey: string;
  lines: { key: string; color: string; name?: string }[];
  height?: number;
  yAxisLabel?: string;
  /** Format the x-axis value shown as tooltip header (e.g. month). Receives label (string or number when x is numeric). */
  tooltipLabelFormatter?: (label: ReactNode) => ReactNode;
  /** 'category' = equal spacing (default); 'linear' = proportional to x values (e.g. time) */
  xAxisScale?: "category" | "linear";
  /** Format numeric x-axis ticks when xAxisScale is 'linear' */
  xAxisTickFormatter?: (value: number) => string;
  yAxisTickFormatter?: (value: number) => string;
  yAxisWidth?: number;
  chartMargin?: ChartMargin;
  axisTickStyle?: TextProps;
  /** If false, null/undefined values in series create gaps in the line (default true for category, false for linear) */
  connectNulls?: boolean;
  /** Optional horizontal reference line (e.g. electoral threshold at 5%) */
  referenceLineY?: number;
  referenceLineLabel?: string;
  /** Format value in tooltip (default: X.X%) */
  valueFormatter?: (value: number) => string;
  /** Called when user clicks a data point; receives the full SeriesPoint payload */
  onPointClick?: (point: SeriesPoint) => void;
  /** Show a marker dot on every data point (default true). Disable on dense/small charts. */
  showDots?: boolean;
  /**
   * Tooltip rows sharing a key are shown once (the first line in `lines` wins). Use it when
   * two series carry the same number at a point, e.g. a custom sum that is just one party.
   * Defaults to the series key, i.e. no deduplication.
   */
  tooltipDedupeKey?: (dataKey: string, point: SeriesPoint) => string;
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
  yAxisTickFormatter,
  yAxisWidth,
  chartMargin,
  axisTickStyle,
  connectNulls,
  referenceLineY,
  referenceLineLabel,
  valueFormatter,
  onPointClick,
  showDots = true,
  tooltipDedupeKey,
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
  const labelStyle = { fill: "var(--chart-label-fill, #888)" };
  const tickStyle = { ...labelStyle, fontSize: 12, ...axisTickStyle };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={chartMargin ?? { top: 5, right: 20, left: 0, bottom: 5 }}
        style={onPointClick ? { cursor: "pointer" } : undefined}
        onClick={onPointClick ? handleChartClick : undefined}
      >
        <CartesianGrid vertical={false} stroke="var(--chart-grid, #eee)" />
        {referenceLineY != null && (
          <ReferenceLine
            y={referenceLineY}
            stroke="var(--reference-line-stroke, #ef4444)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            label={
              referenceLineLabel
                ? {
                    value: referenceLineLabel,
                    position: "insideTopRight",
                    fill: "var(--reference-line-stroke, #ef4444)",
                    fontWeight: 600,
                    fontSize: 12,
                  }
                : undefined
            }
          />
        )}
        <XAxis
          dataKey={xKey}
          type={isLinear ? "number" : "category"}
          domain={isLinear ? ["dataMin", "dataMax"] : undefined}
          tickFormatter={
            isLinear && xAxisTickFormatter ? xAxisTickFormatter : undefined
          }
          tick={tickStyle}
          tickLine={false}
          axisLine={{ stroke: "var(--chart-axis, #ccc)" }}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          width={yAxisWidth}
          tickFormatter={yAxisTickFormatter}
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
          tick={tickStyle}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis, #ccc)", strokeWidth: 1 }}
          labelFormatter={tooltipLabelFormatter}
          payloadUniqBy={
            tooltipDedupeKey
              ? (entry) =>
                  tooltipDedupeKey(
                    String(entry.dataKey),
                    entry.payload as SeriesPoint,
                  )
              : undefined
          }
          formatter={(value) =>
            typeof value === "number" ? formatValue(value) : ""
          }
          contentStyle={{
            backgroundColor: "var(--tooltip-bg, #fff)",
            border: "1px solid var(--border, #ccc)",
            borderRadius: 10,
          }}
          labelStyle={{
            color: "var(--tooltip-fg, #333)",
            fontWeight: 600,
            marginBottom: 4,
          }}
          itemStyle={{ color: "var(--tooltip-fg, #333)" }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={labelStyle}
          formatter={(value) => (
            <span style={{ color: "var(--text, #333)" }}>{value}</span>
          )}
        />
        {lines.map(({ key, color, name }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            name={name ?? key}
            stroke={color}
            strokeWidth={2}
            dot={
              showDots
                ? { r: 2.5, strokeWidth: 1.5, fill: "var(--surface, #fff)" }
                : false
            }
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface, #fff)" }}
            connectNulls={shouldConnectNulls}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
