import * as cheerio from 'cheerio';
import { fetchText } from '../ingestion/fetch/shared.ts';
import { fetchDocument, type FetchedDoc } from './fetchDocument.ts';
import { harvestLinks } from './leads/links.ts';

export type ReportPageDecision =
  | { action: 'use-as-is' }
  | { action: 'follow'; url: string };

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

  const candidates = harvestLinks(html, baseUrl).filter((link) =>
    /\.(pdf|csv)(\?|$)/i.test(link.url),
  );
  if (candidates.length !== 1) return { action: 'use-as-is' };

  return { action: 'follow', url: candidates[0]!.url };
}

/**
 * Fetch a lead URL, following one hop to a linked PDF/CSV when the page itself has no
 * table. Falls back to the originally fetched document on any error along the way — a
 * lead is never lost just because the follow-up hop failed.
 */
export async function resolveLeadDocument(url: string): Promise<FetchedDoc> {
  const initial = await fetchDocument(url);
  if (initial.kind !== 'html') return initial;

  let html: string;
  try {
    html = await fetchText(url);
  } catch {
    return initial;
  }

  const decision = decideReportPageAction(html, url);
  if (decision.action === 'use-as-is') return initial;

  try {
    return await fetchDocument(decision.url);
  } catch {
    return initial;
  }
}
