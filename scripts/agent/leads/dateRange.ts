/** ISO date range, both ends inclusive. */
export interface DateRange {
  start: string;
  end: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function monthNumber(name: string): number | null {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? null;
}

/** Parse one side of a range. Month and year fall back to the other side's when absent. */
function parseSide(
  part: string,
  fallbackMonth: number | null,
  fallbackYear: number | null,
): string | null {
  const match = /^(\d{1,2})(?:\s+([A-Za-z]+))?(?:\s+(\d{4}))?$/.exec(part);
  if (!match) return null;

  const day = Number(match[1]);
  const month = match[2] != null ? monthNumber(match[2]) : fallbackMonth;
  const year = match[3] != null ? Number(match[3]) : fallbackYear;

  if (month == null || year == null) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parse an aggregator fieldwork cell such as "1–5 Jul 2026", "26 Jun – 1 Jul 2026",
 * "28 Dec 2025 – 3 Jan 2026" or a single "5 Jul 2026". Returns null when the text does
 * not look like a date range at all — the caller reports it rather than guessing.
 */
export function parseFieldworkRange(raw: string): DateRange | null {
  const text = raw
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (text === '') return null;

  const parts = text.split('-').map((p) => p.trim()).filter((p) => p !== '');

  if (parts.length === 1) {
    const day = parseSide(parts[0]!, null, null);
    return day == null ? null : { start: day, end: day };
  }
  if (parts.length !== 2) return null;

  const end = parseSide(parts[1]!, null, null);
  if (end == null) return null;

  const endMonth = Number(end.slice(5, 7));
  const endYear = Number(end.slice(0, 4));

  let start = parseSide(parts[0]!, endMonth, endYear);
  if (start == null) return null;

  // "30 Dec – 3 Jan 2026": the start month is written but its year is not, and taking
  // the end's year puts the start after the end. The range began the previous year.
  if (start > end) {
    start = parseSide(parts[0]!, endMonth, endYear - 1);
    if (start == null || start > end) return null;
  }

  return { start, end };
}
