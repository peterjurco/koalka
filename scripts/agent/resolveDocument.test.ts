import { describe, it, expect } from 'vitest';
import { decideReportPageAction } from './resolveDocument.ts';

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
