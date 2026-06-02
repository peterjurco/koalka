import * as cheerio from 'cheerio';
import type { FetchedDocument, FetchOptions } from '../types.ts';
import { PIPELINE_CONFIG } from '../config.ts';
import { fetchText, fetchBuffer, delay, shortFetchError } from '../fetch/shared.ts';

/** Extract YYYY-MM from Ipsos PDF URL path (e.g. /documents/2026-03/ or /text-block/2025-10/). */
function getMonthKeyFromIpsosUrl(url: string): string | null {
  const m = url.match(/\/(\d{4})-(\d{2})\//);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

function urlInDateRange(monthKey: string | null, options?: FetchOptions | null): boolean {
  if (!options || (!options.dateFrom && !options.dateTo)) return true;
  if (!monthKey) return true;
  if (options.dateFrom != null && options.dateFrom !== '' && monthKey < options.dateFrom.slice(0, 7)) return false;
  if (options.dateTo != null && options.dateTo !== '' && monthKey > options.dateTo.slice(0, 7)) return false;
  return true;
}

function extractIpsosPdfUrls(html: string, baseUrl: string, options?: FetchOptions | null): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || !href.toLowerCase().endsWith('.pdf')) return;
    if (!href.includes('sites/default/files')) return;
    try {
      const absolute = new URL(href, baseUrl).href;
      const monthKey = getMonthKeyFromIpsosUrl(absolute);
      if (!urlInDateRange(monthKey, options)) return;
      seen.add(absolute);
    } catch { /* skip invalid URLs */ }
  });
  return Array.from(seen);
}

export async function fetchIpsos(options?: FetchOptions | null): Promise<FetchedDocument[]> {
  const docs: FetchedDocument[] = [];
  const pdfUrls = new Set<string>();

  for (const listUrl of PIPELINE_CONFIG.sources.Ipsos.listUrls) {
    try {
      const html = await fetchText(listUrl);
      for (const url of extractIpsosPdfUrls(html, listUrl, options)) {
        pdfUrls.add(url);
      }
    } catch (e) {
      console.warn(`Ipsos: failed to fetch ${listUrl}: ${shortFetchError(e)}`);
    }
    await delay(PIPELINE_CONFIG.fetchDelayMs);
  }

  // Direct PDF URLs (gap months with no article page)
  for (const directUrl of PIPELINE_CONFIG.sources.Ipsos.directPdfUrls) {
    const monthKey = getMonthKeyFromIpsosUrl(directUrl);
    if (urlInDateRange(monthKey, options)) {
      pdfUrls.add(directUrl);
    }
  }

  for (const pdfUrl of pdfUrls) {
    try {
      const pdfBuffer = await fetchBuffer(pdfUrl);
      docs.push({ url: pdfUrl, pdfBuffer, sourceType: 'pdf' });
    } catch (e) {
      console.warn(`Ipsos: failed to fetch PDF ${pdfUrl}: ${shortFetchError(e)}`);
    }
    await delay(PIPELINE_CONFIG.fetchDelayMs);
  }

  return docs;
}
