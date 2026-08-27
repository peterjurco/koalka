import { describe, it, expect } from 'vitest';
import { parseAggregatorRows } from './aggregatorTable.ts';

const HTML = `
<table class="wikitable">
  <tr>
    <th>Polling firm</th><th>Fieldwork date</th><th>Sample size</th>
    <th>PS</th><th>SMER</th><th>Hlas</th>
  </tr>
  <tr>
    <td>AKO</td><td>8–14 Jul 2026</td><td>1,000</td>
    <td>20.8</td><td>17.3</td><td>8.5</td>
  </tr>
  <tr>
    <td>Focus<sup>[1]</sup></td><td>22–29 Jun 2026</td><td>1,027</td>
    <td>21.4</td><td>16.9</td><td>9.1</td>
  </tr>
  <tr>
    <td>Median SK</td><td>1–4 Jun 2026</td><td>800</td>
    <td>19.0</td><td>18.0</td><td>9.5</td>
  </tr>
  <tr>
    <td>Ipsos</td><td>who knows</td><td>900</td>
    <td>20.0</td><td>17.0</td><td>9.0</td>
  </tr>
</table>
`;

describe('parseAggregatorRows', () => {
  it('parses a row into agency, dates, sample size and slug-keyed results', () => {
    const { rows } = parseAggregatorRows(HTML, ['AKO', 'Focus', 'Ipsos']);
    const ako = rows.find((r) => r.agency === 'AKO');
    expect(ako).toEqual({
      agency: 'AKO',
      fieldworkStart: '2026-07-08',
      fieldworkEnd: '2026-07-14',
      sampleSize: 1000,
      results: { ps: 20.8, smer: 17.3, hlas: 8.5 },
    });
  });

  it('strips footnote markers from the agency cell', () => {
    const { rows } = parseAggregatorRows(HTML, ['AKO', 'Focus', 'Ipsos']);
    expect(rows.some((r) => r.agency === 'Focus')).toBe(true);
  });

  it('ignores agencies that are not watched', () => {
    const { rows } = parseAggregatorRows(HTML, ['AKO', 'Focus', 'Ipsos']);
    expect(rows.some((r) => r.agency === 'Median SK')).toBe(false);
  });

  it('skips a row with an unparseable date and says why', () => {
    const { rows, skipped } = parseAggregatorRows(HTML, ['AKO', 'Focus', 'Ipsos']);
    expect(rows.some((r) => r.agency === 'Ipsos')).toBe(false);
    expect(skipped.some((s) => s.reason.includes('fieldwork'))).toBe(true);
  });

  it('returns no rows when the page has no usable table', () => {
    const { rows } = parseAggregatorRows('<p>nothing here</p>', ['AKO']);
    expect(rows).toEqual([]);
  });
});

