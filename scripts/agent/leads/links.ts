import * as cheerio from 'cheerio';

export interface HarvestedLink {
  url: string;
  text: string;
}

/** Link text longer than this is noise in the triage prompt. */
const MAX_TEXT = 200;

/**
 * Every http(s) link on a page, absolute-resolved and deduplicated. Deliberately dumb:
 * deciding which of these is a poll release is the model's job, and keeping this step
 * free of pattern-matching is what makes the agent survive a URL scheme change.
 */
export function harvestLinks(html: string, baseUrl: string): HarvestedLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, HarvestedLink>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    if (href.trim() === '' || href.startsWith('#')) return;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;

    resolved.hash = '';
    const url = resolved.href;
    if (seen.has(url)) return;

    const text = $(element).text().replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    seen.set(url, { url, text });
  });

  return [...seen.values()];
}
