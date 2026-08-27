import { describe, it, expect, vi } from 'vitest';
import { triageLinks } from './triage.ts';
import type { ModelClient } from '../claude.ts';

const links = [
  { url: 'https://ako.sk/2026/07/pref-jul-2026.pdf', text: 'Volebné preferencie júl 2026' },
  { url: 'https://ako.sk/o-agenture/', text: 'O agentúre' },
];

function fakeClient(candidates: { url: string; why: string }[]): ModelClient {
  return { parseJson: vi.fn().mockResolvedValue({ candidates }) };
}

describe('triageLinks', () => {
  it('returns the candidates the model picked', async () => {
    const client = fakeClient([{ url: links[0]!.url, why: 'July 2026 preferences PDF' }]);
    const result = await triageLinks({
      agency: 'AKO',
      watermark: '2026-06-10',
      links,
      client,
      model: 'test-model',
    });
    expect(result).toEqual([{ url: links[0]!.url, why: 'July 2026 preferences PDF' }]);
  });

  it('drops a url the model invented', async () => {
    const client = fakeClient([
      { url: links[0]!.url, why: 'real' },
      { url: 'https://ako.sk/2026/08/does-not-exist.pdf', why: 'hallucinated' },
    ]);
    const result = await triageLinks({
      agency: 'AKO',
      watermark: '2026-06-10',
      links,
      client,
      model: 'test-model',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe(links[0]!.url);
  });

  it('returns an empty array when the model returns nothing', async () => {
    const client = fakeClient([]);
    const result = await triageLinks({
      agency: 'AKO',
      watermark: null,
      links,
      client,
      model: 'test-model',
    });
    expect(result).toEqual([]);
  });

  it('returns an empty array without calling the model when there are no links', async () => {
    const client = fakeClient([]);
    const result = await triageLinks({
      agency: 'AKO',
      watermark: null,
      links: [],
      client,
      model: 'test-model',
    });
    expect(result).toEqual([]);
    expect(client.parseJson).not.toHaveBeenCalled();
  });

  it('returns an empty array when the model returns null', async () => {
    const client: ModelClient = { parseJson: vi.fn().mockResolvedValue(null) };
    const result = await triageLinks({
      agency: 'AKO',
      watermark: null,
      links,
      client,
      model: 'test-model',
    });
    expect(result).toEqual([]);
  });
});
