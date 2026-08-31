import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { fetchWithDelay } from '../ingestion/fetch/shared.ts';
import { fetchDocument, htmlToText, looksLikePdf, type FetchedDoc } from './fetchDocument.ts';
import { harvestLinks } from './leads/links.ts';

export type ReportPageDecision =
  | { action: 'use-as-is' }
  | { action: 'follow'; url: string };

/**
 * Common boilerplate document names that are never a poll release — privacy/cookie
 * policies, GDPR notices, terms of service. This category is narrow and named nearly
 * identically across virtually every website regardless of language or agency, unlike
 * press-release phrasing, which varies too much to reliably allowlist instead.
 */
const BOILERPLATE_DOCUMENT =
  /privacy|cookie|gdpr|terms.{0,3}(of.{0,3})?(service|use)|kodex|osobn.{0,4}udaj|ochran.{0,4}osobn|zasad/i;

/**
 * Decide whether a fetched HTML report page already contains its own poll data (a table)
 * or should be followed to a linked PDF/CSV release instead. Mirrors what the existing
 * deterministic Focus fetcher does (scripts/ingestion/fetchers/focus.ts): follow only when
 * there is no table AND exactly one PDF/CSV link. An ambiguous page (none, or more than
 * one) is used as-is rather than guessed at — extraction will then report it found no
 * usable data, which surfaces in the PR rather than silently picking the wrong link.
 */
export function decideReportPageAction(html: string, baseUrl: string): ReportPageDecision {
  const $ = cheerio.load(html);
  if ($('table').length > 0) return { action: 'use-as-is' };

  const candidates = harvestLinks(html, baseUrl).filter(
    (link) =>
      /\.(pdf|csv)(\?|$)/i.test(link.url) &&
      !BOILERPLATE_DOCUMENT.test(`${link.url} ${link.text}`),
  );
  if (candidates.length !== 1) return { action: 'use-as-is' };

  return { action: 'follow', url: candidates[0]!.url };
}

/**
 * Fetch a URL exactly once, returning both the parsed FetchedDoc and — for HTML pages —
 * the raw HTML string. fetchDocument.ts doesn't expose raw HTML (it discards it after
 * conversion to text), but resolveLeadDocument's hop-1 structural decision (does the page
 * have a table? a single PDF/CSV link?) needs the raw markup for cheerio, so this
 * duplicates fetchDocument.ts's small PDF-branch here rather than fetching twice.
 */
async function fetchWithRawHtml(url: string): Promise<{ doc: FetchedDoc; html: string | null }> {
  const response = await fetchWithDelay(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);

  const contentType = response.headers.get('content-type') ?? '';

  if (looksLikePdf(url, contentType)) {
    const buffer = await response.arrayBuffer();
    const parser = new PDFParse({ data: Buffer.from(buffer) });
    try {
      const result = await parser.getText();
      return { doc: { url, kind: 'pdf', text: result.text ?? '' }, html: null };
    } finally {
      await parser.destroy();
    }
  }

  const html = await response.text();
  return { doc: { url, kind: 'html', text: htmlToText(html) }, html };
}

/**
 * Fetch a lead URL, following one hop to a linked PDF/CSV when the page itself has no
 * table. Hop 1 is fetched exactly once (via fetchWithRawHtml, reusing its raw HTML for
 * the structural decision instead of re-fetching); hop 2, when triggered, is a second,
 * separate fetch of the follow-up URL. A failure fetching that follow-up URL propagates
 * as a rejected promise rather than silently falling back to the original page — once a
 * page has been judged to have no usable table, the original text is not a meaningful
 * fallback, so masking the failure would only hide a real fetch error behind a vague
 * "no data found" extraction result.
 */
export async function resolveLeadDocument(url: string): Promise<FetchedDoc> {
  const { doc: initial, html } = await fetchWithRawHtml(url);
  if (html == null) return initial; // not HTML (e.g. already a PDF) — nothing to resolve

  const decision = decideReportPageAction(html, url);
  if (decision.action === 'use-as-is') return initial;

  return fetchDocument(decision.url);
}
