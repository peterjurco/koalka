import type { ElectionRules, Party, Poll } from "../../data/types.ts";
import { ElectoralListBadge } from "../../components/ui/ElectoralListBadge.tsx";
import { isElectoralList, thresholdForParty } from "../../core/coalition/electoralLists.ts";
import type { TrendValueSource } from "../../core/aggregation/index.ts";

interface PollDetailModalProps {
  /** Polls to display — one for individual mode, multiple for aggregate (month) mode */
  polls: Poll[];
  parties: Party[];
  rules: ElectionRules;
  trendValueMode: TrendValueSource;
  /** Label for the modal title (e.g. "Január 2025" or "AKO") */
  title: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function PollSection({
  poll,
  parties,
  rules,
  trendValueMode,
  showAgency,
}: {
  poll: Poll;
  parties: Party[];
  rules: ElectionRules;
  trendValueMode: TrendValueSource;
  showAgency: boolean;
}) {
  const isMandates = trendValueMode === "seatProjection";
  const values = isMandates
    ? (poll.metadata?.seatProjection ?? poll.results)
    : poll.results;

  const partyIds = Object.keys(values);
  const partyMap = new Map(parties.map((p) => [p.id, p]));

  // Sort descending by value
  const sorted = partyIds
    .map((id) => ({
      id,
      party: partyMap.get(id),
      value: values[id] ?? 0,
      pct: poll.results[id] ?? 0,
      seats: poll.metadata?.seatProjection?.[id] ?? null,
    }))
    .filter((r) => r.value > 0 || r.pct > 0)
    .sort((a, b) => b.pct - a.pct);

  // Electoral lists (PS + Demokrati) need 7 % / 10 %, single parties 5 %.
  const clears = (r: (typeof sorted)[number]) => r.pct >= thresholdForParty(r.party, rules);
  const aboveThreshold = sorted.filter(clears);
  const belowThreshold = sorted.filter((r) => !clears(r));
  const list = sorted.find((r) => isElectoralList(r.party))?.party;
  const thresholdLabel = list
    ? `${rules.thresholdPercent} % strany, ${thresholdForParty(list, rules)} % koalície`
    : `${rules.thresholdPercent} %`;

  return (
    <div className="poll-detail-section">
      {showAgency && (
        <div className="poll-detail-agency-header">
          <span className="poll-detail-agency-name">{poll.agency}</span>
          <span className="poll-detail-date">
            {formatDate(poll.fieldworkStart)}
            {poll.fieldworkStart !== poll.fieldworkEnd
              ? ` – ${formatDate(poll.fieldworkEnd)}`
              : ""}
          </span>
          {poll.sampleSize != null && (
            <span className="poll-detail-sample">n = {poll.sampleSize}</span>
          )}
          {poll.sourceUrl && (
            <a
              href={poll.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="poll-detail-source-link"
            >
              Zdroj ↗
            </a>
          )}
        </div>
      )}

      <table className="poll-detail-table">
        <thead>
          <tr>
            <th className="poll-detail-th poll-detail-th--party">Strana</th>
            <th className="poll-detail-th poll-detail-th--val">%</th>
            {poll.metadata?.seatProjection && (
              <th className="poll-detail-th poll-detail-th--val">Mandáty</th>
            )}
          </tr>
        </thead>
        <tbody>
          {aboveThreshold.map((r) => (
            <tr key={r.id} className="poll-detail-row poll-detail-row--above">
              <td className="poll-detail-td poll-detail-td--party">
                <span
                  className="poll-detail-color"
                  style={{ backgroundColor: r.party?.color ?? "#888" }}
                />
                {r.party?.shortName ?? r.id}{" "}
                <ElectoralListBadge party={r.party} rules={rules} compact />
              </td>
              <td className="poll-detail-td poll-detail-td--val">
                {r.pct.toFixed(1)} %
              </td>
              {poll.metadata?.seatProjection && (
                <td className="poll-detail-td poll-detail-td--val">
                  {r.seats ?? 0}
                </td>
              )}
            </tr>
          ))}

          {belowThreshold.length > 0 && (
            <tr className="poll-detail-threshold-row">
              <td
                colSpan={poll.metadata?.seatProjection ? 3 : 2}
                className="poll-detail-threshold-label"
              >
                — pod volebným kvórom ({thresholdLabel}) —
              </td>
            </tr>
          )}

          {belowThreshold.map((r) => (
            <tr key={r.id} className="poll-detail-row poll-detail-row--below">
              <td className="poll-detail-td poll-detail-td--party">
                <span
                  className="poll-detail-color"
                  style={{ backgroundColor: r.party?.color ?? "#888" }}
                />
                {r.party?.shortName ?? r.id}{" "}
                <ElectoralListBadge party={r.party} rules={rules} compact />
              </td>
              <td className="poll-detail-td poll-detail-td--val">
                {r.pct.toFixed(1)} %
              </td>
              {poll.metadata?.seatProjection && (
                <td className="poll-detail-td poll-detail-td--val">—</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {(!showAgency || poll.sourceUrl) && (
        <div className="poll-detail-footer">
          {!showAgency && poll.sampleSize != null && (
            <span>Vzorka: {poll.sampleSize} respondentov</span>
          )}
          {poll.sourceUrl && (
            <a
              href={poll.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="poll-detail-source-link"
            >
              Zdroj ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function PollDetailModal({
  polls,
  parties,
  rules,
  trendValueMode,
  title,
  onClose,
}: PollDetailModalProps) {
  if (polls.length === 0) return null;

  const isAggregate = polls.length > 1;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-content poll-detail-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="poll-detail-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="poll-detail-header">
          <div>
            <h2 id="poll-detail-title" className="modal-title">
              {title}
            </h2>
            {isAggregate && (
              <p className="poll-detail-subtitle">
                {polls.length} prieskum{polls.length >= 5 ? "ov" : polls.length >= 2 ? "y" : ""}
              </p>
            )}
            {!isAggregate && (
              <p className="poll-detail-subtitle">
                {polls[0]!.agency} ·{" "}
                {formatDate(polls[0]!.fieldworkStart)}
                {polls[0]!.fieldworkStart !== polls[0]!.fieldworkEnd
                  ? ` – ${formatDate(polls[0]!.fieldworkEnd)}`
                  : ""}
                {polls[0]!.sampleSize != null
                  ? ` · n = ${polls[0]!.sampleSize}`
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            className="poll-detail-close"
            onClick={onClose}
            aria-label="Zavrieť"
          >
            <span className="poll-detail-close-x" aria-hidden>×</span>
          </button>
        </div>

        {/* Poll sections */}
        <div className="poll-detail-body">
          {polls.map((poll) => (
            <PollSection
              key={poll.id}
              poll={poll}
              parties={parties}
              rules={rules}
              trendValueMode={trendValueMode}
              showAgency={isAggregate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
