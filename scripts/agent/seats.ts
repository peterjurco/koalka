import { allocateSeats } from '../../src/core/allocation/index.ts';
import { makeThresholdFn } from '../../src/core/coalition/electoralLists.ts';
import type { Party } from '../../src/data/types.ts';
import type { NormalizedPoll } from '../ingestion/types.ts';

export interface ElectionRules {
  totalSeats: number;
  thresholdPercent: number;
  coalitionThresholdPercent?: number;
  largeCoalitionThresholdPercent?: number;
}

/**
 * Add metadata.seatProjection using the same Hagenbach-Bischoff allocation the app uses
 * (zákon č. 180/2014 Z. z., §68). Electoral lists among `parties` (entries with `members`)
 * get the 7 % / 10 % coalition threshold. Returns a new poll; the input is not mutated.
 */
export function withSeatProjection(
  poll: NormalizedPoll,
  rules: ElectionRules,
  parties: Party[] = [],
): NormalizedPoll {
  const seatProjection = allocateSeats(
    poll.results,
    rules.totalSeats,
    makeThresholdFn(parties, rules),
    { asPercentages: true },
  );

  return {
    ...poll,
    metadata: { ...(poll.metadata ?? {}), seatProjection },
  };
}
