import * as cheerio from 'cheerio';
import type { FetchedDocument } from '../types.ts';
import type { RawPoll } from '../types.ts';
import type { ParseResult, ParseOptions } from './shared.ts';
import { extractSampleSize, extractDateRange, skip, shortName, logVerbosePoll } from './shared.ts';
import { parseDateToYYYYMMDD } from '../normalize/dates.ts';

const AGENCY = 'Focus' as const;

/** Focus report URL slug: .../volebne-preferencie-politickych-stran-<month>-<year>/ or ...-<num>-<year>/ */
const FOCUS_SLUG_MONTH: Record<string, number> = {
  januar: 1, január: 1, january: 1,
  februar: 2, február: 2, february: 2,
  marec: 3, march: 3,
  april: 4, apríl: 4, april: 4,
  maj: 5, may: 5,
  jun: 6, jún: 6, june: 6,
  jul: 7, júl: 7, july: 7,
  august: 8, august: 8,
  september: 9, september: 9,
  oktober: 10, október: 10, october: 10,
  november: 11, november: 11,
  december: 12, december: 12,
};

/** Infer fieldwork start/end from Focus report URL (month-year in path). */
function inferDatesFromFocusUrl(url: string): { start: string; end: string } | null {
  const path = url.split('?')[0];
  const slug = path.replace(/\/$/, '').split('/').pop() ?? '';
  const numMatch = slug.match(/-(\d{1,2})-(\d{4})(?:-|$)/);
  if (numMatch) {
    const month = parseInt(numMatch[1], 10);
    const year = parseInt(numMatch[2], 10);
    if (year >= 2015 && year <= 2030 && month >= 1 && month <= 12) {
      const lastDay = new Date(year, month, 0).getDate();
      const y = String(year);
      const m = String(month).padStart(2, '0');
      return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
    }
  }
  const nameMatch = slug.match(/-([a-záíú]+)-(\d{4})(?:-|$)/i);
  if (nameMatch) {
    const key = nameMatch[1].toLowerCase().replace(/í/g, 'i').replace(/ú/g, 'u').replace(/á/g, 'a');
    const month = FOCUS_SLUG_MONTH[key] ?? FOCUS_SLUG_MONTH[nameMatch[1].toLowerCase()];
    const year = parseInt(nameMatch[2], 10);
    if (month && year >= 2015 && year <= 2030) {
      const lastDay = new Date(year, month, 0).getDate();
      const y = String(year);
      const m = String(month).padStart(2, '0');
      return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
    }
  }
  return null;
}

/**
 * Extract party → percentage from Focus PDF (or similar) text.
 * Focus often lists "Strana  XX,X%" or "Strana  XX,X" on same or next line.
 */
function extractResultsFromPdfText(text: string): Record<string, number> {
  const results: Record<string, number> = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let prevLine = '';

  for (const line of lines) {
    const sameMatch = line.match(/^(.{2,}?)\s+(\d{1,2}[,.]\d+)\s*%?\s*(?:\s|$)/);
    if (sameMatch) {
      const name = sameMatch[1].trim().replace(/\s+/g, ' ');
      const value = parseFloat(sameMatch[2].replace(/,/g, '.'));
      if (value >= 0 && value <= 100 && !/^\d+$/.test(name) && name.length >= 2) {
        results[name] = value;
      }
      prevLine = line;
      continue;
    }
    const pctMatch = line.match(/^\s*(\d{1,2}[,.]\d+)\s*%?\s*$/);
    if (pctMatch && prevLine.length >= 2 && !/^\d/.test(prevLine)) {
      const name = prevLine.replace(/\s+/g, ' ').trim();
      const value = parseFloat(pctMatch[1].replace(/,/g, '.'));
      if (value >= 0 && value <= 100 && !/^\d+$/.test(name)) {
        results[name] = value;
      }
    }
    prevLine = line;
  }

  return results;
}

/**
 * Extract party name and percentage from table rows.
 * Expects tables with at least 2 columns: party name and number (%).
 */
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
 * Parse Focus HTML or PDF: look for tables (party results), sample size and dates in text.
 * When doc has pdfText (from "Tlačová správa" PDF), extract results from PDF text.
 */
export function parseFocus(docs: FetchedDocument[], options?: ParseOptions | null): ParseResult {
  const rawPolls: RawPoll[] = [];
  const skips: ParseResult['skips'] = [];
  const verbose = options?.verbose ?? false;

  for (const doc of docs) {
    const bodyText = doc.pdfText ?? (doc.html ? cheerio.load(doc.html)('body').text() : '');
    if (!bodyText) {
      const s = skip(AGENCY, doc.url, 'No HTML or PDF text');
      skips.push(s);
      if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
      continue;
    }

    const sampleSize = extractSampleSize(bodyText);
    const dateRange = extractDateRange(bodyText);

    let results: Record<string, number>;
    if (doc.html) {
      const $ = cheerio.load(doc.html);
      results = extractResultsFromTable($);
      if (Object.keys(results).length < 3 && doc.pdfText) {
        const pdfResults = extractResultsFromPdfText(doc.pdfText);
        if (Object.keys(pdfResults).length >= 3) results = pdfResults;
      }
    } else if (doc.pdfText) {
      results = extractResultsFromPdfText(doc.pdfText);
    } else {
      results = {};
    }

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
    } else if (doc.html) {
      const $ = cheerio.load(doc.html);
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
    } else {
      const urlDates = inferDatesFromFocusUrl(doc.url);
      if (urlDates) {
        fieldworkStart = urlDates.start;
        fieldworkEnd = urlDates.end;
      } else {
        const s = skip(AGENCY, doc.url, 'Could not determine fieldwork dates (PDF)');
        skips.push(s);
        if (verbose) console.log(`  ${shortName(doc.url)} → skipped: ${s.reason}`);
        continue;
      }
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
