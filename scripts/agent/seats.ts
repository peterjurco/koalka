import { allocateSeats } from '../../src/core/allocation/index.ts';
import type { NormalizedPoll } from '../ingestion/types.ts';

export interface ElectionRules {
  totalSeats: number;
  thresholdPercent: number;
}

/**
 * Add metadata.seatProjection using the same Hagenbach-Bischoff allocation the app uses
 * (zákon č. 180/2014 Z. z., §68). Returns a new poll; the input is not mutated.
 */
export function withSeatProjection(
  poll: NormalizedPoll,
  rules: ElectionRules,
): NormalizedPoll {
  const seatProjection = allocateSeats(
    poll.results,
    rules.totalSeats,
    rules.thresholdPercent,
    { asPercentages: true },
  );

  return {
    ...poll,
    metadata: { ...(poll.metadata ?? {}), seatProjection },
  };
}
