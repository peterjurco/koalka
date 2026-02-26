import { useStore } from '../../state/store.ts'
import { Card } from '../../components/ui/Card.tsx'

export function MonthlySourceSelector() {
  const { filteredMonthlyAggregates, voteSource, setVoteSource } = useStore()

  if (filteredMonthlyAggregates.length === 0) return null

  return (
    <Card title="Mesačné priemery (zdroj hlasov)">
      <p className="hint">Vyberte mesiac, ktorého priemer sa použije na alokáciu kresiel a koalície.</p>
      <div className="month-buttons">
        {filteredMonthlyAggregates.map((m) => (
          <button
            key={m.monthKey}
            type="button"
            className={voteSource?.type === 'monthly' && voteSource.monthKey === m.monthKey ? 'selected' : ''}
            onClick={() =>
              setVoteSource(
                voteSource?.type === 'monthly' && voteSource.monthKey === m.monthKey
                  ? null
                  : { type: 'monthly', monthKey: m.monthKey }
              )
            }
          >
            {m.monthKey} ({m.pollCount} {m.pollCount === 1 ? 'prieskum' : m.pollCount >= 2 && m.pollCount <= 4 ? 'prieskumy' : 'prieskumov'})
          </button>
        ))}
      </div>
    </Card>
  )
}
