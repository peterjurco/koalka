import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { resolvePartySlug } from '../../ingestion/normalize/index.ts';
import type { AggregatorRow } from '../types.ts';
import { parseFieldworkRange } from './dateRange.ts';

export interface AggregatorParseResult {
  rows: AggregatorRow[];
  skipped: { text: string; reason: string }[];
  /**
   * Distinct header texts (deduplicated across all tables on the page) that were
   * neither recognised as agency/fieldwork/sample nor resolved to a party slug — e.g.
   * an English-language column label this page uses that resolvePartySlug doesn't know
   * about. Unlike a fully unparseable row, a single unresolved column doesn't stop the
   * row from being parsed — it just silently drops that one value from `results`. This
   * is where that otherwise-invisible gap gets surfaced.
   */
  unresolvedColumns: { header: string }[];
}

/** A raw header/data cell, with its colspan so grouped columns can be expanded. */
interface RawCell {
  text: string;
  colspan: number;
}

/** Column meanings we care about; everything else is either a party or ignored. */
interface ColumnMap {
  agency: number;
  fieldwork: number;
  sample: number | null;
  /** slug per expanded (post-colspan) column index. */
  parties: Map<number, string>;
  /** Total expanded column count a fully-populated data row is expected to occupy. */
  width: number;
  /** Header texts that resolved to neither a known field nor a party slug. */
  unresolvedHeaders: string[];
}

const AGENCY_HEADER = /polling firm|pollster|agency|agent/i;
const FIELDWORK_HEADER = /fieldwork|date|obdobie/i;
const SAMPLE_HEADER = /sample|vzork|^n$/i;
// Wikipedia's "Seat projections" tables reuse the same party columns but hold seat
// counts, not vote shares — a Gov./Opp. seat tally column is the tell. "Scenario"
// tables publish one row per hypothetical coalition redistribution rather than one row
// per real poll result, which breaks the "one row = one published poll" contract this
// module promises its caller. Both are out of scope for a vote-share cross-check.
const SEAT_TABLE_HEADER = /^(gov\.?|opp\.?)$/i;
const SCENARIO_TABLE_HEADER = /scenario/i;

function cellText(text: string): string {
  return text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
}

function rawCellsOf($: cheerio.CheerioAPI, tr: Element): RawCell[] {
  return $(tr)
    .find('th,td')
    .toArray()
    .map((c) => ({
      text: cellText($(c).text()),
      colspan: Number($(c).attr('colspan') ?? 1),
    }));
}

