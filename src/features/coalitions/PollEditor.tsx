import { useEffect, useRef, useState } from 'react';
import type { Party, PartyId } from '../../data/types.ts';

interface RowProps {
  partyId: PartyId;
  pct: number;
  original: number;
  seats: number;
  party: Party | undefined;
  sliderMax: number;
  onChange: (partyId: PartyId, value: number) => void;
}

function PollEditorRow({ partyId, pct, original, seats, party, sliderMax, onChange }: RowProps) {
  const [str, setStr] = useState(pct.toFixed(1));
  const focused = useRef(false);
  const changed = Math.abs(pct - original) > 0.001;

  useEffect(() => {
    if (!focused.current) setStr(pct.toFixed(1));
  }, [pct]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.round(parseFloat(e.target.value) * 10) / 10;
    setStr(v.toFixed(1));
    onChange(partyId, v);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStr(e.target.value);
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v >= 0 && v <= 100) {
      onChange(partyId, Math.round(v * 10) / 10);
    }
  };

  return (
    <div className="poll-editor-row">
      <div className="poll-editor-party">
        <span className="poll-editor-dot" style={{ backgroundColor: party?.color ?? '#888' }} />
        <span className="poll-editor-name">{party?.shortName ?? partyId}</span>
      </div>
      <input
        type="range"
        className="poll-editor-slider"
        min={0}
        max={sliderMax}
        step={0.1}
        value={pct}
        onChange={handleSliderChange}
      />
      <input
        type="number"
        className={`poll-editor-input${changed ? ' poll-editor-input--changed' : ''}`}
        min={0}
        max={100}
        step={0.1}
        value={str}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setStr(pct.toFixed(1));
        }}
        onChange={handleInputChange}
      />
      <span className="poll-editor-pct-symbol">%</span>
      <span className={`poll-editor-seat-count${seats > 0 ? '' : ' poll-editor-seat-count--zero'}`}>
        {seats}
      </span>
    </div>
  );
}

interface Props {
  voteShare: Record<PartyId, number>;
  originalVoteShare: Record<PartyId, number>;
  seatAllocation: Record<PartyId, number>;
  parties: Party[];
  onChange: (partyId: PartyId, value: number) => void;
  onClose: () => void;
  onReset: () => void;
}

export function PollEditor({
  voteShare,
  originalVoteShare,
  seatAllocation,
  parties,
  onChange,
  onClose,
  onReset,
}: Props) {
  const partyById = new Map(parties.map((p) => [p.id, p]));
  const sortedEntries = Object.entries(voteShare).sort(([, a], [, b]) => b - a);
  const maxPct = Math.max(...Object.values(voteShare));
  const sliderMax = Math.max(40, Math.ceil(maxPct / 5) * 5 + 5);
  const isModified = Object.entries(voteShare).some(
    ([id, v]) => Math.abs(v - (originalVoteShare[id] ?? v)) > 0.001,
  );

  return (
    <div className="poll-editor">
      <div className="poll-editor-header">
        <span className="poll-editor-title">Upraviť percentá</span>
        <div className="poll-editor-header-actions">
          {isModified && (
            <button type="button" className="poll-editor-btn poll-editor-btn--reset" onClick={onReset}>
              Zahodiť zmeny
            </button>
          )}
          <button type="button" className="poll-editor-btn poll-editor-btn--close" onClick={onClose}>
            Zavrieť
          </button>
        </div>
      </div>
      <div className="poll-editor-col-header">
        <span />
        <span />
        <span className="poll-editor-col-label">%</span>
        <span />
        <span className="poll-editor-col-label">Mandáty</span>
      </div>
      <div className="poll-editor-list">
        {sortedEntries.map(([partyId, pct]) => (
          <PollEditorRow
            key={partyId}
            partyId={partyId}
            pct={pct}
            original={originalVoteShare[partyId] ?? pct}
            seats={seatAllocation[partyId] ?? 0}
            party={partyById.get(partyId)}
            sliderMax={sliderMax}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}
