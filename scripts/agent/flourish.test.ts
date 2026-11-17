import { describe, expect, it } from 'vitest';
import { findFlourishIds, flourishChartToText, MAX_FLOURISH_CHARTS } from './flourish.ts';
import { checkGrounding } from './grounding.ts';

describe('findFlourishIds', () => {
  it('finds embed and thumbnail ids in page order, without duplicates', () => {
    const html =
      '<div data-src="visualisation/30851791"></div>' +
      '<img src="https://public.flourish.studio/visualisation/30851791/thumbnail">' +
      '<div data-src="visualisation/30869314"></div>';
    expect(findFlourishIds(html)).toEqual(['30851791', '30869314']);
  });

  it('caps the number of charts fetched for one page', () => {
    const html = Array.from({ length: 50 }, (_, i) => `<div data-src="visualisation/${i + 1}">`).join('');
    expect(findFlourishIds(html)).toHaveLength(MAX_FLOURISH_CHARTS);
  });

  it('returns nothing for a page without Flourish embeds', () => {
    expect(findFlourishIds('<body><table></table></body>')).toEqual([]);
  });
});

describe('flourishChartToText', () => {
  it('renders each row on its own line and trims padded decimals', () => {
    const text = flourishChartToText({
      name: 'nms_Volebný model_november 2026',
      data: {
        data: [
          ['Mesiac', 'Strana', 'Percentá'],
          ['November 2026', 'Progresívne Slovensko', '19,20%'],
          ['November 2026', 'Republika', '13,00%'],
        ],
      },
    });
    expect(text).toBe(
      '[Graf: nms_Volebný model_november 2026]\n' +
        'Mesiac | Strana | Percentá\n' +
        'November 2026 | Progresívne Slovensko | 19,2%\n' +
        'November 2026 | Republika | 13,0%',
    );
  });

  it('leaves ranges and non-percent cells alone', () => {
    const text = flourishChartToText({
      name: 'nms_Interval spoľahlivosti',
      data: { data: [['', 'Model', 'Interval'], ['PS', '21,60%', '18,3% – 24,8%'], ['PS', '40', '']] },
    });
    expect(text).toContain('PS | 21,6% | 18,3% – 24,8%');
    expect(text).toContain('PS | 40 | ');
  });

  it('skips charts that are not vote shares (core voters, potential, voter flows)', () => {
    const table = { data: [['Mesiac', 'Strana', 'Percentá'], ['Máj', 'PS', '26,60%']] };
    expect(flourishChartToText({ name: 'nms_Volebné jadro_máj 2026', data: table })).toBeNull();
    expect(flourishChartToText({ name: 'nms_Volebný potenciál_máj 2026', data: table })).toBeNull();
    expect(flourishChartToText({ name: 'BLOG - Prelivy voličov', data: table })).toBeNull();
  });

  it('returns null for a chart without tabular data', () => {
    expect(flourishChartToText({ name: 'x', data: {} })).toBeNull();
  });

  it('produces text that grounds every party of a real NMS release', () => {
    // Rows of NMS's November 2026 chart (visualisation 30851791), as served.
    const rows = [
      ['Progresívne Slovensko', '19,20%', 19.2],
      ['SMER - SD', '17,90%', 17.9],
      ['Republika', '13,00%', 13],
      ['Hnutie SLOVENSKO', '9,80%', 9.8],
      ['SaS', '7,90%', 7.9],
      ['HLAS - SD', '7,40%', 7.4],
      ['KDH', '5,00%', 5],
      ['Demokrati', '4,90%', 4.9],
      ['Magyar Szövetség', '3,10%', 3.1],
      ['Právo na pravdu', '3,00%', 3],
      ['Sme rodina', '2,30%', 2.3],
      ['Za ľudí', '1,90%', 1.9],
      ['SNS', '1,90%', 1.9],
    ] as const;
    const text = flourishChartToText({
      name: 'nms_Volebný model_november 2026',
      data: { data: [['Mesiac', 'Strana', 'Percentá'], ...rows.map(([p, v]) => ['November 2026', p, v])] },
    })!;

    const grounding = checkGrounding(text, rows.map(([party, , percent]) => ({ party, percent })));
    expect(grounding.filter((g) => !g.grounded)).toEqual([]);
  });
});
