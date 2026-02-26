/**
 * Parse various date formats to YYYY-MM-DD.
 * Used for fieldworkStart / fieldworkEnd from agency-specific formats.
 */

const YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/;
const DD_MM_YYYY = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;
const DD_MM_YY = /^(\d{1,2})[./](\d{1,2})[./](\d{2})$/;
const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1, január: 1, janúar: 1,
  february: 2, feb: 2, február: 2, február: 2,
  march: 3, mar: 3, marec: 3,
  april: 4, apr: 4, apríl: 4,
  may: 5, máj: 5, maj: 5,
  june: 6, jun: 6, jún: 6, jún: 6,
  july: 7, jul: 7, júl: 7, júl: 7,
  august: 8, aug: 8, august: 8,
  september: 9, sep: 9, sept: 9, september: 9,
  october: 10, oct: 10, október: 10, okt: 10,
  november: 11, nov: 11, november: 11,
  december: 12, dec: 12, december: 12,
};

/**
 * Parse a date string to YYYY-MM-DD. Returns null if unparseable.
 */
export function parseDateToYYYYMMDD(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  let m = s.match(YYYY_MM_DD);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo}-${d!.padStart(2, '0')}`;
  }

  m = s.match(DD_MM_YYYY);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  m = s.match(DD_MM_YY);
  if (m) {
    const [, d, mo, yy] = m;
    const y = parseInt(yy!, 10);
    const year = y >= 50 ? 1900 + y : 2000 + y;
    return `${year}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  const lower = s.toLowerCase();
  for (const [name, month] of Object.entries(MONTH_NAMES)) {
    if (lower.includes(name)) {
      const numMatch = s.match(/(\d{1,2})\s*\.?\s*(\d{4})?/);
      const day = numMatch ? parseInt(numMatch[1]!, 10) : 1;
      const yearMatch = s.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]!, 10) : new Date().getFullYear();
      if (day >= 1 && day <= 31 && year >= 2015 && year <= 2030) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  return null;
}

/** Check if a string is already YYYY-MM-DD. */
export function isYYYYMMDD(s: string): boolean {
  return YYYY_MM_DD.test(s.trim());
}
