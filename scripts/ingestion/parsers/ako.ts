import type { FetchedDocument } from '../types.ts';
import type { RawPoll } from '../types.ts';
import type { ParseResult, ParseOptions } from './shared.ts';
import { extractSampleSize, extractDateRange, skip, shortName, logVerbosePoll } from './shared.ts';
import { resolvePartySlug } from '../normalize/partySlugs.ts';

const AGENCY = 'AKO' as const;

/** Match a percentage at start of line (e.g. "24,9" or "24,9 21,5 - 28,3") */
const PCT_AT_START = /^\s*(\d{1,2}[,.]\d+)\s/;
/** Match party name then percentage on same line. Prefer number followed by % (main share column), not the first number of 95% interval. */
const NAME_PCT_SAME_LINE = /^(.{3,}?)\s+(\d{1,2}[,.]\d+)%?\s/;
/** Match party name then percentage at end of line (e.g. "Regiók /Aliancia - Maďari. Národnosti. 5,2" with number in the middle of a multi-line block) */
const NAME_PCT_END_OF_LINE = /^(.{3,}?)\s+(\d{1,2}[,.]\d+)%?\s*$/;
/** Percentage value (for cell-by-cell scan) */
const PCT_VALUE = /^(\d{1,2}[,.]\d+)$/;

/** Name that is just a number (with optional %): e.g. "7,2%" or "6,7%" - not a party, use prev line as name */
const NUMBER_LIKE_NAME = /^\d{1,2}[,.]\d+\s*%?\s*$/;

/** Maďarská aliancia: last line of three-line block is "Regióny" (or just that word); merge with previous lines for slug resolution */
function isMagyarRegionyOnly(name: string): boolean {
  const n = name.replace(/\s+/g, ' ').trim().toLowerCase();
  return n === 'regióny' || n === 'regiony';
}

/** Full label for Maďarská aliancia (AKO Nov 2023: percentage can appear *before* the name on one long line) */
const MAGYAR_ALIANCIA_LABEL =
  'Szövetség - Magyarok. Nemzetiségek. Regiók /Aliancia - Maďari. Národnosti. Regióny';
/** Match "X,X%" or "X,X" followed by the Maďarská aliancia block (spaces/newlines normalized) */
const PCT_THEN_MAGYAR_ALIANCIA = new RegExp(
  `(\\d{1,2}[,.]\\d+)\\s*%?\\s*Szövetség\\s*-\\s*Magyarok\\.\\s*Nemzetiségek\\.\\s*Regiók\\s*/?\\s*Aliancia\\s*-\\s*Maďari\\.\\s*Národnosti\\.\\s*Regióny`,
  'i'
);

/** Max lines to merge when building a multi-line party name (e.g. OĽaNO continuation). */
const MAX_PARTY_NAME_LINES = 5;

/**
 * Extract party → percentage from AKO PDF text.
 * Handles three layouts:
 * 1) Same line: "Party name  22,8  19,5-26,1  ..."
 * 2) Two lines: "Party name" then next line "24,9 21,5 - 28,3" (percentage first on its own line).
 *    If the party name wraps (e.g. "OĽaNO a priatelia: ..." then "kandidáti (NEKA), NOVA..."),
 *    we merge up to MAX_PARTY_NAME_LINES previous lines so slug resolution sees "OĽaNO".
 * 3) Table with 2+ spaces as column separator: "HLAS  24,9  21,5  Sloboda  16,2  ..." (alternating name, pct)
 */
