import { useEffect, useState } from 'react';
import { buildCoalition } from '../../core/coalition/coalitionBuilder.ts';
import type { CoalitionResult } from '../../core/coalition/types.ts';
import { useStore } from '../../state/store.ts';
import { CoalitionBuilder } from './CoalitionBuilder.tsx';
import { CoalitionChart } from './CoalitionChart.tsx';
import { CoalitionPollSelector } from './CoalitionPollSelector.tsx';
import {
  DEFAULT_COALITIONS,
  loadCoalitionStorage,
  resolveInitialPollId,
  saveCoalitionStorage,
} from './coalitionStorage.ts';
import type { SavedCoalition } from './coalitionStorage.ts';

export function CoalitionPage() {
  const { polls, config, electionId } = useStore();

  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [savedCoalitions, setSavedCoalitions] = useState<SavedCoalition[]>(DEFAULT_COALITIONS);

  // Initialize from localStorage once polls are available (only when selectedPollId is still null)
  useEffect(() => {
    if (polls.length === 0 || selectedPollId !== null) return;

    const newestPollId = polls.reduce((a, b) =>
      a.fieldworkEnd >= b.fieldworkEnd ? a : b,
    ).id;

    const stored = loadCoalitionStorage(electionId);
    const resolvedId = resolveInitialPollId(stored, newestPollId);
    const exists = polls.some((p) => p.id === resolvedId);

    setSelectedPollId(exists ? resolvedId : newestPollId);
    setSavedCoalitions(stored?.coalitions ?? DEFAULT_COALITIONS);
  }, [electionId, polls, selectedPollId]);

  // Persist state to localStorage whenever it changes (after first init)
  useEffect(() => {
    if (!selectedPollId || polls.length === 0) return;

    const newestPollId = polls.reduce((a, b) =>
      a.fieldworkEnd >= b.fieldworkEnd ? a : b,
    ).id;

    saveCoalitionStorage(electionId, {
      pollId: selectedPollId,
      latestPollIdAtSave: newestPollId,
      coalitions: savedCoalitions,
    });
  }, [electionId, selectedPollId, savedCoalitions, polls]);

  if (!config) return null;

  const selectedPoll = polls.find((p) => p.id === selectedPollId) ?? null;

  const coalitionResults: Array<CoalitionResult | null> = savedCoalitions.map((coalition) => {
    if (!selectedPoll || coalition.partyIds.length === 0) return null;
    return buildCoalition({
      voteShare: selectedPoll.results,
      partyIds: coalition.partyIds,
      totalSeats: config.rules.totalSeats,
      thresholdPercent: config.rules.thresholdPercent,
    });
  });

  return (
    <div className="coalition-page">
      <CoalitionPollSelector
        polls={polls}
        selectedPollId={selectedPollId}
        onSelectPoll={setSelectedPollId}
      />
      <CoalitionChart
        coalitions={savedCoalitions}
        coalitionResults={coalitionResults}
        parties={config.parties}
      />
      <CoalitionBuilder
        coalitions={savedCoalitions}
        coalitionResults={coalitionResults}
        parties={config.parties}
        onAdd={(coalition) => setSavedCoalitions((prev) => [...prev, coalition])}
        onRemove={(id) => setSavedCoalitions((prev) => prev.filter((c) => c.id !== id))}
      />
    </div>
  );
}
