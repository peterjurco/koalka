import type { PartyId } from "../../data/types.ts";
import type { Party } from "../../data/types.ts";

export interface AddSumModalProps {
  parties: Party[];
  onClose: () => void;
  onAdd: (partyIds: PartyId[], name: string) => void;
}

export function AddSumModal({ parties, onClose, onAdd }: AddSumModalProps) {
  const sorted = [...parties].sort((a, b) => a.order - b.order);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const checked = form.querySelectorAll<HTMLInputElement>("input[name=party]:checked");
    const partyIds: PartyId[] = Array.from(checked).map((el) => el.value as PartyId);
    if (partyIds.length === 0) return;
    const name = partyIds
      .map((id) => parties.find((p) => p.id === id)?.shortName ?? id)
      .join(" + ");
    onAdd(partyIds, name);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="modal-add-sum-title"
        aria-modal="true"
      >
        <h2 id="modal-add-sum-title" className="modal-title">
          Pridať súčet strán
        </h2>
        <p className="modal-hint">Vyberte strany, ktoré sa majú sčítať.</p>
        <form onSubmit={handleSubmit}>
          <ul className="modal-party-list">
            {sorted.map((p) => (
              <li key={p.id}>
                <label className="modal-party-label">
                  <input type="checkbox" name="party" value={p.id} />
                  <span
                    className="trendy-party-color"
                    style={{ backgroundColor: p.color }}
                  />
                  <span>{p.shortName}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--secondary" onClick={onClose}>
              Zrušiť
            </button>
            <button type="submit" className="modal-btn modal-btn--primary">
              Pridať
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
