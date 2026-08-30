import { describe, it, expect, vi, afterEach } from 'vitest';
import { decideReportPageAction, resolveLeadDocument } from './resolveDocument.ts';

describe('decideReportPageAction', () => {
  it('uses the page as-is when it already has a table', () => {
    const html = '<body><table><tr><td>PS</td><td>20,8</td></tr></table></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'use-as-is',
    });
  });

  it('follows a single PDF link when the page has no table', () => {
    const html = '<body><a href="/tlacova-sprava.pdf">Tlačová správa</a></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'follow',
      url: 'https://example.sk/tlacova-sprava.pdf',
    });
  });

  it('follows a single CSV link when the page has no table', () => {
    const html = '<body><a href="/data.csv">Stiahnuť údaje</a></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'follow',
      url: 'https://example.sk/data.csv',
    });
  });

  it('uses the page as-is when there is no table and no PDF/CSV link', () => {
    const html = '<body><p>No data here.</p></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'use-as-is',
    });
  });

  it('uses the page as-is when multiple PDF/CSV links make the choice ambiguous', () => {
    const html = '<body><a href="/a.pdf">A</a><a href="/b.pdf">B</a></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'use-as-is',
    });
  });

  it('treats even an empty table as having its own data structure, never overriding it', () => {
    const html = '<body><table></table><a href="/x.pdf">X</a></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'use-as-is',
    });
  });
});

/** Minimal Response-like stub covering exactly what fetchWithDelay/fetchDocument touch. */
function fakeResponse(opts: { ok?: boolean; status?: number; contentType?: string; body?: string }): Response {
  const { ok = true, status = 200, contentType = 'text/html; charset=utf-8', body = '' } = opts;
  return {
    ok,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

describe('resolveLeadDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches the URL exactly once when the page already has a table (use-as-is)', async () => {
    const url = 'https://example.sk/report/';
    const html = '<body><table><tr><td>PS</td><td>20,8</td></tr></table></body>';
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ body: html }));
    vi.stubGlobal('fetch', fetchMock);

    const doc = await resolveLeadDocument(url);

    expect(doc.kind).toBe('html');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(url);
  });

  it('fetches exactly twice (original + followed URL, not three times) when a follow is triggered', async () => {
    const url = 'https://example.sk/report/';
    const followUrl = 'https://example.sk/data.csv';
    const reportHtml = '<body><a href="/data.csv">Stiahnuť údaje</a></body>';
    const followHtml = '<body><table><tr><td>PS</td><td>20,8</td></tr></table></body>';

    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      if (input === url) return fakeResponse({ body: reportHtml });
      if (input === followUrl) return fakeResponse({ body: followHtml });
      throw new Error(`unexpected fetch: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const doc = await resolveLeadDocument(url);

    expect(doc.url).toBe(followUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([url, followUrl]);
  });

  it('propagates a follow-hop fetch failure instead of silently falling back to the original page', async () => {
    const url = 'https://example.sk/report/';
    const followUrl = 'https://example.sk/data.csv';
    const reportHtml = '<body><a href="/data.csv">Stiahnuť údaje</a></body>';

    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      if (input === url) return fakeResponse({ body: reportHtml });
      if (input === followUrl) return fakeResponse({ ok: false, status: 404 });
      throw new Error(`unexpected fetch: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLeadDocument(url)).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
