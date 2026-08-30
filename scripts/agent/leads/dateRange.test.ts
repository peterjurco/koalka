import { describe, it, expect } from 'vitest';
import { parseFieldworkRange } from './dateRange.ts';

describe('parseFieldworkRange', () => {
  it('parses a same-month range with an en dash', () => {
    expect(parseFieldworkRange('1–5 Jul 2026')).toEqual({
      start: '2026-07-01',
      end: '2026-07-05',
    });
  });

  it('parses a range that crosses a month boundary', () => {
    expect(parseFieldworkRange('26 Jun – 1 Jul 2026')).toEqual({
      start: '2026-06-26',
      end: '2026-07-01',
    });
  });

  it('parses a range that crosses a year boundary with both years written', () => {
    expect(parseFieldworkRange('28 Dec 2025 – 3 Jan 2026')).toEqual({
      start: '2025-12-28',
      end: '2026-01-03',
    });
  });

  it('infers the earlier year when a range crosses new year without repeating it', () => {
    expect(parseFieldworkRange('30 Dec – 3 Jan 2026')).toEqual({
      start: '2025-12-30',
      end: '2026-01-03',
    });
  });

  it('parses a single day', () => {
    expect(parseFieldworkRange('5 Jul 2026')).toEqual({
      start: '2026-07-05',
      end: '2026-07-05',
    });
  });

  it('tolerates a plain hyphen and extra whitespace', () => {
    expect(parseFieldworkRange('  8 - 14  Jul 2026 ')).toEqual({
      start: '2026-07-08',
      end: '2026-07-14',
    });
  });

  it('returns null for text it cannot parse', () => {
    expect(parseFieldworkRange('summer 2026')).toBeNull();
    expect(parseFieldworkRange('')).toBeNull();
  });
});
