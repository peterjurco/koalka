import { describe, it, expect } from 'vitest';
import { mergePolls } from './merge.ts';
import type { NormalizedPoll } from '../ingestion/types.ts';

function poll(overrides: Partial<NormalizedPoll>): NormalizedPoll {
  return {
    id: '',
    countryId: 'sk',
    electionId: 'sk-2024',
    agency: 'AKO',
    fieldworkStart: '2026-08-03',
    fieldworkEnd: '2026-08-09',
    sampleSize: 1000,
    sourceUrl: 'https://ako.sk/aug.pdf',
    results: { ps: 20, smer: 17, hlas: 9 },
    ...overrides,
  };
}

const existing: NormalizedPoll[] = [
  poll({ id: 'sk-ako-2026-07', fieldworkStart: '2026-07-08', fieldworkEnd: '2026-07-14' }),
  poll({
    id: 'sk-focus-2026-06',
    agency: 'Focus',
    fieldworkStart: '2026-06-22',
    fieldworkEnd: '2026-06-29',
  }),
];

describe('mergePolls', () => {
  it('adds a new poll and gives it an id', () => {
    const result = mergePolls(existing, [poll({})], {});
    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.id).toBe('sk-ako-2026-08');
    expect(result.polls).toHaveLength(3);
  });

  it('never changes the id of an existing poll', () => {
    const result = mergePolls(existing, [poll({})], {});
    const ids = result.polls.map((p) => p.id);
    expect(ids).toContain('sk-ako-2026-07');
    expect(ids).toContain('sk-focus-2026-06');
  });

  it('rejects a poll that duplicates an existing agency and fieldwork window', () => {
    const duplicate = poll({ fieldworkStart: '2026-07-08', fieldworkEnd: '2026-07-14' });
    const result = mergePolls(existing, [duplicate], {});
    expect(result.added).toEqual([]);
    expect(result.rejected[0]!.reason).toMatch(/already in polls.json/);
  });

  it('rejects a second copy of the same poll within one run', () => {
    const result = mergePolls(existing, [poll({}), poll({})], {});
    expect(result.added).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it('refuses to touch the verified window', () => {
    const old = poll({ fieldworkStart: '2025-01-06', fieldworkEnd: '2025-01-10' });
    const result = mergePolls(existing, [old], { processedDataUntil: '2026-01-25' });
    expect(result.added).toEqual([]);
    expect(result.rejected[0]!.reason).toMatch(/verified/);
  });

  it('keeps the array sorted by fieldworkStart', () => {
    const older = poll({ fieldworkStart: '2026-07-20', fieldworkEnd: '2026-07-25' });
    const result = mergePolls(existing, [poll({}), older], {});
    const starts = result.polls.map((p) => p.fieldworkStart);
    expect(starts).toEqual([...starts].sort());
  });

  it('gives a second poll in the same month a day-suffixed id', () => {
    const first = poll({ fieldworkStart: '2026-08-03', fieldworkEnd: '2026-08-09' });
    const second = poll({ fieldworkStart: '2026-08-20', fieldworkEnd: '2026-08-25' });
    const result = mergePolls(existing, [first, second], {});
    expect(result.added.map((p) => p.id)).toEqual(['sk-ako-2026-08', 'sk-ako-2026-08-20']);
  });

  it('throws rather than write a duplicate id, even if id assignment is ever wrong', () => {
    // Simulates the exact failure mode assignPollId's caller contract depends on: two
    // incoming polls that would end up with the same id. mergePolls's own bookkeeping
    // prevents this in practice (see the "same month" test above) — this test pins the
    // safety net that exists independently of that bookkeeping ever staying correct.
    const corrupted: NormalizedPoll[] = [
      ...existing,
      poll({ id: 'sk-ako-2026-07', fieldworkStart: '2026-08-01', fieldworkEnd: '2026-08-05' }),
    ];
    expect(() => mergePolls(corrupted, [], {})).toThrow(/duplicate id/i);
  });
});
