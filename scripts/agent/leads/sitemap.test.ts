import { describe, it, expect } from 'vitest';
import { harvestSitemapUrls } from './sitemap.ts';

const XML = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.ipsos.com/sk-sk</loc></url>
  <url><loc>https://www.ipsos.com/sk-sk/contact</loc></url>
  <url><loc>https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-august-2026</loc></url>
  <url><loc>https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-jun-2026</loc></url>
  <url><loc>https://www.ipsos.com/sk-sk/about-us/group-press-releases</loc></url>
</urlset>`;

describe('harvestSitemapUrls', () => {
  it('keeps only poll-relevant urls', () => {
    const links = harvestSitemapUrls(XML);
    expect(links.map((l) => l.url)).toEqual([
      'https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-august-2026',
      'https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-jun-2026',
    ]);
  });

  it('gives every entry empty link text', () => {
    const links = harvestSitemapUrls(XML);
    expect(links.every((l) => l.text === '')).toBe(true);
  });

  it('deduplicates repeated urls', () => {
    const links = harvestSitemapUrls(`<urlset><url><loc>https://x.sk/prieskum-a</loc></url><url><loc>https://x.sk/prieskum-a</loc></url></urlset>`);
    expect(links).toHaveLength(1);
  });

  it('ignores an empty loc', () => {
    const links = harvestSitemapUrls(`<urlset><url><loc></loc></url><url><loc>https://x.sk/prieskum-b</loc></url></urlset>`);
    expect(links).toEqual([{ url: 'https://x.sk/prieskum-b', text: '' }]);
  });

  it('returns an empty array for a sitemap with nothing relevant', () => {
    const links = harvestSitemapUrls(`<urlset><url><loc>https://x.sk/contact</loc></url></urlset>`);
    expect(links).toEqual([]);
  });

  it('returns an empty array for malformed xml rather than throwing', () => {
    expect(() => harvestSitemapUrls('not xml at all')).not.toThrow();
  });
});
