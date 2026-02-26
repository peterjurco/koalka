import { useMemo } from 'react'
import type { PartyId } from '../../data/types.ts'
import { useStore } from '../../state/store.ts'
import { LineChart } from '../../components/charts/LineChart.tsx'
import { Card } from '../../components/ui/Card.tsx'
import type { SeriesPoint } from '../../components/charts/chartTypes.ts'
import type { PartySum } from './trendyStorage.ts'
import { getSumColor } from './trendyStorage.ts'

export interface PartyTrendChartProps {
  /** When provided, only these parties are shown in the chart */
  visiblePartyIds?: Set<PartyId>
  /** Custom sums (e.g. PS + SaS + KDH) */
  customSums?: PartySum[]
  /** Which custom sum IDs are visible in the chart */
  visibleSumIds?: Set<string>
}

export function PartyTrendChart({
  visiblePartyIds,
  customSums = [],
  visibleSumIds = new Set(),
}: PartyTrendChartProps) {
  const { filteredMonthlyAggregates, config } = useStore()
  if (!config) return null
  const { parties } = config

  const { data, lines } = useMemo(() => {
    const visible = visiblePartyIds ?? new Set(parties.map((p) => p.id))
    const partyList = parties
      .filter((p) => visible.has(p.id))
      .sort((a, b) => a.order - b.order)
    const sumList = customSums.filter((s) => visibleSumIds.has(s.id))

    const data: SeriesPoint[] = filteredMonthlyAggregates.map((m) => {
      const point: SeriesPoint = { month: m.monthKey }
      for (const party of partyList) {
        point[party.id] = m.results[party.id] ?? 0
      }
      for (const sum of sumList) {
        let value = 0
        for (const pid of sum.partyIds) {
          value += m.results[pid] ?? 0
        }
        point[sum.id] = value
      }
      return point
    })

    const partyLines = partyList.map((p) => ({ key: p.id, color: p.color, name: p.shortName }))
    const sumLines = sumList.map((s, i) => ({
      key: s.id,
      color: s.color ?? getSumColor(i),
      name: s.name,
    }))
    const lines = [...partyLines, ...sumLines]
    return { data, lines }
  }, [filteredMonthlyAggregates, parties, visiblePartyIds, customSums, visibleSumIds])

  if (data.length === 0 || lines.length === 0) return null

  const formatMonthHeader = (monthKey: string) => {
    const [y, m] = monthKey.split('-')
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1)
    return date.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' })
  }

  return (
    <Card title="Trendy strán">
      <LineChart
        data={data}
        xKey="month"
        lines={lines}
        yAxisLabel="%"
        tooltipLabelFormatter={formatMonthHeader}
      />
    </Card>
  )
}