function extractResultsFromPdfText(text: string): Record<string, number> {
  const results: Record<string, number> = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const recentLines: string[] = [];

  for (const line of lines) {
    // Same-line: "Party name  XX,X  ..." or "Party name  XX,X" at end of line (e.g. Maďarská aliancia with number in the middle of a three-line block)
    const sameMatch = line.match(NAME_PCT_SAME_LINE) ?? line.match(NAME_PCT_END_OF_LINE);
    if (sameMatch) {
      const name = sameMatch[1].trim().replace(/\s+/g, ' ');
      const value = parseFloat(sameMatch[2].replace(/,/g, '.'));
      const valueValid = value >= 0 && value <= 100;

      // AKO sometimes has "7,2%  5,2  ..." (number then real share): "name" is just "7,2%" - use prev line as party name
      if (NUMBER_LIKE_NAME.test(name) && valueValid && recentLines.length >= 1) {
        const prevLine = recentLines[recentLines.length - 1];
        if (prevLine.length >= 3 && !/^\d/.test(prevLine)) {
          let mergedName = prevLine.replace(/\s+/g, ' ').trim();
          for (let k = 1; k < Math.min(MAX_PARTY_NAME_LINES, recentLines.length); k++) {
            const part = recentLines[recentLines.length - 1 - k].replace(/\s+/g, ' ').trim();
            if (part.length >= 2 && !/^\d/.test(part)) {
              mergedName = part + ' ' + mergedName;
            } else {
              break;
            }
          }
          results[mergedName] = value;
        }
      } else if (valueValid && recentLines.length >= 1 && /^\s*a\s+/i.test(name)) {
        // Continuation line (e.g. "a Za ľudí") - prepend previous line so "Koalícia SLOVENSKO, Kresťanská únia a Za ľudí" resolves
        const prevLine = recentLines[recentLines.length - 1];
        if (prevLine.length >= 2 && !/^\d/.test(prevLine)) {
          const mergedName = (prevLine.replace(/\s+/g, ' ').trim() + ' ' + name.trim()).trim();
          results[mergedName] = value;
        } else {
          if (!/^\d+$/.test(name)) results[name] = value;
        }
      } else if (valueValid && isMagyarRegionyOnly(name) && recentLines.length >= 1) {
        // Three-line block: "Szövetség...", "Regiók /Aliancia...", "Regióny 5,2" → merge so slug resolves to madarska_aliancia
        let mergedName = recentLines[recentLines.length - 1].replace(/\s+/g, ' ').trim() + ' ' + name.trim();
        for (let k = 1; k < Math.min(MAX_PARTY_NAME_LINES, recentLines.length); k++) {
          const part = recentLines[recentLines.length - 1 - k].replace(/\s+/g, ' ').trim();
          if (part.length >= 2 && !/^\d/.test(part)) {
            mergedName = part + ' ' + mergedName;
          } else {
            break;
          }
        }
        results[mergedName.trim()] = value;
      } else if (!/^\d+$/.test(name) && valueValid) {
        results[name] = value;
      }
      recentLines.push(line);
      if (recentLines.length > MAX_PARTY_NAME_LINES) recentLines.shift();
      continue;
    }

    // Two-line: current line starts with percentage; party name was on previous line(s)
    const pctMatch = line.match(PCT_AT_START);
    if (pctMatch && recentLines.length >= 1) {
      const prevLine = recentLines[recentLines.length - 1];
      if (prevLine.length >= 3 && !/^\d/.test(prevLine)) {
        const value = parseFloat(pctMatch[1].replace(/,/g, '.'));
        if (value >= 0 && value <= 100 && !/^\d+$/.test(prevLine)) {
          // Build name from last line only, or merge with earlier lines so long names (e.g. OĽaNO) resolve
          let name = prevLine.replace(/\s+/g, ' ').trim();
          for (let k = 1; k < Math.min(MAX_PARTY_NAME_LINES, recentLines.length); k++) {
            const part = recentLines[recentLines.length - 1 - k].replace(/\s+/g, ' ').trim();
            if (part.length >= 2 && !/^\d/.test(part)) {
              name = part + ' ' + name;
            } else {
              break;
            }
          }
          results[name] = value;
        }
      }
    }
    recentLines.push(line);
    if (recentLines.length > MAX_PARTY_NAME_LINES) recentLines.shift();
  }

  // Post-pass: AKO Nov 2023 has "4,75% Szövetség - Magyarok. ... Regióny" on one long line (pct before name)
  const normalizedText = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
  const magyarMatch = normalizedText.match(PCT_THEN_MAGYAR_ALIANCIA);
  if (magyarMatch) {
    const value = parseFloat(magyarMatch[1].replace(/,/g, '.'));
    if (value >= 0 && value <= 100) {
      results[MAGYAR_ALIANCIA_LABEL] = value;
    }
  }

  // Fallback: if we got very few from line-by-line, try splitting on 2+ spaces (table cells)
  if (Object.keys(results).length < 3) {
    const normalized = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
    const cells = normalized.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    for (let i = 0; i < cells.length - 1; i++) {
      const maybePct = cells[i + 1];
      const m = maybePct.match(PCT_VALUE);
      if (m) {
        const value = parseFloat(m[1].replace(/,/g, '.'));
        if (value >= 0 && value <= 100) {
          const name = cells[i];
          if (name.length >= 2 && !/^\d+$/.test(name)) {
            results[name] = value;
          }
        }
        i++; // skip next cell (we used it as pct)
      }
    }
  }

  return results;
}

