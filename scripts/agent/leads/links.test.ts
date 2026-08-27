import { describe, it, expect } from 'vitest';
import { harvestLinks } from './links.ts';

const HTML = `
<html><body>
  <a href="/wp-content/uploads/2026/07/ag.AKO_VOLEBNE-PREF-JUL-2026.pdf">Volebné preferencie júl 2026</a>
  <a href="https://ako.sk/o-agenture/">O agentúre</a>
  <a href="#top">Hore</a>
  <a href="mailto:info@ako.sk">Napíšte nám</a>
  <a href="/wp-content/uploads/2026/07/ag.AKO_VOLEBNE-PREF-JUL-2026.pdf">rovnaký odkaz znova</a>
  <a href="/kontakt"></a>
</body></html>
`;

describe('harvestLinks', () => {
  it('resolves relative hrefs against the page URL', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    expect(links[0]!.url).toBe(
      'https://ako.sk/wp-content/uploads/2026/07/ag.AKO_VOLEBNE-PREF-JUL-2026.pdf',
    );
  });

  it('keeps the link text, collapsed', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    expect(links[0]!.text).toBe('Volebné preferencie júl 2026');
  });

  it('drops mailto and pure-fragment links', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    expect(links.some((l) => l.url.startsWith('mailto:'))).toBe(false);
    expect(links.some((l) => l.url.endsWith('#top'))).toBe(false);
  });

  it('deduplicates by url', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    const pdfs = links.filter((l) => l.url.endsWith('.pdf'));
    expect(pdfs).toHaveLength(1);
  });

  it('keeps a link with no text', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    expect(links.some((l) => l.url === 'https://ako.sk/kontakt')).toBe(true);
  });

  it('returns an empty array for a page with no links', () => {
    expect(harvestLinks('<p>nič</p>', 'https://ako.sk/')).toEqual([]);
  });
});
