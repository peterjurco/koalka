import { fetchWithDelay } from '../ingestion/fetch/shared.ts';

/**
 * Some agencies (NMS) publish their full results only inside embedded Flourish charts:
 * the article text names the leading parties, while every party's number lives in the
 * chart's data, which is served as JSON and never appears in the page HTML. This module
 * turns those charts into plain-text tables appended to the document, so extraction and
 * grounding work on them exactly as they do on a PDF table.
 */

const FLOURISH_BASE = 'https://public.flourish.studio/visualisation';

/** A runaway page should not turn into dozens of requests. NMS pages carry up to ~25. */
export const MAX_FLOURISH_CHARTS = 30;

/**
 * Charts that are percentages of something other than the vote — a party's core
 * voters ("volebné jadro"), its potential ("volebný potenciál") and voter-flow matrices
 * ("prelivy voličov"). They print numbers next to the same party names, so leaving them
 * in would let a misread value pass grounding.
 */
const NOT_VOTE_SHARE = /jadro|potenci|preliv/i;

/** Chart ids embedded in the page, in page order, de-duplicated. */
export function findFlourishIds(html: string): string[] {
  const ids = [
    ...html.matchAll(/data-src="visualisation\/(\d+)/g),
    ...html.matchAll(/flourish\.studio\/visualisation\/(\d+)/g),
  ]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((m) => m[1]!);
  return [...new Set(ids)].slice(0, MAX_FLOURISH_CHARTS);
}

/**
 * "19,20%" → "19,2%", "13,00 %" → "13,0%". Flourish data is often padded to two decimals
 * while the agency's own text prints one; the value is the same, and grounding matches a
 * number only as a whole token, so "19,20" would never ground an extracted 19.2.
 */
function trimPaddedDecimal(cell: string): string {
  return cell.trim().replace(/^(\d+)([,.])(\d+?)0+\s*%$/, '$1$2$3%');
}

interface FlourishJson {
  name?: string;
  data?: Record<string, unknown>;
}

function isTable(value: unknown): value is unknown[][] {
  return Array.isArray(value) && value.length > 1 && value.every(Array.isArray);
}

/** One chart as text: a heading with its name, then one " | "-separated line per row. */
export function flourishChartToText(json: FlourishJson): string | null {
  const name = (json.name ?? '').trim();
  if (NOT_VOTE_SHARE.test(name)) return null;

  const tables = Object.values(json.data ?? {}).filter(isTable);
  if (tables.length === 0) return null;

  const lines = [`[Graf: ${name || 'bez názvu'}]`];
  for (const table of tables) {
    for (const row of table) {
      lines.push(row.map((cell) => trimPaddedDecimal(String(cell ?? ''))).join(' | '));
    }
  }
  return lines.join('\n');
}

/**
 * Fetch the page's Flourish charts and render them as text. A chart that fails to load is
 * skipped, never fatal: the article text is still there, and a value that then can't be
 * found shows up as a grounding flag in the PR.
 */
export async function fetchFlourishText(
  html: string,
): Promise<{ text: string; charts: number; failed: number }> {
  const blocks: string[] = [];
  let failed = 0;

  for (const id of findFlourishIds(html)) {
    try {
      const response = await fetchWithDelay(`${FLOURISH_BASE}/${id}/visualisation.json`);
      if (!response.ok) {
        failed++;
        continue;
      }
      const block = flourishChartToText((await response.json()) as FlourishJson);
      if (block != null) blocks.push(block);
    } catch {
      failed++;
    }
  }

  return { text: blocks.join('\n\n'), charts: blocks.length, failed };
}
