import { describe, it, expect } from 'vitest';
import { checkGrounding, numberAppears } from './grounding.ts';

const DOC = `
Volebné preferencie politických strán, júl 2026
Progresívne Slovensko 20,8 %
SMER-SSD 17,3 %
OĽANO 8,0 %
Strana vidieka 0,3 %
Vzorka: 1000 respondentov
`;

describe('numberAppears', () => {
  it('matches a comma decimal', () => {
    expect(numberAppears('SMER-SSD 17,3 %', 17.3)).toBe(true);
  });

  it('matches a dot decimal', () => {
    expect(numberAppears('SMER-SSD 17.3 %', 17.3)).toBe(true);
  });

  it('matches an integer written with one decimal place', () => {
    expect(numberAppears('OĽANO 8,0 %', 8)).toBe(true);
  });

  it('rejects a near miss', () => {
    expect(numberAppears('SMER-SSD 17,3 %', 17.8)).toBe(false);
  });

  it('rejects a value that is only a substring of a longer number', () => {
    expect(numberAppears('Vzorka: 1017,8 osôb', 17.8)).toBe(false);
    expect(numberAppears('celkom 80 mandátov', 8)).toBe(false);
  });
});

describe('checkGrounding', () => {
  it('grounds every value that is present next to its party', () => {
    const results = checkGrounding(
      DOC,
      [
        { party: 'Progresívne Slovensko', percent: 20.8 },
        { party: 'SMER-SSD', percent: 17.3 },
        { party: 'OĽANO', percent: 8 },
      ],
    );
    expect(results.every((r) => r.grounded)).toBe(true);
  });

  it('matches party names regardless of diacritics and case', () => {
    const [result] = checkGrounding(DOC, [{ party: 'progresivne slovensko', percent: 20.8 }]);
    expect(result.grounded).toBe(true);
  });

  it('flags a value the document does not contain', () => {
    const [result] = checkGrounding(DOC, [{ party: 'SMER-SSD', percent: 17.8 }]);
    expect(result.grounded).toBe(false);
    expect(result.reason).toMatch(/not found near/i);
  });

  it('flags a party the document does not mention', () => {
    const [result] = checkGrounding(DOC, [{ party: 'Demokrati', percent: 5.8 }]);
    expect(result.grounded).toBe(false);
    expect(result.reason).toMatch(/party name not found/i);
  });

  it('does not ground a value that appears only far away from the party name', () => {
    const doc = `Demokrati 5,8 %${' '.repeat(500)}42,1`;
    const [result] = checkGrounding(doc, [{ party: 'Demokrati', percent: 42.1 }], 160);
    expect(result.grounded).toBe(false);
  });

  it('grounds a party name split across a run of whitespace (e.g. a blank line in a PDF-extracted table)', () => {
    const doc = 'Strana\n\nvidieka 0,3 %';
    const [result] = checkGrounding(doc, [{ party: 'Strana vidieka', percent: 0.3 }]);
    expect(result.grounded).toBe(true);
  });

  it('does not cross-match word fragments of two different party names separated by real text', () => {
    // "Strana" ends one party's name and "vidieka" starts an unrelated one further down —
    // a whitespace-only regex must not bridge the non-whitespace text between them.
    const doc = 'Strana zelenych 4,2 %\nSloboda a vidieka 3,1 %';
    const [result] = checkGrounding(doc, [{ party: 'Strana vidieka', percent: 0.3 }]);
    expect(result.grounded).toBe(false);
    expect(result.reason).toMatch(/party name not found/i);
  });

  it('grounds a party name split across a few blank lines (realistic PDF table padding)', () => {
    // A slightly larger, but still realistic, whitespace-only gap than a single blank
    // line: a few stacked line breaks, as PDF extraction sometimes produces between
    // wrapped table rows. This must still match.
    const doc = 'Strana\n\n\n\nvidieka 0,3 %';
    const [result] = checkGrounding(doc, [{ party: 'Strana vidieka', percent: 0.3 }]);
    expect(result.grounded).toBe(true);
  });

  it('does not bridge an arbitrarily long whitespace run to a word from an unrelated mention', () => {
    // Regression test for the unbounded `\s+` in the word-joining regex: "Progresivne"
    // here is followed by hundreds of characters of blank lines (a page-break / footer
    // artifact) before "Slovensko" reappears — but that "Slovensko" belongs to a wholly
    // unrelated GDP sentence, not to "Progresivne Slovensko" the party. The 20,8 next to
    // it is a GDP figure, not this party's poll number, and must not be grounded as one.
    const doc = 'Progresivne' + '\n'.repeat(300) + 'Slovensko ma HDP 20,8 % rocne';
    const [result] = checkGrounding(doc, [{ party: 'Progresivne Slovensko', percent: 20.8 }]);
    expect(result.grounded).toBe(false);
  });
});
