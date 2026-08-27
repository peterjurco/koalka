import type { NormalizedPoll } from '../ingestion/types.ts';
import { assignPollId } from './ids.ts';

export interface MergeOptions {
  /** Polls ending on or before this date are hand-verified and must never be rewritten. */
  processedDataUntil?: string;
}

export interface MergeResult {
  polls: NormalizedPoll[];
  added: NormalizedPoll[];
  rejected: { poll: NormalizedPoll; reason: string }[];
}

function dedupKey(poll: NormalizedPoll): string {
  return `${poll.agency}|${poll.fieldworkStart}|${poll.fieldworkEnd}`;
}

/**
 * Merge newly extracted polls into the existing array. Existing polls are never modified
 * — the agent only appends. Anything it declines to add is returned with a reason so the
 * PR can say so out loud.
 */
export function mergePolls(
  existing: readonly NormalizedPoll[],
  incoming: readonly NormalizedPoll[],
  options: MergeOptions = {},
): MergeResult {
  const takenIds = new Set(existing.map((p) => p.id));
  const seenKeys = new Set(existing.map(dedupKey));

  const added: NormalizedPoll[] = [];
  const rejected: { poll: NormalizedPoll; reason: string }[] = [];

  for (const poll of incoming) {
    if (
      options.processedDataUntil != null &&
      poll.fieldworkEnd <= options.processedDataUntil
    ) {
      rejected.push({
        poll,
        reason: `fieldwork ends ${poll.fieldworkEnd}, inside the verified window (<= ${options.processedDataUntil})`,
      });
      continue;
    }

    const key = dedupKey(poll);
    if (seenKeys.has(key)) {
      rejected.push({ poll, reason: `already in polls.json or earlier in this run (${key})` });
      continue;
    }

    const id = assignPollId(poll, takenIds);
    takenIds.add(id);
    seenKeys.add(key);
    added.push({ ...poll, id });
  }

  const polls = [...existing, ...added].sort((a, b) =>
    a.fieldworkStart.localeCompare(b.fieldworkStart),
  );

  // Safety net, independent of the takenIds/seenKeys bookkeeping above: never write a
  // polls.json with a duplicate id. A duplicate id is looked up by
  // coalitionStorage.ts from a visitor's localStorage — writing one out would silently
  // corrupt or misattribute a real saved coalition, so this fails loudly instead.
  const idCounts = new Map<string, number>();
  for (const p of polls) idCounts.set(p.id, (idCounts.get(p.id) ?? 0) + 1);
  const duplicateId = [...idCounts.entries()].find(([, count]) => count > 1)?.[0];
  if (duplicateId != null) {
    throw new Error(`mergePolls produced a duplicate id: ${duplicateId}`);
  }

  return { polls, added, rejected };
}