function toNumber(text: string): number | null {
  const cleaned = cellText(text).replace(/\s/g, '').replace(',', '.').replace(/%$/, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function toSampleSize(text: string): number | null {
  const digits = cellText(text).replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
}

/**
 * Expand a header row by colspan into one entry per real column. A grouped cell (e.g.
 * "OĽaNO and Friends" spanning 3 columns for its constituent coalition partners) is
 * expanded using the sub-header row immediately below it, which MediaWiki renders with
 * one cell per member of each group, in the same left-to-right order as the groups.
 */
function expandHeader(
  headerRow: RawCell[],
  subHeaderRow: string[],
): { text: string; groupText: string; isFirstOfGroup: boolean }[] {
  const expanded: { text: string; groupText: string; isFirstOfGroup: boolean }[] = [];
  let subIndex = 0;
  for (const cell of headerRow) {
    if (cell.colspan <= 1) {
      expanded.push({ text: cell.text, groupText: cell.text, isFirstOfGroup: false });
      continue;
    }
    for (let i = 0; i < cell.colspan; i += 1) {
      expanded.push({
        text: subHeaderRow[subIndex] ?? '',
        groupText: cell.text,
        isFirstOfGroup: i === 0,
      });
      subIndex += 1;
    }
  }
  return expanded;
}

function readHeader(headerRow: RawCell[], subHeaderRow: string[]): ColumnMap | null {
  if (headerRow.some((c) => SEAT_TABLE_HEADER.test(c.text))) return null;
  if (headerRow.some((c) => SCENARIO_TABLE_HEADER.test(c.text))) return null;

  const expanded = expandHeader(headerRow, subHeaderRow);
  const map: ColumnMap = {
    agency: -1,
    fieldwork: -1,
    sample: null,
    parties: new Map(),
    width: expanded.length,
    unresolvedHeaders: [],
  };

  expanded.forEach((col, index) => {
    if (map.agency < 0 && AGENCY_HEADER.test(col.text)) {
      map.agency = index;
      return;
    }
    if (map.fieldwork < 0 && FIELDWORK_HEADER.test(col.text)) {
      map.fieldwork = index;
      return;
    }
    if (map.sample == null && SAMPLE_HEADER.test(col.text)) {
      map.sample = index;
      return;
    }
    // A grouped column's own sub-label (e.g. "ZĽ") is tried first; only the first
    // member of the group falls back to the group's own label (e.g. "OĽaNO and
    // Friends"). This fallback-to-first-slot behavior is an *observed* pattern on the
    // current live page, not a guaranteed MediaWiki convention: as of 2026-08-27 it was
    // checked against all 4 occurrences of a grouped header on the page and held every
    // time, but there is no runtime safeguard here — if the page's structure changes,
    // or a future coalition grouping orders its sub-columns differently, this could
    // silently misassign a value to the wrong party. Re-verify against the live page if
    // a new grouped header appears or values here start looking wrong.
    let slug = resolvePartySlug(col.text);
    if (slug == null && col.isFirstOfGroup) slug = resolvePartySlug(col.groupText);
    if (slug != null) {
      map.parties.set(index, slug);
    } else if (col.text !== '') {
      map.unresolvedHeaders.push(col.text);
    }
  });

  if (map.agency < 0 || map.fieldwork < 0 || map.parties.size === 0) return null;
  return map;
}

/**
 * Parse the aggregator's polling table into rows for the watched agencies. Rows that
 * cannot be parsed are reported, never guessed at. Results are keyed by canonical slug
 * via resolvePartySlug, so this module holds no party knowledge of its own.
 */
export function parseAggregatorRows(
  html: string,
  agencies: readonly string[],
): AggregatorParseResult {
  const $ = cheerio.load(html);
  const rows: AggregatorRow[] = [];
  const skipped: { text: string; reason: string }[] = [];
  const unresolvedHeaders = new Set<string>();

  $('table').each((_, table) => {
    const trs = $(table).find('tr').toArray();
    if (trs.length < 2) return;

    const headerRow = rawCellsOf($, trs[0]!);
    const subHeaderRow = trs.length > 1 ? rawCellsOf($, trs[1]!).map((c) => c.text) : [];
    const columns = readHeader(headerRow, subHeaderRow);
    if (columns == null) return;
    for (const header of columns.unresolvedHeaders) unresolvedHeaders.add(header);

    for (const tr of trs.slice(1)) {
      const rawCells = rawCellsOf($, tr);
      if (rawCells.length <= columns.fieldwork) continue;

      const agencyText = rawCells[columns.agency]?.text ?? '';
      const agency = agencies.find((a) =>
        agencyText.toLowerCase().includes(a.toLowerCase()),
      );
      if (agency == null) continue;

      const cellSummary = rawCells.map((c) => c.text).join(' | ');

      // A merged cell (colspan > 1) bundles what would otherwise be several columns'
      // worth of values into one — which of the spanned parties it belongs to can't be
      // recovered from the markup, so the row is reported rather than misaligned.
      if (rawCells.some((c) => c.colspan > 1)) {
        skipped.push({
          text: cellSummary,
          reason: 'row contains a merged (colspan) cell; column alignment is ambiguous',
        });
        continue;
      }
      // A row with fewer cells than the header defines is typically a rowspan
      // continuation (agency/date/sample inherited from an earlier row) rather than a
      // genuine, independently-dated poll — skip it instead of misreading a later
      // party's value as an earlier column.
      if (rawCells.length !== columns.width) {
        skipped.push({
          text: cellSummary,
          reason: `row has ${rawCells.length} cells, expected ${columns.width}; likely a rowspan continuation`,
        });
        continue;
      }

      const cells = rawCells.map((c) => c.text);

      const range = parseFieldworkRange(cells[columns.fieldwork] ?? '');
      if (range == null) {
        skipped.push({
          text: cellSummary,
          reason: `unparseable fieldwork cell: "${cells[columns.fieldwork] ?? ''}"`,
        });
        continue;
      }

      const results: Record<string, number> = {};
      for (const [index, slug] of columns.parties) {
        const value = toNumber(cells[index] ?? '');
        if (value != null) results[slug] = value;
      }

      rows.push({
        agency,
        fieldworkStart: range.start,
        fieldworkEnd: range.end,
        sampleSize: columns.sample == null ? null : toSampleSize(cells[columns.sample] ?? ''),
        results,
      });
    }
  });

  return {
    rows,
    skipped,
    unresolvedColumns: [...unresolvedHeaders].map((header) => ({ header })),
  };
}
