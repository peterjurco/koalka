import { useMemo } from 'react'
import { useStore } from '../../state/store.ts'
import { LineChart } from '../../components/charts/LineChart.tsx'
import { Card } from '../../components/ui/Card.tsx'
import type { SeriesPoint } from '../../components/charts/chartTypes.ts'

export function MonthlyTrendChart() {
  const { filteredMonthlyAggregates, config } = useStore()
  if (!config) return null
  const { parties } = config

  const { data, lines } = useMemo(() => {
    const data: SeriesPoint[] = filteredMonthlyAggregates.map((m) => {
      const point: SeriesPoint = { month: m.monthKey }
      for (const party of parties) {
        point[party.id] = m.results[party.id] ?? 0
      }
      return point
    })
    const lines = parties
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ key: p.id, color: p.color, name: p.shortName }))
    return { data, lines }
  }, [filteredMonthlyAggregates, parties])

  if (data.length === 0) return null

  return (
    <Card title="Mesačné priemery">
      <LineChart data={data} xKey="month" lines={lines} yAxisLabel="%" />
    </Card>
  )
}
