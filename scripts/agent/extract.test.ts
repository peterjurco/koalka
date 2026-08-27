import { describe, it, expect, vi } from 'vitest';
import { extractPoll } from './extract.ts';
import type { ModelClient } from './claude.ts';
import type { Extraction } from './types.ts';

const extraction: Extraction = {
  fieldworkStart: '2026-07-08',
  fieldworkEnd: '2026-07-14',
  sampleSize: 1000,
  results: [
    { party: 'Progresívne Slovensko', percent: 20.8 },
    { party: 'SMER-SSD', percent: 17.3 },
    { party: 'HLAS-SD', percent: 8.5 },
  ],
  notes: '',
};

function client(value: unknown): ModelClient {
  return { parseJson: vi.fn().mockResolvedValue(value) };
}

describe('extractPoll', () => {
  it('returns the extraction the model produced', async () => {
    const result = await extractPoll({
      docText: 'Volebné preferencie júl 2026 ...',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client(extraction),
      model: 'test-model',
    });
    expect(result).toEqual({ extraction });
  });

  it('errors when the model returns nothing', async () => {
    const result = await extractPoll({
      docText: 'text',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client(null),
      model: 'test-model',
    });
    expect(result).toEqual({ error: 'model returned no structured output' });
  });

  it('errors on fewer than three parties rather than passing it downstream', async () => {
    const result = await extractPoll({
      docText: 'text',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client({ ...extraction, results: extraction.results.slice(0, 2) }),
      model: 'test-model',
    });
    expect('error' in result && result.error).toMatch(/at least 3 parties/);
  });

  it('errors on a missing sample size', async () => {
    const result = await extractPoll({
      docText: 'text',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client({ ...extraction, sampleSize: 0 }),
      model: 'test-model',
    });
    expect('error' in result && result.error).toMatch(/sampleSize/);
  });

  it('refuses to send a document larger than the configured limit instead of truncating', async () => {
    const fake = client(extraction);
    const result = await extractPoll({
      docText: 'x'.repeat(200_001),
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: fake,
      model: 'test-model',
    });
    expect('error' in result && result.error).toMatch(/too long/);
    expect(fake.parseJson).not.toHaveBeenCalled();
  });

  it('errors when the empty-document guard trips', async () => {
    const result = await extractPoll({
      docText: '   ',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client(extraction),
      model: 'test-model',
    });
    expect('error' in result && result.error).toMatch(/no text/);
  });
});
