import { describe, it, expect } from 'vitest';
import { renderPrBody } from './report.ts';
import type { AgentRunReport } from './types.ts';

const base: AgentRunReport = {
  runDate: '2026-08-31',
  watermarks: { AKO: '2026-07-14', Focus: '2026-06-29', Ipsos: '2026-06-23' },
  leadCount: 1,
  leads: [],
  aggregatorGaps: [],
  addedPolls: [],
};

const cleanLead = {
  agency: 'AKO' as const,
  url: 'https://ako.sk/aug.pdf',
  discoveredBy: 'site' as const,
  label: 'Volebné preferencie august 2026',
  outcome: 'added' as const,
  reason: '',
  extraction: {
    fieldworkStart: '2026-08-03',
    fieldworkEnd: '2026-08-09',
    sampleSize: 1000,
    results: [{ party: 'PS', percent: 20.8 }],
    notes: '',
  },
  unmapped: [],
  grounding: [{ party: 'PS', value: 20.8, grounded: true, reason: '' }],
  mismatches: [],
  pollId: 'sk-ako-2026-08',
};

describe('renderPrBody', () => {
  it('lists the added poll with its agency, dates and sample size', () => {
    const body = renderPrBody({ ...base, leads: [cleanLead] });
    expect(body).toContain('sk-ako-2026-08');
    expect(body).toContain('2026-08-03');
    expect(body).toContain('1000');
  });

  it('tags the maintainer', () => {
    expect(renderPrBody(base)).toContain('@peterjurco');
  });

  it('says explicitly when nothing needs attention', () => {
    const body = renderPrBody({ ...base, leads: [cleanLead] });
    expect(body).toMatch(/nothing needs your attention/i);
  });

  it('reports an unmapped party with its value', () => {
    const body = renderPrBody({
      ...base,
      leads: [{ ...cleanLead, unmapped: [{ party: 'Strana vidieka', percent: 0.3 }] }],
    });
    expect(body).toContain('Strana vidieka');
    expect(body).toContain('0.3');
    expect(body).toMatch(/not in parties\.json/i);
  });

  it('reports a grounding failure', () => {
    const body = renderPrBody({
      ...base,
      leads: [
        {
          ...cleanLead,
          grounding: [
            { party: 'SMER-SSD', value: 17.8, grounded: false, reason: 'value 17.8 not found near "SMER-SSD"' },
          ],
        },
      ],
    });
    expect(body).toMatch(/could not be found in the source/i);
    expect(body).toContain('SMER-SSD');
  });

  it('reports a cross-check mismatch', () => {
    const body = renderPrBody({
      ...base,
      leads: [
        {
          ...cleanLead,
          mismatches: [{ field: 'results.smer', extracted: 17.8, aggregator: 17.3 }],
        },
      ],
    });
    expect(body).toContain('results.smer');
    expect(body).toContain('17.3');
  });

  it('reports a failed lead', () => {
    const body = renderPrBody({
      ...base,
      leads: [{ ...cleanLead, outcome: 'failed', reason: 'HTTP 404', extraction: null, pollId: null }],
    });
    expect(body).toContain('HTTP 404');
  });

  it('reports an aggregator gap', () => {
    const body = renderPrBody({
      ...base,
      aggregatorGaps: [
        {
          agency: 'Ipsos',
          fieldworkStart: '2026-08-10',
          fieldworkEnd: '2026-08-15',
          sampleSize: 1000,
          results: { ps: 21 },
        },
      ],
    });
    expect(body).toMatch(/no primary source/i);
    expect(body).toContain('Ipsos');
  });

  it('includes the model notes when the model flagged something', () => {
    const body = renderPrBody({
      ...base,
      leads: [
        {
          ...cleanLead,
          extraction: { ...cleanLead.extraction, notes: 'Two tables present; used the July column.' },
        },
      ],
    });
    expect(body).toContain('Two tables present');
  });
});
