import { describe, it, expect } from 'vitest';
import { crossCheck } from './crosscheck.ts';
import type { AggregatorRow } from './types.ts';

const row: AggregatorRow = {
  agency: 'AKO',
  fieldworkStart: '2026-07-08',
  fieldworkEnd: '2026-07-14',
  sampleSize: 1000,
  results: { ps: 20.8, smer: 17.3, hlas: 8.5 },
};

const poll = {
  fieldworkStart: '2026-07-08',
  fieldworkEnd: '2026-07-14',
  sampleSize: 1000,
  results: { ps: 20.8, smer: 17.3, hlas: 8.5 },
};

describe('crossCheck', () => {
  it('reports nothing when the extraction matches', () => {
    expect(crossCheck(poll, row)).toEqual([]);
  });

  it('ignores a difference within tolerance', () => {
    const result = crossCheck({ ...poll, results: { ...poll.results, ps: 20.85 } }, row);
    expect(result).toEqual([]);
  });

  it('flags a party value outside tolerance', () => {
    const result = crossCheck({ ...poll, results: { ...poll.results, smer: 17.8 } }, row);
    expect(result).toEqual([
      { field: 'results.smer', extracted: 17.8, aggregator: 17.3 },
    ]);
  });

  it('flags mismatched fieldwork dates', () => {
    const result = crossCheck({ ...poll, fieldworkEnd: '2026-07-15' }, row);
    expect(result).toContainEqual({
      field: 'fieldworkEnd',
      extracted: '2026-07-15',
      aggregator: '2026-07-14',
    });
  });

  it('flags a mismatched sample size', () => {
    const result = crossCheck({ ...poll, sampleSize: 1100 }, row);
    expect(result).toContainEqual({
      field: 'sampleSize',
      extracted: 1100,
      aggregator: 1000,
    });
  });

  it('ignores the sample size when the aggregator has none', () => {
    const result = crossCheck({ ...poll, sampleSize: 1100 }, { ...row, sampleSize: null });
    expect(result).toEqual([]);
  });

  it('flags a significant party the extraction is missing entirely', () => {
    const result = crossCheck(
      { ...poll, results: { ps: 20.8, smer: 17.3 } },
      row,
    );
    expect(result).toContainEqual({
      field: 'results.hlas',
      extracted: null,
      aggregator: 8.5,
    });
  });

  it('does not flag a missing sub-1% party', () => {
    const result = crossCheck(poll, {
      ...row,
      results: { ...row.results, strana_vidieka: 0.3 },
    });
    expect(result).toEqual([]);
  });
});