// Regression coverage for the real "Opinion polling for the next Slovak parliamentary
// election" Wikipedia table (checked live 2026-08-27), which is structurally richer
// than the simplified fixture above:
//  - the header groups several columns under one spanned cell ("OĽaNO and Friends",
//    colspan=3) with the real sub-labels ("Slovakia", "ZĽ", "KÚ") given in the row
//    directly below the header — naive index-based column mapping silently reads later
//    columns' values under the wrong party slug once a group like this is present;
//  - older rows collapse several of those same columns back into one merged cell
//    (colspan > 1 on a data row) once a party didn't exist as a separate line yet;
//  - the page also carries a "Seat projections" table (seat counts, not vote shares,
//    identifiable by its Gov./Opp. columns) and a "Scenario" table (one row per
//    hypothetical coalition, identifiable by its Scenario column) with the same
//    column shape as the real polling table — both must be excluded, not parsed as if
//    they were ordinary poll rows.
describe('parseAggregatorRows against the real Wikipedia table shape', () => {
  const REAL_EXCERPT = `
<table class="wikitable sortable">
  <tr>
    <th>Polling firm</th><th>Date</th><th>Samplesize</th>
    <th>Smer</th><th>PS</th><th>Hlas</th><th colspan="3">OĽaNO and Friends</th>
    <th>KDH</th><th>SaS</th><th>SNS</th><th>Republika</th>
    <th>HungarianAlliance</th><th>Democrats</th><th>We Are Family</th><th>ĽSNS</th>
    <th>Others</th><th>Lead</th>
  </tr>
  <tr>
    <th>Slovakia</th><th>ZĽ</th><th>KÚ</th>
  </tr>
  <tr>
    <td>AKO<sup>[2]</sup></td><td>8–14 Jul 2026</td><td>1,000</td>
    <td>17.3</td><td>20.8</td><td>8.5</td><td>8.0</td><td>–</td><td>–</td>
    <td>7.7</td><td>8.8</td><td>4.8</td><td>9.7</td>
    <td>2.8</td><td>5.8</td><td>2.2</td><td>0.2</td>
    <td>3.4</td><td>3.5</td>
  </tr>
  <tr>
    <td>AKO<sup>[75]</sup></td><td>8–17 Oct 2024</td><td>1,000</td>
    <td>21.3</td><td>21.3</td><td>15.0</td><td colspan="3">5.9</td>
    <td>6.2</td><td>6.5</td><td>4.8</td><td>6.8</td>
    <td>3.4</td><td>4.7</td><td>2.6</td><td>0.6</td>
    <td>0.9</td><td>Tie</td>
  </tr>
</table>
`;

  it('expands a grouped header column using its own sub-header row', () => {
    const { rows } = parseAggregatorRows(REAL_EXCERPT, ['AKO']);
    const row = rows.find((r) => r.fieldworkStart === '2026-07-08');
    expect(row).toEqual({
      agency: 'AKO',
      fieldworkStart: '2026-07-08',
      fieldworkEnd: '2026-07-14',
      sampleSize: 1000,
      results: {
        smer: 17.3,
        ps: 20.8,
        hlas: 8.5,
        olano: 8.0,
        kdh: 7.7,
        sas: 8.8,
        sns: 4.8,
        republika: 9.7,
        lsns: 0.2,
      },
    });
  });

  it('skips a row whose party columns are merged into one cell instead of guessing which party it belongs to', () => {
    const { rows, skipped } = parseAggregatorRows(REAL_EXCERPT, ['AKO']);
    expect(rows.some((r) => r.fieldworkStart === '2024-10-08')).toBe(false);
    expect(
      skipped.some((s) => s.reason.includes('merged') && s.text.includes('8–17 Oct 2024')),
    ).toBe(true);
  });

  it('ignores a seat-projection table (Gov./Opp. columns) even though it reuses the same party headers', () => {
    const SEAT_TABLE = `
<table class="wikitable">
  <tr>
    <th>Polling firm</th><th>Date</th><th>Samplesize</th>
    <th>Smer</th><th>PS</th><th>Lead</th><th>Gov.</th><th>Opp.</th>
  </tr>
  <tr>
    <td>AKO</td><td>8–14 Jul 2026</td><td>1,000</td>
    <td>31</td><td>35</td><td>4</td><td>46</td><td>104</td>
  </tr>
</table>
`;
    const { rows } = parseAggregatorRows(SEAT_TABLE, ['AKO']);
    expect(rows).toEqual([]);
  });

  it('ignores a coalition-scenario table (Scenario column) since it is not one row per real poll', () => {
    const SCENARIO_TABLE = `
<table class="wikitable">
  <tr>
    <th>Polling firm</th><th>Date</th><th>Samplesize</th><th>Scenario</th>
    <th>Smer</th><th>PS</th>
  </tr>
  <tr>
    <td>Focus</td><td>9–14 Jul 2024</td><td>1,013</td><td>[a]</td>
    <td>25.2</td><td>15.6</td>
  </tr>
</table>
`;
    const { rows } = parseAggregatorRows(SCENARIO_TABLE, ['Focus']);
    expect(rows).toEqual([]);
  });
});
