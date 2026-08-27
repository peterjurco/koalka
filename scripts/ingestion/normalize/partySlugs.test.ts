import { describe, it, expect } from 'vitest';
import { CANONICAL_PARTY_SLUGS, resolvePartySlug } from './partySlugs.ts';

describe('CANONICAL_PARTY_SLUGS', () => {
  it('contains every party id in parties.json, including recently added ones', () => {
    expect(CANONICAL_PARTY_SLUGS).toContain('strana_vidieka');
    expect(CANONICAL_PARTY_SLUGS).toContain('pravo_na_pravdu');
    expect(CANONICAL_PARTY_SLUGS).toContain('smer');
  });
});

describe('resolvePartySlug', () => {
  it('resolves a party added to parties.json but never aliased by hand', () => {
    expect(resolvePartySlug('Strana vidieka')).toBe('strana_vidieka');
    expect(resolvePartySlug('Právo na pravdu')).toBe('pravo_na_pravdu');
  });

  it('still resolves the hand-curated aliases', () => {
    expect(resolvePartySlug('SMER-SSD')).toBe('smer');
    expect(resolvePartySlug('Hnutie Slovensko')).toBe('olano');
    expect(resolvePartySlug('Szövetség')).toBe('madarska_aliancia');
    expect(resolvePartySlug('Progresívne Slovensko')).toBe('ps');
  });

  it('returns null for a genuinely unknown party', () => {
    expect(resolvePartySlug('Strana nezmyslov 2026')).toBeNull();
  });
});
