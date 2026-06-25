import { useRef, useState } from 'react';
import { TrashIcon } from '../../icons/TrashIcon.tsx';
import type { Party } from '../../data/types.ts';
import type { CoalitionResult } from '../../core/coalition/types.ts';
import type { SavedCoalition } from './coalitionStorage.ts';

interface Props {
  coalitions: SavedCoalition[];
  coalitionResults: Array<CoalitionResult | null>;
  parties: Party[];
  onAdd: (coalition: SavedCoalition) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function CoalitionBuilder({ coalitions, coalitionResults, parties, onAdd, onRemove, onReorder }: Props) {
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
      ) : (
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
                    <div className="coalition-party-chips">
                      {coalition.partyIds.map((pid, j) => {
                        const party = partyById.get(pid);
                        return (
                          <span key={pid} className="coalition-party-chip">
                            <span
                              className="coalition-party-dot"
                              style={{ backgroundColor: party?.color ?? '#888' }}
                            />
                            <span>{party?.shortName ?? pid}</span>
                            {j < coalition.partyIds.length - 1 && (
                              <span className="coalition-chip-plus">+</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="coalition-td coalition-td--seats">
                    {seats !== null ? (
                      <strong>{seats}</strong>
                    ) : (
                      <span className="coalition-td--loading">–</span>
                    )}
                  </td>
                  <td className="coalition-td coalition-td--majority">
                    {toMajority !== null ? (
                      toMajority <= 0 ? (
                        <span className="coalition-majority-yes">✓</span>
                      ) : (
                        <span className="coalition-majority-no">−{toMajority}</span>
                      )
                    ) : (
                      <span className="coalition-td--loading">–</span>
                    )}
                  </td>
                  <td className="coalition-td coalition-td--majority">
                    {toConstitutional !== null ? (
                      toConstitutional <= 0 ? (
                        <span className="coalition-majority-yes">✓</span>
                      ) : (
                        <span className="coalition-majority-no">−{toConstitutional}</span>
                      )
                    ) : (
                      <span className="coalition-td--loading">–</span>
                    )}
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
              {sortedParties.map((p) => (
                <li key={p.id}>
                  <label className="modal-party-label">
                    <input
                      type="checkbox"
                      checked={draftPartyIds.includes(p.id)}
                      onChange={() => handleToggleDraft(p.id)}
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
                  </label>
                </li>
              ))}
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
