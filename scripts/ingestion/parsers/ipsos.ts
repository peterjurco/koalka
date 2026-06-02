import type { FetchedDocument, RawPoll } from '../types.ts';
import type { ParseResult, ParseOptions } from './shared.ts';
import { extractSampleSize, skip, shortName, logVerbosePoll } from './shared.ts';
import { mapResultsToSlugs } from '../normalize/partySlugs.ts';

const AGENCY = 'Ipsos' as const;

/**
 * Ipsos fieldwork date: "v dňoch 16. 3. až 19. 3. 2026 pomocou"
 * Groups: startDay, startMonth, endDay, endMonth, year
 */
const IPSOS_DATE_RE = /v\s+dňoch\s+(\d{1,2})\.\s*(\d{1,2})\.\s+až\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/;

function extractIpsosDateRange(text: string): { start: string; end: string } | null {
  const m = text.replace(/\s+/g, ' ').match(IPSOS_DATE_RE);
  if (!m) return null;
  const [, sd, sm, ed, em, y] = m;
  return {
    start: `${y}-${sm.padStart(2, '0')}-${sd.padStart(2, '0')}`,
    end:   `${y}-${em.padStart(2, '0')}-${ed.padStart(2, '0')}`,
  };
}

/** Lines to skip regardless of content. */
const SKIP_LINE_RE = /volebný model|volebna ucast|volebná účasť|politická strana|tlačová správa|ipsos\s+s\.\s*r|ipsos\.sk|denník\s*n|heydukova|bratislava|public$/i;

/** Party rows we intentionally do not map (coalition names, catch-all buckets). */
const SKIP_PARTY_RE = /^iné\s+strany$|^slovensko\s*\+|^iné\s*$/i;

/**
 * Extract party → percentage from an Ipsos PDF.
 *
 * The PDFs are 3-column trend tables (oldest → newest wave left to right).
 * After linearisation by pdf-parse, each party row is typically one line:
 *   "Progresívne Slovensko 20,5 % 18,8 % 20,6 %"
 * The LAST percentage on the line is the current (most-recent) wave.
 *
 * Results are returned as slug-keyed (pre-resolved) so normalizePoll re-resolution is a no-op.
 */
function extractResultsFromPdfText(text: string): Record<string, number> {
  const results: Record<string, number> = {};
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (SKIP_LINE_RE.test(line)) continue;

    // Collect all "NN,N %" or "NN %" occurrences on this line
    const pctMatches = [...line.matchAll(/(\d{1,2}(?:[,.]\d+)?)\s*%/g)];
    if (pctMatches.length === 0) continue;

    // Party name = everything before the first percentage
    const firstPctIdx = pctMatches[0].index!;
    const name = line.slice(0, firstPctIdx).replace(/\s+/g, ' ').trim();

    if (name.length < 2) continue;
    if (/^\d/.test(name)) continue;
    if (SKIP_PARTY_RE.test(name)) continue;

    // Last percentage = current (most-recent) wave
    const lastMatch = pctMatches[pctMatches.length - 1];
    const pct = parseFloat(lastMatch[1].replace(',', '.'));
    if (pct < 0 || pct > 100) continue;

    // Only include if the name resolves to a known party slug
    const { results: mapped } = mapResultsToSlugs({ [name]: pct });
    if (Object.keys(mapped).length > 0) {
      Object.assign(results, mapped);
    }
  }

  return results;
}

export function parseIpsos(docs: FetchedDocument[], options?: ParseOptions | null): ParseResult {
  const rawPolls: RawPoll[] = [];
  const skips: ParseResult['skips'] = [];
  const verbose = options?.verbose ?? false;

  for (const doc of docs) {
    if (!doc.pdfText) {
      if (verbose) console.log(`  ${shortName(doc.url)} → skipped: no PDF text`);
      continue;
    }

    const text = doc.pdfText;
    const sampleSize = extractSampleSize(text);
    const dateRange = extractIpsosDateRange(text);
    const results = extractResultsFromPdfText(text);

    if (!sampleSize || sampleSize <= 0) {
      const s = skip(AGENCY, doc.url, 'sampleSize not found in PDF');
      skips.push(s);
      if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
      continue;
    }
    if (!dateRange) {
      const s = skip(AGENCY, doc.url, 'Could not determine fieldwork dates in PDF');
      skips.push(s);
      if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
      continue;
    }
    if (Object.keys(results).length < 3) {
      const s = skip(AGENCY, doc.url, `Fewer than 3 parties parsed (got ${Object.keys(results).length})`);
      skips.push(s);
      if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
      continue;
    }

    const poll: RawPoll = {
      agency: AGENCY,
      fieldworkStart: dateRange.start,
      fieldworkEnd: dateRange.end,
      sampleSize,
      sourceUrl: doc.url,
      results,
    };
    rawPolls.push(poll);
    if (verbose) logVerbosePoll(doc.url, doc.sourceType, poll);
  }

  return { rawPolls, skips };
}
