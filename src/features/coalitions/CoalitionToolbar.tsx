import { useEffect, useMemo } from "react";
import { useStore } from "../../state/store.ts";
import { formatMonthLabel, getMonthKey, parseISODate } from "../../utils/index.ts";

const PRIEMER_VALUE = "__priemer__";

function getMonthsFromPolls(polls: { fieldworkStart: string; fieldworkEnd: string }[]): string[] {
  const set = new Set<string>();
  for (const p of polls) {
    set.add(getMonthKey(parseISODate(p.fieldworkStart)));
    set.add(getMonthKey(parseISODate(p.fieldworkEnd)));
  }
  return Array.from(set).sort();
}

export function CoalitionToolbar() {
  const {
    polls,
    config,
    voteSource,
    setVoteSource,
    monthlyAggregates,
  } = useStore();

  const monthOptions = useMemo(() => getMonthsFromPolls(polls), [polls]);
  const agencyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of polls) set.add(p.agency);
    return Array.from(set).sort();
  }, [polls]);

  const currentMonth = useMemo(() => {
    if (!voteSource) return null;
    if (voteSource.type === "poll") {
      const poll = polls.find((p) => p.id === voteSource.pollId);
      return poll ? getMonthKey(parseISODate(poll.fieldworkEnd)) : null;
    }
    return voteSource.monthKey;
  }, [voteSource, polls]);

  const currentAgency = useMemo(() => {
    if (!voteSource) return null;
    if (voteSource.type === "monthly") return PRIEMER_VALUE;
    const poll = polls.find((p) => p.id === voteSource.pollId);
    return poll?.agency ?? null;
  }, [voteSource, polls]);

  // Default: newest poll when we have data and no voteSource yet
  useEffect(() => {
    if (!config || polls.length === 0 || voteSource !== null) return;
    const newest = polls.reduce((a, b) =>
      a.fieldworkEnd >= b.fieldworkEnd ? a : b
    );
    setVoteSource({ type: "poll", pollId: newest.id });
  }, [config, polls, voteSource, setVoteSource]);

  const handleMonthChange = (monthKey: string) => {
    const agency = currentAgency === PRIEMER_VALUE ? null : (currentAgency ?? agencyOptions[0]);
    if (agency === null || agency === PRIEMER_VALUE) {
      const hasAgg = monthlyAggregates.some((a) => a.monthKey === monthKey);
      if (hasAgg) setVoteSource({ type: "monthly", monthKey });
      return;
    }
    const inMonth = polls
      .filter((p) => p.agency === agency && getMonthKey(parseISODate(p.fieldworkEnd)) === monthKey)
      .sort((a, b) => (a.fieldworkEnd >= b.fieldworkEnd ? -1 : 1));
    if (inMonth.length > 0) setVoteSource({ type: "poll", pollId: inMonth[0]!.id });
  };

  const handleAgencyChange = (agencyValue: string) => {
    const month = currentMonth ?? (monthOptions.length > 0 ? monthOptions[monthOptions.length - 1]! : null);
    if (!month) return;
    if (agencyValue === PRIEMER_VALUE) {
      const hasAgg = monthlyAggregates.some((a) => a.monthKey === month);
      if (hasAgg) setVoteSource({ type: "monthly", monthKey: month });
      return;
    }
    const inMonth = polls
      .filter((p) => p.agency === agencyValue && getMonthKey(parseISODate(p.fieldworkEnd)) === month)
      .sort((a, b) => (a.fieldworkEnd >= b.fieldworkEnd ? -1 : 1));
    if (inMonth.length > 0) setVoteSource({ type: "poll", pollId: inMonth[0]!.id });
  };

  if (!config || monthOptions.length === 0) return null;

  return (
    <div className="polls-toolbar">
      <div className="polls-toolbar-row">
        <label className="polls-toolbar-label">
          Agentúra
          <select
            className="polls-toolbar-select"
            value={currentAgency ?? PRIEMER_VALUE}
            onChange={(e) => handleAgencyChange(e.target.value)}
          >
            <option value={PRIEMER_VALUE}>Priemer</option>
            {agencyOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="polls-toolbar-label">
          Mesiac
          <select
            className="polls-toolbar-select"
            value={currentMonth ?? (monthOptions.length > 0 ? monthOptions[monthOptions.length - 1]! : "")}
            onChange={(e) => handleMonthChange(e.target.value)}
          >
            {monthOptions.map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthLabel(ym)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
