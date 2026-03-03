import type { PollFilters } from "../../state/store.ts";
import { useStore } from "../../state/store.ts";
import { formatMonthLabel } from "../../utils/index.ts";
import { replaceUrlWithFilters } from "../../utils/urlFilters.ts";

const ELECTION_OPTIONS = [
  { value: "sk-2024", label: "Slovenské parlamentné" },
] as const;

function getDataLink(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return (
    window.location.origin +
    window.location.pathname +
    (params.toString() ? `?${params.toString()}` : "")
  );
}

// Plain helpers; no useMemo — lists are small (months ~120 for 10y, agencies handful).
// useMemo overhead (deps, comparison) can outweigh recompute cost for small inputs.
function getMonthOptions(
  polls: { fieldworkStart: string; fieldworkEnd: string }[],
): string[] {
  const set = new Set<string>();
  for (const p of polls) {
    set.add(p.fieldworkStart.slice(0, 7));
    set.add(p.fieldworkEnd.slice(0, 7));
  }
  return Array.from(set).sort();
}

function getAgencyOptions(polls: { agency: string }[]): string[] {
  return [...new Set(polls.map((p) => p.agency))].sort();
}

export function PollsToolbar() {
  const {
    polls,
    config,
    filters,
    setFilters,
    setElection,
    setTrendValueMode,
    countryId,
    electionId,
    trendValueMode,
  } = useStore();

  const monthOptions = getMonthOptions(polls);
  const agencyOptions = getAgencyOptions(polls);

  const handleFilterChange = (partial: Partial<PollFilters>) => {
    const next = { ...filters, ...partial };
    setFilters(partial);
    replaceUrlWithFilters(next);
  };

  const dataLink = getDataLink();
  void dataLink;

  if (!config || monthOptions.length === 0) return null;

  return (
    <div className="polls-toolbar">
      <div className="polls-toolbar-row">
        <label className="polls-toolbar-label">
          Voľby
          <select
            className="polls-toolbar-select"
            value={electionId}
            onChange={(e) => setElection(countryId, e.target.value)}
          >
            {ELECTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="polls-toolbar-label">
          Agentúra
          <select
            className="polls-toolbar-select"
            value={filters.agency ?? ""}
            onChange={(e) =>
              handleFilterChange({ agency: e.target.value || null })
            }
          >
            <option value="">Všetky</option>
            {agencyOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="polls-toolbar-label">
          Dátum od
          <select
            className="polls-toolbar-select"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange({ dateFrom: e.target.value })}
          >
            {monthOptions.map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthLabel(ym)}
              </option>
            ))}
          </select>
        </label>

        <label className="polls-toolbar-label">
          Dátum do
          <select
            className="polls-toolbar-select"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange({ dateTo: e.target.value })}
          >
            {monthOptions.map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthLabel(ym)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="polls-toolbar-btn"
          onClick={() => {
            const fullRange = {
              dateFrom: monthOptions[0]!,
              dateTo: monthOptions[monthOptions.length - 1]!,
            };
            handleFilterChange(fullRange);
          }}
          title="Zobraziť všetky mesiace s dátami"
        >
          Celý rozsah
        </button>

        <div className="polls-toolbar-toggle-group" role="group" aria-label="Trend hodnoty">
          <span className="polls-toolbar-toggle-label">Trend:</span>
          <button
            type="button"
            className={`polls-toolbar-btn ${trendValueMode === "results" ? "polls-toolbar-btn--active" : ""}`}
            onClick={() => setTrendValueMode("results")}
          >
            %
          </button>
          <button
            type="button"
            className={`polls-toolbar-btn ${trendValueMode === "seatProjection" ? "polls-toolbar-btn--active" : ""}`}
            onClick={() => setTrendValueMode("seatProjection")}
          >
            Mandáty
          </button>
        </div>
      </div>
    </div>
  );
}
