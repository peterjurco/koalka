import { useRef, useState } from 'react';
import { TrashIcon } from '../../icons/TrashIcon.tsx';
import type { ElectionRules, Party, PartyId } from '../../data/types.ts';
import type { CoalitionResult } from '../../core/coalition/types.ts';
import { isElectoralList } from '../../core/coalition/electoralLists.ts';
import { ElectoralListBadge } from '../../components/ui/ElectoralListBadge.tsx';
import { useIsMobile } from '../../utils/useMediaQuery.ts';
import type { SavedCoalition } from './coalitionStorage.ts';

interface Props {
  coalitions: SavedCoalition[];
  coalitionResults: Array<CoalitionResult | null>;
  parties: Party[];
  rules: ElectionRules;
  onAdd: (coalition: SavedCoalition) => void;
  onRemove: (id: string) => void;
  /** Add parties to an existing coalition (used to complete a joint electoral list) */
  onAddParties: (id: string, partyIds: PartyId[]) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

/**
 * Coloured party chips (e.g. "SaS + KDH + Demokrati"), shared by table & cards.
 * In a poll that reports a joint electoral list, the chips show what is actually counted:
 * "PS + Demokrati" with a coalition badge instead of the two parties. Selected parties that
 * are left out (only part of a list selected) are shown struck through.
 */
function PartyChips({
  coalition,
  result,
  partyById,
  rules,
}: {
  coalition: SavedCoalition;
  result: CoalitionResult | null;
  partyById: Map<string, Party>;
  rules: ElectionRules;
}) {
  const excluded = new Set(result?.blocked.flatMap((b) => b.selected) ?? []);
  const items: { id: string; excluded: boolean }[] = result
    ? [
        ...result.partyIds.map((id) => ({ id, excluded: false })),
        ...coalition.partyIds.filter((id) => excluded.has(id)).map((id) => ({ id, excluded: true })),
      ]
    : coalition.partyIds.map((id) => ({ id, excluded: false }));

  return (
    <div className="coalition-party-chips">
      {items.map(({ id: pid, excluded: isExcluded }, j) => {
        const party = partyById.get(pid);
        return (
          <span
            key={pid}
            className={`coalition-party-chip${isExcluded ? ' coalition-party-chip--excluded' : ''}`}
            title={isExcluded ? 'V tomto prieskume sa nezapočítava' : undefined}
          >
            <span
              className="coalition-party-dot"
              style={{ backgroundColor: party?.color ?? '#888' }}
            />
            <span>{party?.shortName ?? pid}</span>
            <ElectoralListBadge party={party} rules={rules} compact />
            {j < items.length - 1 && <span className="coalition-chip-plus">+</span>}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Shown when a coalition contains only part of a joint electoral list, e.g. PS without
 * Demokrati in a poll that reports "PS + Demokrati": that share cannot be split, so the
 * list is not counted. One click adds the missing members.
 */
function ListNotice({
  coalition,
  result,
  partyById,
  onAddParties,
}: {
  coalition: SavedCoalition;
  result: CoalitionResult | null;
  partyById: Map<string, Party>;
  onAddParties: (id: string, partyIds: PartyId[]) => void;
}) {
  if (!result || result.blocked.length === 0) return null;
  const name = (id: string) => partyById.get(id)?.shortName ?? id;
  return (
    <>
      {result.blocked.map((b) => {
        const selected = b.selected.map(name).join(', ');
        const missing = b.missing.map(name).join(', ');
        return (
          <div key={b.listId} className="coalition-list-notice" role="note">
            <span>
              ⚠ {selected} v tomto prieskume {b.selected.length > 1 ? 'kandidujú' : 'kandiduje'} ako{' '}
              <strong>{name(b.listId)}</strong> a {b.selected.length > 1 ? 'nemajú' : 'nemá'} samostatné
              číslo, preto sa nezapočítava.
            </span>
            <button
              type="button"
              className="coalition-list-notice-btn"
              onClick={() => onAddParties(coalition.id, b.missing)}
            >
              Pridať {missing}
            </button>
          </div>
        );
      })}
    </>
  );
}

/** Majority indicator: green ✓ when reached, otherwise how many seats short. */
function MajorityBadge({ short }: { short: number | null }) {
  if (short === null) return <span className="coalition-td--loading">–</span>;
  return short <= 0 ? (
    <span className="coalition-majority-yes">✓</span>
  ) : (
    <span className="coalition-majority-no">−{short}</span>
  );
}

export function CoalitionBuilder({
  coalitions,
  coalitionResults,
  parties,
  rules,
  onAdd,
  onRemove,
  onAddParties,
  onReorder,
}: Props) {
  const isMobile = useIsMobile();
  const [isAdding, setIsAdding] = useState(false);
  const [draftPartyIds, setDraftPartyIds] = useState<string[]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);

  const partyById = new Map(parties.map((p) => [p.id, p]));
  const sortedParties = [...parties].sort((a, b) => a.order - b.order);

  const handleToggleDraft = (id: string) => {
    setDraftPartyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // An electoral list toggles all its member parties at once; coalitions are saved as
  // member parties so they keep working in polls that still report them separately.
  const handleToggleDraftList = (members: PartyId[]) => {
    setDraftPartyIds((prev) =>
      members.every((m) => prev.includes(m))
        ? prev.filter((x) => !members.includes(x))
        : [...prev, ...members.filter((m) => !prev.includes(m))],
    );
  };

  const handleConfirmAdd = () => {
    if (draftPartyIds.length === 0) return;
    onAdd({ id: `user-${Date.now()}`, partyIds: [...draftPartyIds] });
    setDraftPartyIds([]);
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setDraftPartyIds([]);
    setIsAdding(false);
  };

  return (
    <div className="coalition-builder">
      <div className="coalition-builder-header">
        <h2 className="coalition-builder-title">Koalície</h2>
        <button
          type="button"
          className="trendy-add-sum-btn"
          onClick={() => setIsAdding(true)}
          title="Pridať koalíciu"
        >
          +
        </button>
      </div>

      {coalitions.length === 0 ? (
        <p className="coalition-empty-hint">Zatiaľ žiadna koalícia. Pridajte pomocou tlačidla +.</p>
      ) : isMobile ? (
        /* --- Mobile: card list, no horizontal scroll --- */
        <ul className="coalition-card-list">
          {coalitions.map((coalition, i) => {
            const result = coalitionResults[i] ?? null;
            const seats = result?.totalSeats ?? null;
            const toMajority = seats !== null ? 76 - seats : null;
            const toConstitutional = seats !== null ? 90 - seats : null;

            return (
              <li key={coalition.id} className="coalition-card">
                <div className="coalition-card-top">
                  <PartyChips coalition={coalition} result={result} partyById={partyById} rules={rules} />
                  <button
                    type="button"
                    className="trendy-sum-remove"
                    onClick={() => onRemove(coalition.id)}
                    title="Odstrániť koalíciu"
                    aria-label="Odstrániť koalíciu"
                  >
                    <TrashIcon />
                  </button>
                </div>
                <ListNotice
                  coalition={coalition}
                  result={result}
                  partyById={partyById}
                  onAddParties={onAddParties}
                />
                <div className="coalition-card-stats">
                  <div className="coalition-card-stat coalition-card-stat--seats">
                    <span className="coalition-card-stat-value">
                      {seats !== null ? seats : '–'}
                    </span>
                    <span className="coalition-card-stat-label">mandátov</span>
                  </div>
                  <div className="coalition-card-stat">
                    <span className="coalition-card-stat-value">
                      <MajorityBadge short={toMajority} />
                    </span>
                    <span className="coalition-card-stat-label">Väčšina (76)</span>
                  </div>
                  <div className="coalition-card-stat">
                    <span className="coalition-card-stat-value">
                      <MajorityBadge short={toConstitutional} />
                    </span>
                    <span className="coalition-card-stat-label">Úst. (90)</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        /* --- Desktop: sortable table --- */
        <table className="coalition-table">
          <thead>
            <tr>
              <th className="coalition-th coalition-th--drag" />
              <th className="coalition-th coalition-th--name">Koalícia</th>
              <th className="coalition-th coalition-th--seats">Mandáty</th>
              <th className="coalition-th coalition-th--majority">Väčšina (76)</th>
              <th className="coalition-th coalition-th--majority">Úst. väčšina (90)</th>
              <th className="coalition-th coalition-th--remove" />
            </tr>
          </thead>
          <tbody>
            {coalitions.map((coalition, i) => {
              const result = coalitionResults[i] ?? null;
              const seats = result?.totalSeats ?? null;
              const toMajority = seats !== null ? 76 - seats : null;
              const toConstitutional = seats !== null ? 90 - seats : null;

              return (
                <tr
                  key={coalition.id}
                  className={`coalition-row${dragOverIndex === i ? ' coalition-row--drag-over' : ''}`}
                  draggable
                  onDragStart={() => { dragIndex.current = i; }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={() => {
                    if (dragIndex.current !== null && dragIndex.current !== i) {
                      onReorder(dragIndex.current, i);
                    }
                    dragIndex.current = null;
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => { dragIndex.current = null; setDragOverIndex(null); }}
                >
                  <td className="coalition-td coalition-td--drag">
                    <span className="coalition-drag-handle" title="Presunúť">⠿</span>
                  </td>
                  <td className="coalition-td coalition-td--name">
                    <PartyChips coalition={coalition} result={result} partyById={partyById} rules={rules} />
                    <ListNotice
                      coalition={coalition}
                      result={result}
                      partyById={partyById}
                      onAddParties={onAddParties}
                    />
                  </td>
                  <td className="coalition-td coalition-td--seats">
                    {seats !== null ? (
                      <strong>{seats}</strong>
                    ) : (
                      <span className="coalition-td--loading">–</span>
                    )}
                  </td>
                  <td className="coalition-td coalition-td--majority">
                    <MajorityBadge short={toMajority} />
                  </td>
                  <td className="coalition-td coalition-td--majority">
                    <MajorityBadge short={toConstitutional} />
                  </td>
                  <td className="coalition-td coalition-td--remove">
                    <button
                      type="button"
                      className="trendy-sum-remove"
                      onClick={() => onRemove(coalition.id)}
                      title="Odstrániť koalíciu"
                      aria-label={`Odstrániť koalíciu`}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {isAdding && (
        <div className="modal-backdrop" onClick={handleCancelAdd}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Pridať koalíciu</h3>
            <p className="modal-hint">Vyberte strany, ktoré budú tvoriť koalíciu:</p>
            <ul className="modal-party-list">
              {sortedParties.map((p) => {
                const members = isElectoralList(p) ? p.members! : null;
                const checked = members
                  ? members.every((m) => draftPartyIds.includes(m))
                  : draftPartyIds.includes(p.id);
                return (
                  <li key={p.id}>
                    <label className="modal-party-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          members ? handleToggleDraftList(members) : handleToggleDraft(p.id)
                        }
                      />
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          backgroundColor: p.color,
                          flexShrink: 0,
                        }}
                      />
                      <span>{p.shortName}</span>
                      <ElectoralListBadge party={p} rules={rules} />
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--secondary"
                onClick={handleCancelAdd}
              >
                Zrušiť
              </button>
              <button
                type="button"
                className="modal-btn modal-btn--primary"
                onClick={handleConfirmAdd}
                disabled={draftPartyIds.length === 0}
              >
                Pridať
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
