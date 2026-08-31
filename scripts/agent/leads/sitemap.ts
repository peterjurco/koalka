import * as cheerio from 'cheerio';
import type { HarvestedLink } from './links.ts';

/** Same keywords the triage prompt already looks for — kept in sync deliberately. */
const RELEVANT = /prieskum|preferenci|volebn/i;

/**
 * Extract poll-relevant URLs from an XML sitemap (<loc> entries). A sitemap can list
 * hundreds of unrelated pages (contact, shareholder meetings, other-language content) —
 * filtering here keeps the candidate list on-topic before it ever reaches the triage
 * model. Sitemap entries have no link text, so `text` is always empty.
 */
export function harvestSitemapUrls(xml: string): HarvestedLink[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const seen = new Map<string, HarvestedLink>();

  $('loc').each((_, el) => {
    const url = $(el).text().trim();
    if (url === '' || !RELEVANT.test(url)) return;
    if (!seen.has(url)) seen.set(url, { url, text: '' });
  });

  return [...seen.values()];
}
