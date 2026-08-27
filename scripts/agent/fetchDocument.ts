import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { fetchWithDelay } from '../ingestion/fetch/shared.ts';

export interface FetchedDoc {
  url: string;
  kind: 'html' | 'pdf';
  text: string;
}

/** Visible page text, with the parts that never contain poll numbers removed. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer').remove();
  return $('body')
    .text()
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function looksLikePdf(url: string, contentType: string): boolean {
  if (contentType.toLowerCase().includes('pdf')) return true;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/**
 * Fetch a lead URL as plain text. Rate limiting and User-Agent come from the existing
 * ingestion fetch helper, so the agent is no more aggressive than the current pipeline.
 */
export async function fetchDocument(url: string): Promise<FetchedDoc> {
  const response = await fetchWithDelay(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);

  const contentType = response.headers.get('content-type') ?? '';

  if (looksLikePdf(url, contentType)) {
    const buffer = await response.arrayBuffer();
    const parser = new PDFParse({ data: Buffer.from(buffer) });
    try {
      const result = await parser.getText();
      return { url, kind: 'pdf', text: result.text ?? '' };
    } finally {
      await parser.destroy();
    }
  }

  return { url, kind: 'html', text: htmlToText(await response.text()) };
}
