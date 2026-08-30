import { describe, it, expect } from 'vitest';
import { withSeatProjection } from './seats.ts';
import type { NormalizedPoll } from '../ingestion/types.ts';

const rules = { totalSeats: 150, thresholdPercent: 5 };

const poll: NormalizedPoll = {
  id: 'sk-ako-2026-08',
  countryId: 'sk',
  electionId: 'sk-2024',
  agency: 'AKO',
  fieldworkStart: '2026-08-03',
  fieldworkEnd: '2026-08-09',
  sampleSize: 1000,
  sourceUrl: 'https://ako.sk/aug.pdf',
  results: { ps: 21, smer: 17, hlas: 9, sns: 4, mala: 0.3 },
};

describe('withSeatProjection', () => {
  it('allocates every seat', () => {
    const result = withSeatProjection(poll, rules);
    const total = Object.values(result.metadata!.seatProjection!).reduce((a, b) => a + b, 0);
    expect(total).toBe(150);
  });

  it('gives parties below the threshold no seats', () => {
    const result = withSeatProjection(poll, rules);
    expect(result.metadata!.seatProjection!.sns).toBe(0);
    expect(result.metadata!.seatProjection!.mala).toBe(0);
  });

  it('gives the largest party the most seats', () => {
    const projection = withSeatProjection(poll, rules).metadata!.seatProjection!;
    expect(projection.ps).toBeGreaterThan(projection.smer!);
  });

  it('preserves other metadata', () => {
    const result = withSeatProjection({ ...poll, metadata: { turnout: 61.2 } }, rules);
    expect(result.metadata!.turnout).toBe(61.2);
  });

  it('does not mutate the input poll', () => {
    withSeatProjection(poll, rules);
    expect(poll.metadata).toBeUndefined();
  });
});
