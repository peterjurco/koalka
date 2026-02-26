import { useEffect, useRef, useState, useCallback } from "react";
import type { PartyId } from "../../data/types.ts";
import type { Party } from "../../data/types.ts";
import { AddSumModal } from "./AddSumModal.tsx";
import type { PartySum } from "./trendyStorage.ts";
import {
  getSumColor,
  loadTrendyStorage,
  saveTrendyStorage,
} from "./trendyStorage.ts";

export interface TrendySidebarState {
  visiblePartyIds: Set<PartyId>;
  customSums: PartySum[];
  visibleSumIds: Set<string>;
}

export interface TrendySidebarProps {
  parties: Party[];
  electionId: string;
  onStateChange: (state: TrendySidebarState) => void;
}

export function TrendySidebar({ parties, electionId, onStateChange }: TrendySidebarProps) {
  const [visiblePartyIds, setVisiblePartyIds] = useState<Set<PartyId>>(new Set());
  const [customSums, setCustomSums] = useState<PartySum[]>([]);
  const [visibleSumIds, setVisibleSumIds] = useState<Set<string>>(new Set());
  const [addSumModalOpen, setAddSumModalOpen] = useState(false);
  const hasUserModifiedRef = useRef(false);

  useEffect(() => {
    if (!electionId) return;
    hasUserModifiedRef.current = false;
    const stored = loadTrendyStorage(electionId);
    if (stored) {
      setVisiblePartyIds(new Set(stored.visiblePartyIds));
      const sumsWithColors = stored.customSums.map((s, i) => ({
        ...s,
        color: s.color ?? getSumColor(i),
      }));
      const hadMissingColors = stored.customSums.some((s) => !s.color);
      if (hadMissingColors) hasUserModifiedRef.current = true;
      setCustomSums(sumsWithColors);
      setVisibleSumIds(new Set(stored.visibleSumIds));
    } else {
      const defaultVisible = new Set(
        parties.filter((p) => p.visibleByDefault !== false).map((p) => p.id)
      );
      setVisiblePartyIds(defaultVisible);
      setCustomSums([]);
      setVisibleSumIds(new Set());
    }
  }, [electionId, parties]);

  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  useEffect(() => {
    onStateChangeRef.current({ visiblePartyIds, customSums, visibleSumIds });
  }, [visiblePartyIds, customSums, visibleSumIds]);

  useEffect(() => {
    if (!electionId || !hasUserModifiedRef.current) return;
    saveTrendyStorage(electionId, {
      visiblePartyIds: Array.from(visiblePartyIds),
      customSums,
      visibleSumIds: Array.from(visibleSumIds),
    });
  }, [electionId, visiblePartyIds, customSums, visibleSumIds]);

  const toggleParty = useCallback((id: PartyId) => {
    hasUserModifiedRef.current = true;
    setVisiblePartyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSum = useCallback((id: string) => {
    hasUserModifiedRef.current = true;
    setVisibleSumIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const removeSum = useCallback((id: string) => {
    hasUserModifiedRef.current = true;
    setCustomSums((prev) => prev.filter((s) => s.id !== id));
    setVisibleSumIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const addSum = useCallback((partyIds: PartyId[], name: string) => {
    hasUserModifiedRef.current = true;
    const id = `sum-${Date.now()}`;
    setCustomSums((prev) => {
      const color = getSumColor(prev.length);
      return [...prev, { id, name, partyIds, color }];
    });
    setVisibleSumIds((prev) => new Set(prev).add(id));
  }, []);

  const sortedParties = [...parties].sort((a, b) => a.order - b.order);

  return (
    <>
      <aside className="trendy-sidebar" aria-label="Strany a súčty v grafe">
        <section className="trendy-sidebar-section">
          <h2 className="trendy-sidebar-title">Strany v grafe</h2>
          <ul className="trendy-party-list">
            {sortedParties.map((p) => (
              <li key={p.id}>
                <label className="trendy-party-toggle">
                  <input
                    type="checkbox"
                    checked={visiblePartyIds.has(p.id)}
                    onChange={() => toggleParty(p.id)}
                  />
                  <span
                    className="trendy-party-color"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="trendy-party-name">{p.shortName}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="trendy-sidebar-section">
          <div className="trendy-sidebar-section-header">
            <h2 className="trendy-sidebar-title">Súčty strán</h2>
            <button
              type="button"
              className="trendy-add-sum-btn"
              onClick={() => setAddSumModalOpen(true)}
              title="Pridať súčet"
              aria-label="Pridať súčet strán"
            >
              +
            </button>
          </div>
          {customSums.length === 0 ? (
            <p className="trendy-sums-empty">Žiadne súčty. Kliknite + na pridanie.</p>
          ) : (
            <ul className="trendy-sum-list">
              {customSums.map((s) => (
                <li key={s.id} className="trendy-sum-item">
                  <label className="trendy-party-toggle trendy-sum-toggle">
                    <input
                      type="checkbox"
                      checked={visibleSumIds.has(s.id)}
                      onChange={() => toggleSum(s.id)}
                    />
                    <span className="trendy-sum-name">{s.name}</span>
                  </label>
                  <button
                    type="button"
                    className="trendy-sum-remove"
                    onClick={() => removeSum(s.id)}
                    title="Odstrániť súčet"
                    aria-label={`Odstrániť ${s.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      {addSumModalOpen && (
        <AddSumModal
          parties={parties}
          onClose={() => setAddSumModalOpen(false)}
          onAdd={addSum}
        />
      )}
    </>
  );
}
