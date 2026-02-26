/** One data point: x value + one or more y values (e.g. date + party percentages) */
export interface SeriesPoint {
  [key: string]: string | number
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
