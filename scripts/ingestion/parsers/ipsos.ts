import * as cheerio from 'cheerio';
import type { FetchedDocument } from '../types.ts';
import type { RawPoll } from '../types.ts';
import type { ParseResult, ParseOptions } from './shared.ts';
import { extractSampleSize, extractDateRange, skip, shortName, logVerbosePoll } from './shared.ts';
import { parseDateToYYYYMMDD } from '../normalize/dates.ts';

const AGENCY = 'Ipsos' as const;

function extractResultsFromTable($: cheerio.CheerioAPI): Record<string, number> {
  const results: Record<string, number> = {};
  $('table tr').each((_, row) => {
    const cells = $(row).find('td, th');
    if (cells.length >= 2) {
      const nameCell = $(cells[0]).text().trim();
      const valueCell = $(cells[1]).text().trim().replace(/,/g, '.');
      const pct = parseFloat(valueCell);
      if (nameCell && !Number.isNaN(pct) && pct >= 0 && pct <= 100) {
        const name = nameCell.replace(/\s+/g, ' ').trim();
        if (!/^\d+$/.test(name)) results[name] = pct;
      }
    }
  });
  return results;
}

/**
 * Parse Ipsos/Denník N HTML: articles with poll tables (same pattern as Focus).
 */
export function parseIpsos(docs: FetchedDocument[], options?: ParseOptions | null): ParseResult {
  const rawPolls: RawPoll[] = [];
  const skips: ParseResult['skips'] = [];
  const verbose = options?.verbose ?? false;

  for (const doc of docs) {
    if (!doc.html) {
      if (verbose) console.log(`  ${shortName(doc.url)} → skipped: no HTML`);
      continue;
    }
    const $ = cheerio.load(doc.html);
    const bodyText = $('body').text();
    const sampleSize = extractSampleSize(bodyText);
    const dateRange = extractDateRange(bodyText);
    const results = extractResultsFromTable($);

    if (Object.keys(results).length < 3) {
      const s = skip(AGENCY, doc.url, 'Fewer than 3 parties in table or no table found');
      skips.push(s);
      if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
      continue;
    }
    if (!sampleSize || sampleSize <= 0) {
      const s = skip(AGENCY, doc.url, 'sampleSize not found or invalid');
      skips.push(s);
      if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
      continue;
    }

    let fieldworkStart: string;
    let fieldworkEnd: string;
    if (dateRange) {
      fieldworkStart = dateRange.start;
      fieldworkEnd = dateRange.end;
    } else {
      const iso = $('meta[property="article:published_time"]').attr('content') ?? '';
      const start = parseDateToYYYYMMDD(iso) ?? (iso.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? iso.slice(0, 10) : null);
      if (!start) {
        const s = skip(AGENCY, doc.url, 'Could not determine fieldwork dates');
        skips.push(s);
        if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
        continue;
      }
      fieldworkStart = start;
      fieldworkEnd = start;
    }

    const poll: RawPoll = {
      agency: AGENCY,
      fieldworkStart,
      fieldworkEnd,
      sampleSize,
      sourceUrl: doc.url,
      results,
    };
    rawPolls.push(poll);
    if (verbose) logVerbosePoll(doc.url, doc.sourceType, poll);
  }

  return { rawPolls, skips };
}