/** Strip trailing " 22,1%" or " 22.1%" from a name (cell sometimes includes percentage). */
function stripTrailingPct(name: string): string {
  return name.replace(/\s+\d{1,2}[,.]\d+%?\s*$/, '').trim();
}

/** Map raw name→pct to slug→pct; return mapped results plus list of unmapped names. */
function mapToSlugs(results: Record<string, number>): { bySlug: Record<string, number>; unmapped: string[] } {
  const bySlug: Record<string, number> = {};
  const unmapped: string[] = [];
  for (const [name, pct] of Object.entries(results)) {
    const cleanName = stripTrailingPct(name);
    const slug = resolvePartySlug(cleanName);
    if (slug) {
      bySlug[slug] = (bySlug[slug] ?? 0) + pct;
    } else {
      unmapped.push(name);
    }
  }
  return { bySlug, unmapped };
}

/**
 * Parse AKO documents: HTML list pages (no poll data) or PDF content (tables as text).
 */
export function parseAKO(docs: FetchedDocument[], options?: ParseOptions | null): ParseResult {
  const rawPolls: RawPoll[] = [];
  const skips: ParseResult['skips'] = [];
  const verbose = options?.verbose ?? false;

  for (const doc of docs) {
    if (doc.pdfText) {
      const text = doc.pdfText;
      const sampleSize = extractSampleSize(text);
      const dateRange = extractDateRange(text);
      const rawResults = extractResultsFromPdfText(text);
      const { bySlug: results, unmapped } = mapToSlugs(rawResults);

      if (Object.keys(results).length < 3) {
        const rawCount = Object.keys(rawResults).length;
        const detail =
          rawCount === 0
            ? 'No party/percentage lines detected (check PDF text layout)'
            : `Matched ${rawCount} row(s), ${Object.keys(results).length} mapped to slugs${unmapped.length ? `; unmapped: ${unmapped.slice(0, 10).join(', ')}${unmapped.length > 10 ? '…' : ''}` : ''}`;
        const s = skip(AGENCY, doc.url, `Fewer than 3 parties in PDF text: ${detail}`, { unmapped });
        skips.push(s);
        if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
        continue;
      }
      if (!sampleSize || sampleSize <= 0) {
        const s = skip(AGENCY, doc.url, 'sampleSize not found or invalid in PDF');
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

      const poll: RawPoll = {
        agency: AGENCY,
        fieldworkStart: dateRange.start,
        fieldworkEnd: dateRange.end,
        sampleSize,
        sourceUrl: doc.url,
        results,
      };
      rawPolls.push(poll);
      if (verbose) {
        logVerbosePoll(doc.url, doc.sourceType, poll);
        if (unmapped.length > 0) {
          console.log(`    unmapped: ${unmapped.map((u) => JSON.stringify(u)).join(', ')}`);
        }
      }
    }
    // List page (html only) has no poll table; fetcher now returns only PDF docs, so we don't expect html-only here.
    // If we ever get html-only (e.g. list page still in docs), skip adding a poll and don't log a skip.
  }

  return { rawPolls, skips };
}
