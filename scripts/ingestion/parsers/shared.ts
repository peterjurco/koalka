import type { RawPoll, PollAgency, SkipReason } from '../types.ts';

/** Match "n = 1000", "vzorka 1000", "vzorku tvorilo 1000", "sample size 1000", "N=1000" */
export const SAMPLE_SIZE_PATTERNS = [
  /\b[ns]\s*=\s*(\d[\d\s]*)\b/i,
  /\bvzorku\s+tvorilo\s*(\d[\d\s]*)\b/i,
  /\bvzorka\s*[:\s]*(\d[\d\s]*)\b/i,
  /\bsample\s*(?:size)?\s*[:\s]*(\d[\d\s]*)\b/i,
  /\b(\d[\d\s]{2,})\s*respondent/i,
];

export function extractSampleSize(text: string): number | null {
  const normalized = text.replace(/\s+/g, ' ');
  for (const re of SAMPLE_SIZE_PATTERNS) {
    const m = normalized.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/\s/g, ''), 10);
      if (n > 0 && n < 10_000_000) return n;
    }
  }
  return null;
}

/** Slovak month name (genitive) → number */
const SK_MONTH: Record<string, number> = {
  januára: 1, februára: 2, marca: 3, apríla: 4, mája: 5, júna: 6,
  júla: 7, augusta: 8, septembra: 9, októbra: 10, novembra: 11, decembra: 12,
};

/** Try to find a date range in text. Many AKO variants supported. */
export const DATE_RANGE_PATTERNS = [
  /(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{4})\s*[–\-]\s*(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{4})/,
  /(\d{4})-(\d{2})-(\d{2})\s*[–\-]\s*(\d{4})-(\d{2})-(\d{2})/,
  /** AKO: "17.-19.12. 2020" → same month/year, start day, end day */
  /(\d{1,2})\.-\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{4})/,
  /** AKO: "6.9. – 13.9. 2021" or "10.9 - 16.9. 2024." → day.month - day.month. year */
  /(\d{1,2})\.(\d{1,2})\.?\s*[–\-]\s*(\d{1,2})\.(\d{1,2})\.?\s*(\d{4})\.?/,
  /** AKO: "6. 6. - 9 .6. 2023." → day. month. - day .month. year (space before dot in end) */
  /(\d{1,2})\.\s*(\d{1,2})\.\s*[–\-]\s*(\d{1,2})\s*\.\s*(\d{1,2})\.?\s*(\d{4})\.?/,
  /** AKO: "19. 5. - 26. 5. 2025" (space after dot) */
  /(\d{1,2})\.\s*(\d{1,2})\.\s*[–\-]\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{4})\.?/,
  /** AKO: "9 - 15. 7. 2024." or "7. – 14. 8. 2023." → start day, end day. month. year */
  /(\d{1,2})\.?\s*[–\-]\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{4})\.?/,
  /** AKO: "9 4. – 16 4. 2024." → day month. - day month. year (space instead of dot) */
  /(\d{1,2})\s+(\d{1,2})\.\s*[–\-]\s*(\d{1,2})\s+(\d{1,2})\.?\s*(\d{4})\.?/,
  /** AKO: "7.-17. júla 2020" → day.-day. month_name year */
  /(\d{1,2})\.-\s*(\d{1,2})\.\s*(januára|februára|marca|apríla|mája|júna|júla|augusta|septembra|októbra|novembra|decembra)\s*(\d{4})/i,
];

