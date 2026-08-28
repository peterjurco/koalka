import { describe, it, expect } from 'vitest';
import { computeWatermarks } from './watermarks.ts';

const polls = [
  { agency: 'AKO', fieldworkEnd: '2026-06-10' },
  { agency: 'AKO', fieldworkEnd: '2026-07-14' },
  { agency: 'Focus', fieldworkEnd: '2026-06-29' },
];

describe('computeWatermarks', () => {
  it('returns the latest fieldworkEnd per agency', () => {
    const result = computeWatermarks(polls, ['AKO', 'Focus', 'Ipsos']);
    expect(result.AKO).toBe('2026-07-14');
    expect(result.Focus).toBe('2026-06-29');
  });

  it('returns null for an agency with no polls', () => {
    const result = computeWatermarks(polls, ['AKO', 'Focus', 'Ipsos']);
    expect(result.Ipsos).toBeNull();
  });

  it('ignores agencies that are not being watched', () => {
    const result = computeWatermarks(
      [...polls, { agency: 'Other', fieldworkEnd: '2026-08-01' }],
      ['AKO', 'Focus', 'Ipsos'],
    );
    expect(Object.keys(result).sort()).toEqual(['AKO', 'Focus', 'Ipsos']);
  });

  it('returns null for every agency when there are no polls at all', () => {
    const result = computeWatermarks([], ['AKO']);
    expect(result.AKO).toBeNull();
  });
});
