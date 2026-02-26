import { useMemo } from 'react'
import { useStore } from '../../state/store.ts'
import { BarChart } from '../../components/charts/BarChart.tsx'
import { Card } from '../../components/ui/Card.tsx'

export function SeatOverview() {
  const { config, voteSource, seatAllocation } = useStore()
  const parties = config?.parties ?? []

  const dataWithColor = useMemo(() => {
    if (!config || !seatAllocation) return []
    return parties
      .filter((p) => (seatAllocation[p.id] ?? 0) > 0)
      .sort((a, b) => (seatAllocation[b.id] ?? 0) - (seatAllocation[a.id] ?? 0))
      .map((p) => ({ name: p.shortName, seats: seatAllocation[p.id] ?? 0, color: p.color }))
  }, [config, parties, seatAllocation])

  if (!config || !seatAllocation || dataWithColor.length === 0) return null

  const chartData = dataWithColor.map((d) => ({ name: d.name, seats: d.seats, fill: d.color }))

  return (
    <Card title="Alokácia kresiel">
      {voteSource && (
        <p className="hint">
          Podľa {voteSource.type === 'poll' ? 'vybraného prieskumu' : `mesačného priemeru ${voteSource.monthKey}`}.
        </p>
      )}
      <BarChart
        data={chartData}
        xKey="name"
        bars={[{ key: 'seats', color: '#888', name: 'Kreslá' }]}
        layout="vertical"
        fillKey="fill"
        height={Math.max(200, dataWithColor.length * 28)}
      />
    </Card>
  )
}
