/** One data point: x value + one or more y values (e.g. date + party percentages). Use null for missing data to show gaps in lines. */
export interface SeriesPoint {
  [key: string]: string | number | null
}

/** Config for one line in a line chart */
export interface LineConfig {
  key: string
  color: string
  name?: string
}

/** Config for one bar segment or series */
export interface BarSeriesConfig {
  key: string
  color: string
  name?: string
}
