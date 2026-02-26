import * as cheerio from 'cheerio';
import type { FetchedDocument, FetchOptions } from '../types.ts';
import { PIPELINE_CONFIG } from '../config.ts';
import { fetchText, fetchBuffer, delay, shortFetchError } from '../fetch/shared.ts';

/** Parse YYYY-MM from AKO PDF URL path (e.g. /uploads/2020/02/... or /2021/11/...). Returns null if not found. */
function getMonthKeyFromAkoUrl(url: string): string | null {
  const match = url.match(/\/uploads\/(20\d{2})\/(\d{1,2})\//i) ?? url.match(/\/(20\d{2})\/(\d{1,2})\//);
  if (!match) return null;
  const y = match[1];
  const m = match[2].padStart(2, '0');
  return `${y}-${m}`;
}

/** Return true if URL's month is within [dateFrom, dateTo] (when provided). dateFrom/dateTo are YYYY-MM-DD; we compare YYYY-MM. */
function urlInDateRange(monthKey: string | null, options?: FetchOptions | null): boolean {
  if (!options || (!options.dateFrom && !options.dateTo)) return true;
  if (!monthKey) return true;
  if (options.dateFrom != null && options.dateFrom !== '' && monthKey < options.dateFrom.slice(0, 7)) return false;
  if (options.dateTo != null && options.dateTo !== '' && monthKey > options.dateTo.slice(0, 7)) return false;
  return true;
}

/** Extract absolute PDF URLs from list page HTML. Only VOLEBNE (parliamentary) polls from 2020 onward. */
function extractPdfUrls(html: string, baseUrl: string, options?: FetchOptions | null): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const minYear = parseInt(PIPELINE_CONFIG.fieldworkStartMin.slice(0, 4), 10);

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || !href.toLowerCase().endsWith('.pdf')) return;
    try {
      const absolute = new URL(href, baseUrl).href;
      if (!absolute.toUpperCase().includes('VOLEBNE')) return;
      const years = [...absolute.matchAll(/(20\d{2})/g)].map((m) => parseInt(m[1], 10));
      const maxYear = years.length ? Math.max(...years) : 0;
      if (maxYear < minYear) return;
      const monthKey = getMonthKeyFromAkoUrl(absolute);
      if (!urlInDateRange(monthKey, options)) return;
      if (!seen.has(absolute)) seen.add(absolute);
    } catch {
      // ignore invalid URLs
    }
  });

  return Array.from(seen);
}

/**
 * Fetch AKO list page(s), extract PDF links, then fetch each PDF. Returns PDF documents only
 * (list page is not added to docs; it has no poll table).
 * When options.dateFrom/dateTo are set, only PDFs whose URL path month is in that range are fetched.
 */
export async function fetchAKO(options?: FetchOptions | null): Promise<FetchedDocument[]> {
  const docs: FetchedDocument[] = [];
  const pdfUrls = new Set<string>();

  for (const listUrl of PIPELINE_CONFIG.sources.AKO.listUrls) {
    try {
      const html = await fetchText(listUrl);
      for (const url of extractPdfUrls(html, listUrl, options)) {
        pdfUrls.add(url);
      }
    } catch (e) {
      console.warn(`AKO: failed to fetch ${listUrl}: ${shortFetchError(e)}`);
    }
    await delay(PIPELINE_CONFIG.fetchDelayMs);
  }

  for (const pdfUrl of pdfUrls) {
    try {
      const pdfBuffer = await fetchBuffer(pdfUrl);
      docs.push({ url: pdfUrl, pdfBuffer });
    } catch (e) {
      console.warn(`AKO: failed to fetch PDF ${pdfUrl}: ${shortFetchError(e)}`);
    }
    await delay(PIPELINE_CONFIG.fetchDelayMs);
  }

  return docs;
}

/** Fetch a single PDF and return buffer (for use when parser has PDF URLs). */
export async function fetchPdf(url: string): Promise<FetchedDocument> {
  const pdfBuffer = await fetchBuffer(url);
  return { url, pdfBuffer };
}
