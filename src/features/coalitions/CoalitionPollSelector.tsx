import type { Poll } from '../../data/types.ts';

interface Props {
  polls: Poll[];
  selectedPollId: string | null;
  onSelectPoll: (pollId: string) => void;
}

function formatPollDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sk-SK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function CoalitionPollSelector({ polls, selectedPollId, onSelectPoll }: Props) {
  if (polls.length === 0) return null;

  const agencies = [...new Set(polls.map((p) => p.agency))].sort();
  const selectedPoll = polls.find((p) => p.id === selectedPollId) ?? null;
  const currentAgency = selectedPoll?.agency ?? agencies[0] ?? '';

  // Oldest → newest so slider left = oldest, right = newest
  const pollsForAgency = polls
    .filter((p) => p.agency === currentAgency)
    .sort((a, b) => (a.fieldworkEnd <= b.fieldworkEnd ? -1 : 1));

  const currentIndex = pollsForAgency.findIndex((p) => p.id === selectedPollId);
  const sliderIndex = currentIndex === -1 ? pollsForAgency.length - 1 : currentIndex;

  const handleAgencyChange = (agency: string) => {
    const newest = polls
      .filter((p) => p.agency === agency)
      .sort((a, b) => (a.fieldworkEnd >= b.fieldworkEnd ? -1 : 1))[0];
    if (newest) onSelectPoll(newest.id);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const poll = pollsForAgency[Number(e.target.value)];
    if (poll) onSelectPoll(poll.id);
  };

  const oldestPoll = pollsForAgency[0];
  const newestPoll = pollsForAgency[pollsForAgency.length - 1];

  return (
    <div className="polls-toolbar">
      <div className="polls-toolbar-row">
        <label className="polls-toolbar-label">
          Agentúra
          <select
            className="polls-toolbar-select"
            value={currentAgency}
            onChange={(e) => handleAgencyChange(e.target.value)}
          >
            {agencies.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <div className="poll-slider-wrapper">
          <div className="poll-slider-header">
            <span className="polls-toolbar-label">Prieskum</span>
            <span className="poll-slider-current">
              {selectedPoll ? formatPollDate(selectedPoll.fieldworkEnd) : ''}
            </span>
          </div>
          <input
            type="range"
            className="poll-slider"
            min={0}
            max={pollsForAgency.length - 1}
            value={sliderIndex}
            onChange={handleSliderChange}
          />
          <div className="poll-slider-bounds">
            <span>{oldestPoll ? formatPollDate(oldestPoll.fieldworkEnd) : ''}</span>
            <span>{newestPoll ? formatPollDate(newestPoll.fieldworkEnd) : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
