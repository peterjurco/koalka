import { useStore } from '../../state/store.ts'
import { Card } from '../../components/ui/Card.tsx'
import { formatPercent } from '../../utils/index.ts'

export function CoalitionBuilder() {
  const {
    config,
    voteSource,
    selectedCoalitionPartyIds,
    coalitionResult,
    toggleCoalitionParty,
  } = useStore()

  if (!config) return null
  const { parties, rules } = config

  return (
    <Card title="Vlastné koalície">
      <p className="hint">Vyberte prieskum alebo priemer v toolbare vyššie, potom zvoľte strany do koalície.</p>
      <div className="coalition-parties">
        {parties.sort((a, b) => a.order - b.order).map((p) => (
          <label key={p.id} className="party-checkbox">
            <input
              type="checkbox"
              checked={selectedCoalitionPartyIds.includes(p.id)}
              onChange={() => toggleCoalitionParty(p.id)}
              disabled={!voteSource}
            />
            <span className="party-color" style={{ backgroundColor: p.color }} />
            <span>{p.shortName}</span>
          </label>
        ))}
      </div>
      {coalitionResult && (
        <div className="coalition-result">
          <p>
            <strong>Podiel hlasov:</strong> {formatPercent(coalitionResult.totalVotePercent)}
          </p>
          <p>
            <strong>Kreslá:</strong> {coalitionResult.totalSeats} / {rules.totalSeats}
            {coalitionResult.majority ? ' (väčšina)' : ` (na väčšinu treba ${coalitionResult.majorityThreshold})`}
          </p>
        </div>
      )}
    </Card>
  )
}