export function extractDateRange(text: string): { start: string; end: string } | null {
  const normalized = text.replace(/\s+/g, ' ');
  for (let i = 0; i < DATE_RANGE_PATTERNS.length; i++) {
    const re = DATE_RANGE_PATTERNS[i];
    const m = normalized.match(re);
    if (m) {
      if (i === 0 && m[1].length <= 2) {
        const start = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        const end = `${m[6]}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
        return { start, end };
      }
      if (i === 1 && m[0].includes('-') && m[1].length === 4) {
        return { start: `${m[1]}-${m[2]}-${m[3]}`, end: `${m[4]}-${m[5]}-${m[6]}` };
      }
      /** AKO: m[1]=startDay, m[2]=endDay, m[3]=month, m[4]=year */
      if (i === 2) {
        const y = m[4];
        const mo = m[3].padStart(2, '0');
        return {
          start: `${y}-${mo}-${m[1].padStart(2, '0')}`,
          end: `${y}-${mo}-${m[2].padStart(2, '0')}`,
        };
      }
      /** AKO: m[1]=startDay, m[2]=startMonth, m[3]=endDay, m[4]=endMonth, m[5]=year */
      if (i === 3) {
        const y = m[5];
        return {
          start: `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
          end: `${y}-${m[4].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
        };
      }
      /** AKO: "6. 6. - 9 .6. 2023." — same as i===3 */
      if (i === 4) {
        const y = m[5];
        return {
          start: `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
          end: `${y}-${m[4].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
        };
      }
      /** AKO: "19. 5. - 26. 5. 2025" — same as i===3 */
      if (i === 5) {
        const y = m[5];
        return {
          start: `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
          end: `${y}-${m[4].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
        };
      }
      /** AKO: "9 - 15. 7. 2024." or "7. – 14. 8. 2023." → start day, end day. month. year */
      if (i === 6) {
        const y = m[4];
        const mo = m[3].padStart(2, '0');
        return {
          start: `${y}-${mo}-${m[1].padStart(2, '0')}`,
          end: `${y}-${mo}-${m[2].padStart(2, '0')}`,
        };
      }
      /** AKO: "9 4. – 16 4. 2024." → day month - day month year */
      if (i === 7) {
        const y = m[5];
        return {
          start: `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
          end: `${y}-${m[4].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
        };
      }
      /** AKO: "7.-17. júla 2020" → start day, end day, month name, year */
      if (i === 8) {
        const monthKey = m[3].toLowerCase();
        const moNum = SK_MONTH[monthKey];
        if (moNum == null) return null;
        const y = m[4];
        const mo = String(moNum).padStart(2, '0');
        return {
          start: `${y}-${mo}-${m[1].padStart(2, '0')}`,
          end: `${y}-${mo}-${m[2].padStart(2, '0')}`,
        };
      }
    }
  }
  return null;
}

export interface ParseResult {
  rawPolls: RawPoll[];
  skips: SkipReason[];
}

export interface ParseOptions {
  verbose?: boolean;
}

/** Short label for a document URL (for verbose logs). */
export function shortName(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (last) return last;
    return u.hostname || url;
  } catch {
    return url.slice(-60) || url;
  }
}

/** One-line summary of a raw poll (legacy / non-verbose). */
export function formatRawPollForLog(poll: RawPoll): string {
  const results = Object.entries(poll.results)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  const more = Object.keys(poll.results).length > 8 ? '…' : '';
  return `fieldwork ${poll.fieldworkStart}–${poll.fieldworkEnd}, n=${poll.sampleSize}, ${results}${more}`;
}

/**
 * Verbose log: document URL + source type, then raw extracted data (one party per line).
 * Results are shown as extracted (raw party names/labels), not normalized.
 */
export function logVerbosePoll(
  docUrl: string,
  sourceType: 'csv' | 'pdf' | 'html' | undefined,
  poll: RawPoll,
): void {
  const typeLabel = sourceType ?? 'unknown';
  console.log(`  Document: ${docUrl} (${typeLabel})`);
  console.log(`  fieldwork ${poll.fieldworkStart} – ${poll.fieldworkEnd}, n=${poll.sampleSize}`);
  console.log('  Raw results:');
  const entries = Object.entries(poll.results).sort((a, b) => b[1] - a[1]);
  for (const [name, value] of entries) {
    console.log(`    ${name}: ${value}%`);
  }
  console.log('');
}

export function skip(agency: PollAgency, url: string, reason: string, context?: unknown): SkipReason {
  return { url, agency, reason, context };
}
