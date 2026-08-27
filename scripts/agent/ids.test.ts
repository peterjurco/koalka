import { describe, it, expect } from 'vitest';
import { assignPollId } from './ids.ts';

describe('assignPollId', () => {
  it('uses agency and month when the month is free', () => {
    const id = assignPollId({ agency: 'AKO', fieldworkStart: '2026-08-03' }, new Set());
    expect(id).toBe('sk-ako-2026-08');
  });

  it('appends the start day when the month id is taken', () => {
    const id = assignPollId(
      { agency: 'AKO', fieldworkStart: '2026-08-03' },
      new Set(['sk-ako-2026-08']),
    );
    expect(id).toBe('sk-ako-2026-08-03');
  });

  it('adds a counter when the day id is also taken', () => {
    const id = assignPollId(
      { agency: 'AKO', fieldworkStart: '2026-08-03' },
      new Set(['sk-ako-2026-08', 'sk-ako-2026-08-03']),
    );
    expect(id).toBe('sk-ako-2026-08-03-2');
  });

  it('lowercases the agency', () => {
    const id = assignPollId({ agency: 'Focus', fieldworkStart: '2026-08-03' }, new Set());
    expect(id).toBe('sk-focus-2026-08');
  });
});
